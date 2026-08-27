#!/usr/bin/env tsx
/**
 * 批量 KP 抽取脚本
 *
 * 针对一组教材范围一键抽完所有 leaf 的 KP 并入库。
 * 支持 --resume (默认开启) 跳过已抽过 KP 的 leaf, 支持多进程并发 (sqlite BUSY 重试)。
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/batch-kp-extract.ts \
 *     --stage="小学" --subject="语文" --concurrency=2 --model=claude-cli:sonnet
 *
 * 4 进程并行时按 --subject 切分。
 */

import { readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

// shim 全局 require, 兼容 shared-types 里的 `eval('require')('node:crypto')`
// (那段代码是为了规避 webpack client bundle 时静态拽 node:crypto, 但 tsx ESM 下 require 不存在)
const __require = createRequire(import.meta.url)
;(globalThis as { require?: NodeRequire }).require = __require

import {
  ensureKnowledgePointTables,
  findKpByCanonicalHash,
  insertCluster,
  insertKnowledgePoint,
  insertSourceRefs,
  linkChapterNodeKp,
  openSqliteRaw,
} from '@maolab/db'
import {
  computeCanonicalHash,
  newClusterId,
  newKpId,
  type KnowledgePoint,
  type KnowledgePointCluster,
  type SourceRef,
} from '@maolab/shared-types'

import {
  collectLeaves,
  createClaudeCliCaller,
  createZhipuCaller,
  createQwenCaller,
  createKnowledgePointExtractionAnnotator,
  inferStage,
  inferSubject,
  indexLessonsByChapterId,
  loadCachedSegments,
  tokenAccumulator,
  type AnnotationContext,
  type TextbookFullInfo,
  type TextbookEntry,
  type TextbookIndex,
} from '../src/index.js'

import { validateKp } from './kp-validator.js'

// repo root = scripts/../../../  (this file: packages/textbook-index/scripts/batch-kp-extract.ts)
const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const TREES_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-trees')
const INDEX_PATH = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-index.json')
const DB_PATH = resolve(REPO_ROOT, 'data/maolab.db')
const PLANS_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/chapter-kp-plans')

// 从 plan 文件中提取 unitPlan ctx 注入（按 leaf 找最近非叶子祖先 id）
interface ChapterPlanFile {
  chapterId: string
  unitTitle: string
  plan: {
    unitTheme: string
    kpTypeCatalog: string[]
    subjectFocus: string
    difficultyAnchor: [number, number]
    leafExpectations: Array<{ leafId: string; expectedFocus: string; difficultyEstimate: number }>
  }
}

/** 建立 leafId → 最近非叶子祖先 chapterId 的映射（按 tree 结构 walk） */
function buildLeafToUnit(tree: TextbookFullInfo): Map<string, string> {
  const out = new Map<string, string>()
  function walk(nodes: Array<{ id: string; title: string; child_nodes?: unknown }>, nearestUnitId: string | null): void {
    for (const n of nodes) {
      const kids = (n.child_nodes as Array<{ id: string; title: string; child_nodes?: unknown }>) ?? []
      if (kids.length === 0) {
        if (nearestUnitId) out.set(n.id, nearestUnitId)
      } else {
        walk(kids, n.id)
      }
    }
  }
  walk(tree.chapterTree as unknown as Array<{ id: string; title: string; child_nodes?: unknown }>, null)
  return out
}

/** 加载某 tree 下的所有 chapter plan → chapterId 索引 */
function loadPlansForTree(treeId: string): Map<string, ChapterPlanFile> {
  const out = new Map<string, ChapterPlanFile>()
  const dir = resolve(PLANS_DIR, treeId)
  if (!existsSync(dir)) return out
  const { readdirSync, readFileSync } = require('node:fs') as typeof import('node:fs')
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue
    try {
      const raw = readFileSync(resolve(dir, f), 'utf-8')
      const obj = JSON.parse(raw) as ChapterPlanFile
      if (obj.chapterId && obj.plan) out.set(obj.chapterId, obj)
    } catch { /* skip */ }
  }
  return out
}

// =============================================================================
// CLI 参数
// =============================================================================

