#!/usr/bin/env tsx
/**
 * 章节级元分析脚本（阶段 A）
 *
 * 对每本教材的每个**非叶子单元**节点做深度元分析，产出 ChapterPlan：
 *   - unitTheme:        本单元主题（一句话凝练）
 *   - unitObjectives:   教学目标（依据本学科本学段课标）
 *   - kpTypeCatalog:    本单元应抽取的 KP 类型清单（按本单元实际内容定，不套通用模板）
 *   - leafExpectations: 每个叶子课的预期重点 + 难度估计
 *   - difficultyAnchor: 本单元整体难度区间 [low, high]
 *   - subjectFocus:     本学科本学段在本单元的特异点（如"汉语拼音单元强调音准与拼读流畅性"）
 *   - prerequisites:    本单元前置知识（指向更早的章节/学段）
 *   - downstream:       本单元下游延伸（指向后续学段/章节）
 *   - reasoning:        分析理由
 *
 * 走 claude-cli:sonnet（不省配额）。结果存 data/chapter-kp-plans/{treeId}/{chapterId}.json。
 * 断点续传：已有 plan 文件的章节跳过（--force 强制重做）。
 *
 * 用法：
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/chapter-plan-extract.ts \
 *     --tree=<treeId>                # 单本
 *     [--stage="小学" --subject="语文"]  # 学段+学科范围
 *     [--concurrency=2]
 *     [--force]
 *     [--limit=N]                    # 限制处理的章节数（试点用）
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { z } from 'zod'

const __require = createRequire(import.meta.url)
;(globalThis as { require?: NodeRequire }).require = __require

import {
  createClaudeCliCaller,
  inferStage,
  inferSubject,
  type TextbookFullInfo,
} from '../src/index.js'
import type { ChapterNode } from '../src/tree-types.js'
import { extractJSON } from '../src/annotators/knowledge-type.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const TREES_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-trees')
const INDEX_PATH = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-index.json')
const PLANS_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/chapter-kp-plans')

// ============================================================
// ChapterPlan schema (LLM 输出契约)
// ============================================================

export const LeafExpectationSchema = z.object({
  leafId: z.string(),
  leafTitle: z.string().optional(),
  expectedFocus: z.string().min(1).max(400),
  difficultyEstimate: z.number().min(0).max(1),
})

export const ChapterPlanSchema = z.object({
  unitTheme: z.string().min(1).max(300),
  unitObjectives: z.array(z.string().min(1)).min(1).max(15),
  kpTypeCatalog: z.array(z.string().min(1)).min(1).max(25),
  leafExpectations: z.array(LeafExpectationSchema),
  difficultyAnchor: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]),
  subjectFocus: z.string().min(1).max(600),
  prerequisites: z.array(z.string()).max(15),
  downstream: z.array(z.string()).max(15),
  reasoning: z.string().min(1).max(800),
})

export type ChapterPlan = z.infer<typeof ChapterPlanSchema>

// ============================================================
// Prompt
// ============================================================

const SYSTEM_PROMPT = `你是一名资深 K12 课程论与教学法专家，深谙中国国家课程标准（义务教育课程方案2022版 / 普通高中课程方案2020修订版）及各学科课程标准。

任务：对用户提供的"一本教材中的一个章节单元"做深度元分析，产出 ChapterPlan 结构化 JSON。该 plan 将驱动后续基于教材正文的 KnowledgePoint(KP) 抽取——你的元分析将决定下游能否产出准确、覆盖完整的知识点。

最高原则：
1. **每个单元都独一无二**：必须基于该单元的实际标题、所属教材、学段、学科、所含叶子课标题、在教材中的位置，做差异化分析。严禁套用"小学语文都是阅读理解""数学都是数与代数"这种通用模板。
2. **kpTypeCatalog 是这一单元 KP 应有的类型清单**，不是该学科所有可能类型——例：小学语文"汉语拼音"单元的 catalog 应是 ["声母认读"、"韵母认读"、"声韵相拼"、"四声标调"、"整体认读音节"…] 而非 ["阅读理解"、"修辞"]；同年级的"识字"单元 catalog 应是 ["象形字识记"、"字形结构"、"笔画笔顺"、"偏旁部首"…]；"语文园地"单元里的"识字加油站""字词句运用""日积月累""书写提示""和大人一起读"各自的 catalog 又完全不同。
3. **leafExpectations 必须为每个叶子单独写一句"预期重点"**，不是抄叶子标题——例：叶子"1 天地人" 不能预期"学习天地人三字"，应预期"借天地人六字初步识字、了解六合方位、感知韵语形式（'天、地、人，你、我、他'三对偶句）"。难度需依本叶子内容、不是单元平均值。
4. **subjectFocus 写出本学科本学段在本单元的特异点**——如"小学语文一上汉语拼音单元的学科特异点：是拼读流畅性的奠基阶段，KP 应聚焦音节认读，避免过早引入声韵母的语音学概念；与后续识字、阅读的衔接是核心"。
5. **prerequisites / downstream** 列出可读的前置/下游章节名称（如"小学语文一上 识字（一）"、"小学语文二上 识字加油站"），不是泛泛的"小学语文基础"。
6. **难度区间锚定**：低学段（小学一二年级）0.05~0.35，中学段（小学三四 / 初一二）0.2~0.55，高学段（小学五六 / 初三 / 高一）0.4~0.75，高三 0.6~0.95。一个单元内 leaf 间难度可以不同（如语文园地里"识字加油站"和"日积月累"难度不同）。

输出契约（严格 — 字段名必须**逐字**与下面一致，不要自创任何同义字段名）：
- 单一 JSON 对象，不带 markdown 代码块包裹，不带任何额外文字
- JSON 字符串内部出现双引号必须用反斜杠转义为 \\"
- 顶层字段（9 个，固定命名，不可改写）：
    "unitTheme"        : string，本单元主题一句话凝练（≤200 字符）
    "unitObjectives"   : string[]，1~15 条教学目标，行为动词开头
    "kpTypeCatalog"    : string[]，1~25 条 KP 类型名（每条是术语类别名，非句子）
    "leafExpectations" : LeafExpectation[]，与用户提供的叶子清单一一对应（leafId 严格相等）
    "difficultyAnchor" : [low, high]，长度 2 的 number 数组，0 ≤ low ≤ high ≤ 1
    "subjectFocus"     : string，本学科本学段在本单元的特异点（≤600 字符）
    "prerequisites"    : string[]，0~15 条前置章节名
    "downstream"       : string[]，0~15 条下游章节名
    "reasoning"        : string，分析理由（≤800 字符）
- **LeafExpectation 元素字段名（必须**逐字**使用，不要写 difficulty/focus 等简写）**：
    "leafId"              : string，必须与用户提供的 leafId 完全一致（UUID 长串）
    "expectedFocus"       : string，本叶子预期教学重点的一句话（10~400 字符）
    "difficultyEstimate"  : number，0~1 难度估值

完整输出示例（小学语文一上"汉语拼音"单元的 plan）：
{
  "unitTheme": "汉语拼音的系统学习与拼读流畅度奠基",
  "unitObjectives": [
    "认读 23 个声母、24 个韵母和 16 个整体认读音节",
    "学会四声调号的标调位置与读法",
    "掌握两拼音节、三拼音节的拼读方法",
    "能借助拼音独立认读简短词语和句子"
  ],
  "kpTypeCatalog": [
    "声母认读", "韵母认读", "整体认读音节", "声调与标调位置", "两拼音节拼读", "三拼音节拼读", "音节书写规范", "j q x 与 ü 相拼省略两点", "拼音字母四线三格书写"
  ],
  "leafExpectations": [
    {
      "leafId": "abc-123-leaf-uuid",
      "expectedFocus": "认读 ɑ o e 三个单韵母及其四声，掌握四声标调位置规则",
      "difficultyEstimate": 0.18
    }
  ],
  "difficultyAnchor": [0.1, 0.3],
  "subjectFocus": "本单元是小学语文一上拼音奠基阶段，KP 应聚焦音节认读与拼读流畅性，避免过早引入声韵母的语音学概念。与后续识字、独立阅读的衔接为核心。",
  "prerequisites": ["小学语文一上 我上学了"],
  "downstream": ["小学语文一上 课文（借助拼音读句子）", "小学语文一下 识字加油站"],
  "reasoning": "本单元覆盖完整拼音体系，按声母→韵母→音节认读→拼读→标调的顺序展开，每课聚焦一组音素的认读与四声练习。"
}

任何字段缺失、命名错误、类型错误，视为失败。`

interface ChapterPlanInput {
  textbookTitle: string
  stage: string
  subject: string
  chapterPath: string[]
  unitTitle: string
  leaves: Array<{ leafId: string; leafTitle: string }>
  siblingUnits: string[]
  textbookOverview: string
}

function buildUserPrompt(input: ChapterPlanInput): string {
  const leavesList = input.leaves
    .map((l, i) => `  ${i + 1}. [${l.leafId}] ${l.leafTitle}`)
    .join('\n')
  const siblings = input.siblingUnits.length > 0
    ? input.siblingUnits.map((s, i) => `  ${i + 1}. ${s}`).join('\n')
    : '  (无)'
  return `教材：${input.textbookTitle}
学段：${input.stage}
学科：${input.subject}
单元位置：${input.chapterPath.join(' › ')} › 【${input.unitTitle}】
教材总览（顶层单元一览）：${input.textbookOverview}
本单元在本册的兄弟单元（用于理解本单元定位）：
${siblings}

本单元包含的叶子课（必须一一对应 leafExpectations）：
${leavesList}

请按 system 指令输出本单元的 ChapterPlan JSON。`
}

// ============================================================
// 章节遍历：找出所有"非叶子单元"
// ============================================================

interface UnitToProcess {
  treeId: string
  chapterId: string
  chapterPath: string[]
  unitTitle: string
  unitNode: ChapterNode
  leaves: Array<{ leafId: string; leafTitle: string }>
}

function collectUnits(tree: TextbookFullInfo): UnitToProcess[] {
  const out: UnitToProcess[] = []
  function walk(nodes: ChapterNode[], path: string[]): void {
    for (const n of nodes) {
      const kids = n.child_nodes ?? []
      if (kids.length === 0) continue
      // 该节点是"非叶子单元"。收集其下所有叶子（含深层）。
      const myLeaves: Array<{ leafId: string; leafTitle: string }> = []
      function collectLeavesUnder(nn: ChapterNode[]): void {
        for (const x of nn) {
          const xk = x.child_nodes ?? []
          if (xk.length === 0) myLeaves.push({ leafId: x.id, leafTitle: x.title })
          else collectLeavesUnder(xk)
        }
      }
      collectLeavesUnder(kids)
      out.push({
        treeId: '',
        chapterId: n.id,
        chapterPath: path,
        unitTitle: n.title,
        unitNode: n,
        leaves: myLeaves,
      })
      // 继续向下递归，子单元也是独立 unit
      walk(kids, [...path, n.title])
    }
  }
  walk(tree.chapterTree, [tree.textbookTitle])
  return out
}

// ============================================================
// CLI 参数
// ============================================================

interface CliArgs {
  treeIds: string[] | null
  stage: string | null
  subject: string | null
  concurrency: number
  force: boolean
  limit: number | null
  model: string
}

function parseArgs(argv: string[]): CliArgs {
  const opts: Record<string, string> = {}
  const flags: Set<string> = new Set()
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq < 0) flags.add(a.slice(2))
    else opts[a.slice(2, eq)] = a.slice(eq + 1)
  }
  return {
    treeIds: opts.tree ? opts.tree.split(',').map((s) => s.trim()).filter(Boolean) : null,
    stage: opts.stage ?? null,
    subject: opts.subject ?? null,
    concurrency: Math.max(1, parseInt(opts.concurrency ?? '2', 10) || 2),
    force: flags.has('force'),
    limit: opts.limit ? parseInt(opts.limit, 10) || null : null,
    model: opts.model ?? 'claude-cli:sonnet',
  }
}

// ============================================================
// 教材索引加载
// ============================================================

interface IndexEntry {
  id: string
  title: string
  stage: string
  subject: string
}

function loadIndex(): IndexEntry[] {
  const raw = JSON.parse(readFileSync(INDEX_PATH, 'utf-8')) as { entries: IndexEntry[] }
  return raw.entries
}

function loadTree(treeId: string): TextbookFullInfo {
  const f = resolve(TREES_DIR, `${treeId}.json`)
  return JSON.parse(readFileSync(f, 'utf-8')) as TextbookFullInfo
}

// ============================================================
// 主逻辑
// ============================================================

async function processUnit(
  unit: UnitToProcess,
  textbookTitle: string,
  stage: string,
  subject: string,
  siblingUnits: string[],
  textbookOverview: string,
  callLLM: ReturnType<typeof createClaudeCliCaller>,
  model: string,
): Promise<{ ok: true; plan: ChapterPlan } | { ok: false; reason: string }> {
  const input: ChapterPlanInput = {
    textbookTitle,
    stage,
    subject,
    chapterPath: unit.chapterPath,
    unitTitle: unit.unitTitle,
    leaves: unit.leaves,
    siblingUnits,
    textbookOverview,
  }
  const userPrompt = buildUserPrompt(input)
  let raw = ''
  try {
    raw = await callLLM({
      prompt: userPrompt,
      system: SYSTEM_PROMPT,
      model,
      apiKey: '',
    })
    const parsed = extractJSON(raw)
    const plan = ChapterPlanSchema.parse(parsed)
    // 一一对应校验：leafExpectations 应覆盖所有叶子
    const leafIds = new Set(unit.leaves.map((l) => l.leafId))
    const planLeafIds = new Set(plan.leafExpectations.map((e) => e.leafId))
    const missing = [...leafIds].filter((id) => !planLeafIds.has(id))
    if (missing.length > 0) {
      return { ok: false, reason: `leafExpectations 缺失 ${missing.length} 个叶子: ${missing.slice(0, 3).join(',')}…` }
    }
    return { ok: true, plan }
  } catch (e) {
    const msg = (e as Error).message ?? String(e)
    if (/Claude CLI 退出码 1: $/.test(msg) || /exit code 1[^\n]*stderr=$/.test(msg)) {
      return { ok: false, reason: 'QUOTA-WALL' }
    }
    if (raw) {
      try {
        const dumpDir = resolve(PLANS_DIR, '_failures')
        mkdirSync(dumpDir, { recursive: true })
        const fname = resolve(dumpDir, `${unit.chapterId.slice(0, 12)}-${Date.now()}.txt`)
        writeFileSync(fname, `[unit] ${unit.unitTitle}\n[reason] ${msg.slice(0, 500)}\n---RAW---\n${raw}`, 'utf-8')
      } catch { /* ignore */ }
    }
    return { ok: false, reason: msg.slice(0, 200) }
  }
}