interface CliArgs {
  stages: string[]
  subjects: string[]
  treeId: string | null
  concurrency: number
  model: string
  maxRetries: number
  resume: boolean
  progressFile: string | null
  limit: number | null
  validatorModel: string
  requireSegments: boolean
  skipValidator: boolean
  bodyOnly: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const stages: string[] = []
  const subjects: string[] = []
  const opts: Record<string, string> = {}
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    const key = eq < 0 ? a.slice(2) : a.slice(2, eq)
    const val = eq < 0 ? 'true' : a.slice(eq + 1)
    if (key === 'stage') stages.push(val)
    else if (key === 'subject') subjects.push(val)
    else opts[key] = val
  }
  return {
    stages,
    subjects,
    treeId: opts.tree ?? null,
    concurrency: Math.max(1, parseInt(opts.concurrency ?? '2', 10) || 2),
    model: opts.model ?? 'claude-cli:sonnet',
    maxRetries: Math.max(0, parseInt(opts['max-retries'] ?? '2', 10) || 0),
    resume: opts.resume !== 'false', // default true
    progressFile: opts['progress-file'] ?? null,
    limit: opts.limit ? parseInt(opts.limit, 10) || null : null,
    validatorModel: opts['validator-model'] ?? 'claude-cli:haiku',
    requireSegments: opts['require-segments'] === 'true' || opts['require-segments'] === '',
    skipValidator: opts['skip-validator'] === 'true' || opts['skip-validator'] === '',
    bodyOnly: opts['body-only'] === 'true' || opts['body-only'] === '',
  }
}

// =============================================================================
// 配额墙检测: Claude CLI 退出码 1 且 stderr 为空 = 订阅配额耗尽, 应立即中止
// (有 stderr 内容的退出码1 或 JSON 解析等错误是真错误, 正常重试)
// =============================================================================

function isQuotaWall(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).trim()
  return /退出码\s+1:\s*$/.test(msg)
}

// =============================================================================
// SQLite BUSY 重试
// =============================================================================

function withBusyRetry<T>(fn: () => T, attempts = 5): T {
  for (let i = 0; i < attempts; i++) {
    try {
      return fn()
    } catch (e) {
      const err = e as { code?: string; message?: string }
      const isBusy = err?.code === 'SQLITE_BUSY' || /SQLITE_BUSY/i.test(err?.message ?? '')
      if (isBusy && i < attempts - 1) {
        const wait = 50 + i * 50
        const start = Date.now()
        while (Date.now() - start < wait) {
          // spin
        }
        continue
      }
      throw e
    }
  }
  throw new Error('withBusyRetry: unreachable')
}

// =============================================================================
// Resume: 已抽过 KP 的 leaf id 集
// =============================================================================

type RawDb = ReturnType<typeof openSqliteRaw>

function loadDoneLeafIds(db: RawDb): Set<string> {
  const rows = db
    .prepare(`SELECT DISTINCT chapter_node_id AS id FROM chapter_node_knowledge_points`)
    .all() as Array<{ id: string }>
  return new Set(rows.map((r) => r.id))
}

// =============================================================================
// Leaf 抽取 + 二次校验
// =============================================================================

interface LeafKpDraft {
  canonicalName: string
  canonicalNameEn: string
  aliases: string[]
  subject: string
  curriculumSystem: string
  gradeBand?: string
  dimensions: NonNullable<KnowledgePoint['dimensions']>
  confidence: number
}

interface LeafTask {
  treeId: string
  leafId: string
  title: string
  ctx: AnnotationContext
  ancestorTitles: string[]
}

interface LeafResult {
  task: LeafTask
  ok: boolean
  err?: string
  kpsRaw: LeafKpDraft[]
  kpsKept: LeafKpDraft[]
  filtered: number
}

// =============================================================================
// 入库 (per-leaf 事务 + BUSY 重试)
// =============================================================================

interface LoadOutcome {
  insertedKps: number
  reusedKps: number
}

function loadLeafIntoDb(db: RawDb, treeId: string, result: LeafResult): LoadOutcome {
  const outcome: LoadOutcome = { insertedKps: 0, reusedKps: 0 }
  if (!result.ok || result.kpsKept.length === 0) return outcome

  const tx = db.transaction(() => {
    result.kpsKept.forEach((draft, idx) => {
      const hashInput = {
        canonicalNameEn: draft.canonicalNameEn,
        subject: draft.subject,
      }
      const canonicalHash = computeCanonicalHash(
        draft.gradeBand ? { ...hashInput, gradeBand: draft.gradeBand } : hashInput,
      )
      const existing = findKpByCanonicalHash(db, canonicalHash)
      let kpId: string
      if (existing) {
        kpId = existing.id
        outcome.reusedKps++
      } else {
        const now = Date.now()
        const cluster: KnowledgePointCluster = {
          id: newClusterId(),
          canonicalNameEn: draft.canonicalNameEn,
          subject: draft.subject,
          memberKpIds: [],
          createdAt: now,
          updatedAt: now,
        }
        try {
          insertCluster(db, cluster)
        } catch (e) {
          const msg = (e as { message?: string }).message ?? ''
          if (!msg.includes('UNIQUE constraint failed')) throw e
          // cluster 已存在（跨轮次同名概念）：按 (canonicalNameEn, subject) 找到已有 cluster.id
          const existingCluster = (db as unknown as {
            prepare: (sql: string) => { get: (...a: unknown[]) => unknown }
          }).prepare(
            `SELECT id FROM knowledge_point_clusters WHERE canonical_name_en = ? AND subject = ? LIMIT 1`
          ).get(draft.canonicalNameEn, draft.subject) as { id: string } | undefined
          if (!existingCluster) throw e
          cluster.id = existingCluster.id
        }
        // KP 可能已存在（相同 canonicalHash）
        const existingKp = findKpByCanonicalHash(db, canonicalHash)
        if (existingKp) {
          kpId = existingKp.id
          outcome.reusedKps++
        } else {
        kpId = newKpId()
        const kp: KnowledgePoint = {
          id: kpId,
          clusterId: cluster.id,
          canonicalName: draft.canonicalName,
          canonicalNameEn: draft.canonicalNameEn,
          aliases: draft.aliases ?? [],
          subject: draft.subject,
          curriculumSystem: draft.curriculumSystem,
          canonicalHash,
          provenance: { sourceRefs: [] },
          dimensions: draft.dimensions,
          createdAt: now,
          updatedAt: now,
        }
        if (draft.gradeBand) kp.gradeBand = draft.gradeBand
        if (typeof draft.confidence === 'number') kp.confidence = draft.confidence
        insertKnowledgePoint(db, kp)
        outcome.insertedKps++
        } // end: existingKp else
      }

      const ref: SourceRef = {
        kind: 'pep-cn',
        systemId: 'pep-2019',
        textbookId: treeId,
        leafNodeId: result.task.leafId,
        confidence: draft.confidence,
        capturedAt: Date.now(),
      }
      insertSourceRefs(db, kpId, [ref])
      linkChapterNodeKp(db, result.task.leafId, kpId, idx)
    })
  })

  withBusyRetry(() => tx(), 5)
  return outcome
}

// =============================================================================
// 进度报告
// =============================================================================

interface Progress {
  totalLeaves: number
  done: number
  insertedKps: number
  reusedKps: number
  failed: number
  filteredKps: number
  startedAt: number
}