function planFilePath(treeId: string, chapterId: string): string {
  return resolve(PLANS_DIR, treeId, `${chapterId}.json`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  console.log('[chapter-plan-extract] args:', args)

  const index = loadIndex()

  // 筛选要处理的教材
  let entries = index
  if (args.treeIds) entries = entries.filter((e) => args.treeIds!.includes(e.id))
  if (args.stage) entries = entries.filter((e) => e.stage === args.stage)
  if (args.subject) entries = entries.filter((e) => e.subject === args.subject)
  console.log(`[chapter-plan-extract] 命中教材 ${entries.length} 本`)

  if (entries.length === 0) {
    console.log('[chapter-plan-extract] 无匹配教材, 退出')
    return
  }

  // 收集所有要处理的 unit（去重 by chapterId）
  interface UnitWithCtx {
    unit: UnitToProcess
    textbookTitle: string
    stage: string
    subject: string
    siblingUnits: string[]
    textbookOverview: string
  }
  const allUnits: UnitWithCtx[] = []
  for (const entry of entries) {
    let tree: TextbookFullInfo
    try { tree = loadTree(entry.id) } catch { continue }
    const units = collectUnits(tree)
    const topLevelTitles = tree.chapterTree.map((n) => n.title)
    const textbookOverview = topLevelTitles.join(' / ')
    for (const u of units) {
      u.treeId = entry.id
      const siblingUnits = u.chapterPath.length === 1
        ? topLevelTitles.filter((t) => t !== u.unitTitle)
        : []
      allUnits.push({
        unit: u,
        textbookTitle: entry.title,
        stage: entry.stage || inferStage(entry.title),
        subject: entry.subject || inferSubject(entry.title),
        siblingUnits,
        textbookOverview,
      })
    }
  }
  console.log(`[chapter-plan-extract] 共 ${allUnits.length} 个非叶子单元待分析`)

  // resume：跳过已有 plan 文件的单元（除非 --force）
  const todo = args.force
    ? allUnits
    : allUnits.filter((u) => !existsSync(planFilePath(u.unit.treeId, u.unit.chapterId)))
  const skipped = allUnits.length - todo.length
  console.log(`[chapter-plan-extract] 已跳过 ${skipped} 个已有 plan, 实际待处理 ${todo.length} 个`)

  const tasks = args.limit ? todo.slice(0, args.limit) : todo
  if (args.limit) console.log(`[chapter-plan-extract] --limit=${args.limit}, 截取 ${tasks.length}/${todo.length}`)

  if (tasks.length === 0) {
    console.log('[chapter-plan-extract] 无任务, 退出')
    return
  }

  const callLLM = createClaudeCliCaller({ timeoutMs: 480_000 })
  const counters = { ok: 0, failed: 0, quotaWall: false }
  const startedAt = Date.now()

  // 并发执行
  let cursor = 0
  async function worker(wid: number): Promise<void> {
    while (true) {
      if (counters.quotaWall) return
      const idx = cursor++
      if (idx >= tasks.length) return
      const t = tasks[idx]!
      const label = `${idx + 1}/${tasks.length}`
      try {
        const r = await processUnit(
          t.unit, t.textbookTitle, t.stage, t.subject,
          t.siblingUnits, t.textbookOverview, callLLM, args.model,
        )
        if (r.ok) {
          const out = planFilePath(t.unit.treeId, t.unit.chapterId)
          mkdirSync(dirname(out), { recursive: true })
          writeFileSync(out, JSON.stringify({
            treeId: t.unit.treeId,
            chapterId: t.unit.chapterId,
            unitTitle: t.unit.unitTitle,
            chapterPath: t.unit.chapterPath,
            textbookTitle: t.textbookTitle,
            stage: t.stage,
            subject: t.subject,
            generatedAt: new Date().toISOString(),
            model: args.model,
            plan: r.plan,
          }, null, 2), 'utf-8')
          counters.ok++
          const ll = r.plan.leafExpectations.length
          const kc = r.plan.kpTypeCatalog.length
          console.log(`[OK] w${wid} (${label}) "${t.unit.unitTitle}" @ ${t.textbookTitle.slice(0, 20)}  KP类型=${kc}  叶子=${ll}`)
        } else if (r.reason === 'QUOTA-WALL') {
          counters.quotaWall = true
          console.error(`[QUOTA-WALL] w${wid} (${label}) "${t.unit.unitTitle}" :: 配额耗尽, 立即停止 (剩余走 resume)`)
          return
        } else {
          counters.failed++
          console.error(`[FAIL] w${wid} (${label}) "${t.unit.unitTitle}" :: ${r.reason}`)
        }
      } catch (e) {
        counters.failed++
        console.error(`[ERR] w${wid} (${label}) "${t.unit.unitTitle}" :: ${(e as Error).message}`)
      }
    }
  }

  const workers = Array.from({ length: args.concurrency }, (_, i) => worker(i + 1))
  await Promise.all(workers)

  const dur = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log('\n========== chapter-plan-extract 完成 ==========')
  console.log(`成功:       ${counters.ok}`)
  console.log(`失败:       ${counters.failed}`)
  if (counters.quotaWall) console.log('⚠ 配额墙: 已停止, 配额重置后重跑同样命令 resume 续做')
  console.log(`总耗时:     ${dur}s`)
  console.log('===============================================')
}

main().catch((e) => {
  console.error('[chapter-plan-extract] 致命错误:', e)
  process.exit(1)
})