function reportProgress(p: Progress, progressFile: string | null, force = false): void {
  if (!force && p.done % 5 !== 0) return
  const elapsed = ((Date.now() - p.startedAt) / 1000).toFixed(1)
  const line = `[batch-kp-extract] 进度 ${p.done}/${p.totalLeaves} leaves, ${p.insertedKps} KP 入库 (${p.reusedKps} 复用, ${p.filteredKps} 二次校验丢弃), 失败 ${p.failed}, 用时 ${elapsed}s`
  console.log(line)
  if (progressFile) {
    try {
      writeFileSync(progressFile, line + '\n', { encoding: 'utf-8' })
    } catch {
      /* swallow */
    }
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  console.log(`[batch-kp-extract] args:`, args)

  // 1. 加载 index
  const index = JSON.parse(await readFile(INDEX_PATH, 'utf-8')) as TextbookIndex
  const stageSet = new Set(args.stages)
  const subjectSet = new Set(args.subjects)
  const entries = index.entries.filter((e: TextbookEntry) => {
    if (args.treeId && e.id !== args.treeId) return false
    if (stageSet.size > 0 && !stageSet.has(e.stage)) return false
    if (subjectSet.size > 0 && !subjectSet.has(e.subject)) return false
    return true
  })
  console.log(`[batch-kp-extract] 命中教材 ${entries.length} 本`)
  if (entries.length === 0) {
    console.log(`[batch-kp-extract] 无匹配教材, 退出`)
    return
  }

  // 2. 打开 DB + WAL
  const db = openSqliteRaw(DB_PATH)
  ensureKnowledgePointTables(db)
  try {
    db.pragma('journal_mode = WAL')
    db.pragma('busy_timeout = 5000')
  } catch (e) {
    console.warn(`[batch-kp-extract] pragma 设置失败:`, e)
  }

  const doneLeafIds = args.resume ? loadDoneLeafIds(db) : new Set<string>()
  if (args.resume) {
    console.log(`[batch-kp-extract] resume 模式, 已抽过 ${doneLeafIds.size} 个 leaf, 将跳过`)
  }

  // 3. 收集所有 leaf task
  const allTasks: LeafTask[] = []
  let leavesWithBody = 0
  let leavesNoBody = 0
  for (const entry of entries) {
    const treePath = resolve(TREES_DIR, `${entry.id}.json`)
    if (!existsSync(treePath)) {
      console.warn(`[batch-kp-extract] tree 文件不存在, 跳过: ${treePath}`)
      continue
    }
    const tree = JSON.parse(await readFile(treePath, 'utf-8')) as TextbookFullInfo
    const subject = inferSubject(tree.textbookTitle)
    const stage = inferStage(tree.textbookTitle)
    const leaves = collectLeaves(tree.chapterTree)
    const lessonsIdx = indexLessonsByChapterId(tree.nationalLessons ?? [])

    // 加载该树的章节正文切分缓存 (textbook-body-segment 产物); 缺失则全树回退到"仅标题"
    const segCache = await loadCachedSegments(entry.id)
    if (!segCache && args.requireSegments) {
      console.log(`[batch-kp-extract] 跳过无 segments 缓存的树: ${entry.title} (${entry.id})`)
      continue
    }
    const bodyMap = new Map<string, string>()
    if (segCache) {
      for (const s of segCache.segments) {
        if (s.bodyText && s.bodyText.trim()) bodyMap.set(s.leafId, s.bodyText)
      }
    }

    // 加载该树的章节级元分析 plan (chapter-plan-extract 产物); 缺失则全树 unitPlan=undefined
    const leafToUnit = buildLeafToUnit(tree)
    const plans = loadPlansForTree(entry.id)
    let leavesWithPlan = 0

    for (const leaf of leaves) {
      if (doneLeafIds.has(leaf.node.id)) continue
      const bodyText = bodyMap.get(leaf.node.id)
      if (bodyText) leavesWithBody++
      else leavesNoBody++
      if (args.bodyOnly && !bodyText) continue
      const ctx: AnnotationContext = {
        chapterId: leaf.node.id,
        chapterTitle: leaf.node.title,
        subject,
        stage,
        ancestorTitles: leaf.ancestorTitles,
        linkedLessonTitles: lessonsIdx.get(leaf.node.id) ?? [],
        textbookTitle: tree.textbookTitle,
      }
      if (bodyText) ctx.chapterBodyText = bodyText
      // 注入 unitPlan
      const unitId = leafToUnit.get(leaf.node.id)
      if (unitId) {
        const planFile = plans.get(unitId)
        if (planFile) {
          const leafExp = planFile.plan.leafExpectations.find((l) => l.leafId === leaf.node.id)
          ctx.unitPlan = {
            unitTitle: planFile.unitTitle,
            unitTheme: planFile.plan.unitTheme,
            kpTypeCatalog: planFile.plan.kpTypeCatalog,
            subjectFocus: planFile.plan.subjectFocus,
            difficultyAnchor: planFile.plan.difficultyAnchor,
            ...(leafExp ? { leafExpectedFocus: leafExp.expectedFocus, leafDifficultyEstimate: leafExp.difficultyEstimate } : {}),
          }
          leavesWithPlan++
        }
      }
      allTasks.push({
        treeId: entry.id,
        leafId: leaf.node.id,
        title: leaf.node.title,
        ctx,
        ancestorTitles: leaf.ancestorTitles,
      })
    }
  }
  console.log(`[batch-kp-extract] 正文覆盖: ${leavesWithBody} 个 leaf 有教材正文, ${leavesNoBody} 个回退到仅标题`)
  console.log(`[batch-kp-extract] UnitPlan 覆盖: ${allTasks.filter((t) => t.ctx.unitPlan).length} / ${allTasks.length} 个 leaf 有 plan`)

  let tasks = allTasks
  if (args.limit && args.limit > 0 && allTasks.length > args.limit) {
    tasks = allTasks.slice(0, args.limit)
    console.log(`[batch-kp-extract] --limit=${args.limit}, 截取 ${tasks.length}/${allTasks.length} leaf 进行测试`)
  }
  const skipped = (allTasks.length === tasks.length) ? doneLeafIds.size : doneLeafIds.size
  console.log(`[batch-kp-extract] 待抽 leaf ${tasks.length} 个 (已跳过 ${skipped} 个 resume / total)`)

  if (tasks.length === 0) {
    console.log(`[batch-kp-extract] 无待抽 leaf, 退出`)
    db.close()
    return
  }

  // 4. 准备 annotator + llmCall（按 model 前缀选 provider）
  const annotator = createKnowledgePointExtractionAnnotator({ model: args.model })
  const llmCall = args.model.startsWith('zhipu:')
    ? createZhipuCaller(process.env.ZHIPU_API_KEY ?? '')
    : args.model.startsWith('qwen:')
      ? createQwenCaller(process.env.DASHSCOPE_API_KEY ?? '')
      : createClaudeCliCaller({ debug: false, timeoutMs: 180_000 })
  // 内容过滤降级：Zhipu 1301 时回退到 claude-cli:haiku
  const fallbackLlmCall = createClaudeCliCaller({ debug: false, timeoutMs: 180_000 })

  // 5. 并发执行
  const progress: Progress = {
    totalLeaves: tasks.length,
    done: 0,
    insertedKps: 0,
    reusedKps: 0,
    failed: 0,
    filteredKps: 0,
    startedAt: Date.now(),
  }

  let nextIdx = 0
  let aborted = false
  async function worker(workerId: number): Promise<void> {
    while (true) {
      if (aborted) return
      const i = nextIdx++
      if (i >= tasks.length) return
      const task = tasks[i]!
      const result: LeafResult = {
        task,
        ok: false,
        kpsRaw: [],
        kpsKept: [],
        filtered: 0,
      }

      // 5a. 抽取 (带 retry)
      let lastErr: unknown = null
      for (let attempt = 0; attempt <= args.maxRetries; attempt++) {
        // 内容过滤降级：Zhipu 1301 / Qwen 400 inappropriate → claude-cli:haiku
        const isContentFiltered = lastErr instanceof Error && (
          lastErr.message.includes('"code":"1301"') ||
          lastErr.message.includes('inappropriate content')
        )
        const currentLlmCall = isContentFiltered ? fallbackLlmCall : llmCall
        const currentModel = isContentFiltered ? 'claude-cli:haiku' : annotator.model
        if (isContentFiltered && attempt === 1) {
          console.warn(`[CONTENT-FILTER] w${workerId} leaf ${task.leafId.slice(0, 8)} "${task.title}" :: Zhipu 1301，降级 claude-cli:haiku`)
        }
        try {
          const { annotation } = await annotator.annotate(task.ctx, {
            apiKey: '',
            llmCall: currentLlmCall,
            model: currentModel,
          })
          result.ok = true
          result.kpsRaw = annotation.value as LeafKpDraft[]
          break
        } catch (err) {
          lastErr = err
          if (isQuotaWall(err)) {
            aborted = true
            console.error(
              `[QUOTA-WALL] w${workerId} leaf ${task.leafId.slice(0, 8)} "${task.title}" :: Claude CLI 退出码1空stderr=配额耗尽, 立即中止批处理 (剩余走 resume)`,
            )
            break
          }
          if (attempt < args.maxRetries) {
            console.warn(
              `[worker ${workerId}] leaf ${task.leafId.slice(0, 8)} attempt ${attempt + 1} failed, retrying: ${(err as Error).message?.slice(0, 120)}`,
            )
          }
        }
      }

      if (!result.ok) {
        result.err = lastErr instanceof Error ? lastErr.message : String(lastErr)
        progress.failed++
        progress.done++
        console.log(`[FAIL] w${workerId} (${progress.done}/${tasks.length}) ${task.leafId.slice(0, 8)} "${task.title}" :: ${result.err.slice(0, 160)}`)
        reportProgress(progress, args.progressFile)
        continue
      }

      // 5b. 二次校验（可跳过）
      if (args.skipValidator) {
        result.kpsKept = result.kpsRaw
      } else {
        for (const draft of result.kpsRaw) {
          const v = await validateKp(
            {
              leafTitle: task.title,
              ancestorTitles: task.ancestorTitles,
              canonicalName: draft.canonicalName,
              canonicalNameEn: draft.canonicalNameEn,
              subject: draft.subject,
            },
            llmCall,
            args.validatorModel,
          )
          if (v.valid) {
            result.kpsKept.push(draft)
          } else {
            result.filtered++
            console.log(`  [filter] "${draft.canonicalName}" :: ${v.reason.slice(0, 120)}`)
          }
        }
        progress.filteredKps += result.filtered
      }

      // 5c. 入库
      try {
        const outcome = loadLeafIntoDb(db, task.treeId, result)
        progress.insertedKps += outcome.insertedKps
        progress.reusedKps += outcome.reusedKps
      } catch (err) {
        progress.failed++
        console.error(`[DB-FAIL] w${workerId} leaf ${task.leafId.slice(0, 8)}: ${(err as Error).message}`)
      }

      progress.done++
      console.log(
        `[OK] w${workerId} (${progress.done}/${tasks.length}) "${task.title}" raw=${result.kpsRaw.length} kept=${result.kpsKept.length} filtered=${result.filtered}`,
      )
      reportProgress(progress, args.progressFile)
    }
  }

  await Promise.all(Array.from({ length: args.concurrency }, (_, k) => worker(k + 1)))
  reportProgress(progress, args.progressFile, true)

  // 6. 总结
  db.close()
  const elapsed = ((Date.now() - progress.startedAt) / 1000).toFixed(1)
  console.log('')
  console.log(aborted ? '====== batch-kp-extract 因配额墙中止 ======' : '========== batch-kp-extract 完成 ==========')
  if (aborted) {
    console.log(`⚠ 检测到配额墙 (Claude CLI 退出码1空stderr), 已 fail-fast 中止, 未空转剩余 leaf。`)
    console.log(`  配额重置后重跑同样命令即可 (resume 模式自动跳过已抽 ${progress.done - progress.failed} 个)。`)
  }
  console.log(`处理 leaf:        ${progress.done}/${tasks.length}`)
  console.log(`失败 leaf:        ${progress.failed}`)
  console.log(`入库新 KP:        ${progress.insertedKps}`)
  console.log(`复用 KP:          ${progress.reusedKps}`)
  console.log(`二次校验丢弃 KP:  ${progress.filteredKps}`)
  console.log(`总耗时:           ${elapsed}s`)
  const tok = tokenAccumulator
  console.log('')
  console.log('--- Token 消耗统计 ---')
  console.log(`LLM 调用次数:   ${tok.calls}`)
  console.log(`cache_creation: ${tok.cacheCreation.toLocaleString()}`)
  console.log(`cache_read:     ${tok.cacheRead.toLocaleString()}`)
  console.log(`input:          ${tok.input.toLocaleString()}`)
  console.log(`总计 token:     ${tok.total().toLocaleString()}`)
  if (tok.calls > 0) {
    console.log(`均值/call:      ${Math.round(tok.total() / tok.calls).toLocaleString()}`)
    console.log(`均值/leaf:      ${Math.round(tok.total() / progress.done).toLocaleString()}`)
  }
  console.log('==========================================')
}

main().catch((err) => {
  console.error('[batch-kp-extract] FATAL:', err)
  process.exit(1)
})
