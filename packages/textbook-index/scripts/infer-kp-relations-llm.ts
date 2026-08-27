#!/usr/bin/env tsx
/**
 * infer-kp-relations-llm.ts
 *
 * 用 LLM 跨课跨学科推断 KP 关系。比 infer-kp-relations-auto 更强但更慢/贵。
 *
 * 算法:
 *   1. 按 (学科, 学段) 分组所有 KP
 *   2. 每组拆成 batch (默认 80 个 KP / batch, 避免上下文爆)
 *   3. 把 KP 名字 + 学段 + 学科 给 LLM, 让它输出 KP 对关系:
 *      - prerequisite (A 必须在 B 之前学)
 *      - leads-to (A 学完自然到 B)
 *      - related (跨学科联想)
 *   4. 跨学科一次性单独跑: 拿不同学科的 KP 名字交叉提问 (有哪些 cross-subject 联想)
 *   5. 入库 kp_relations, source='llm-inferred'
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/infer-kp-relations-llm.ts \
 *     [--model=claude-cli:sonnet] [--batch-size=80] [--limit-subjects=语文,数学] \
 *     [--limit-grade-bands=高中] [--skip-cross-subject] [--no-clear]
 *
 * ## ⚠️ 默认清空是全局的(2026-07-28)
 *
 * 默认启动时 `clearRelationsBySource(db,'llm-inferred')` —— **全局清空,不受
 * `--limit-subjects` / `--limit-grade-bands` 约束**(清空在前,过滤在后)。
 *
 *     ❌ --limit-subjects=数学
 *        本会删光**所有学科**的边只重建数学。
 *        **现已被 clearSafetyVerdict() 在开库前 fail-closed 拦下,直接退出。**
 *
 *     ✅ --no-clear --limit-subjects=数学 --limit-grade-bands=高中 --skip-cross-subject
 *        只补这一组。已完成的组由 kp_rel_progress 跳过,不重复推断。
 *
 * 原注释写的是「幂等: 启动时清空后重新跑」。**全量重跑时它确实幂等,一旦叠加
 * 范围过滤就变成了删除操作**——「幂等」这个词在这里给了一个错误的安全感。
 *
 * 补注的第一版**只写了上面这段警告就收工**,危险组合照样能执行。Codex 复审判为 P0:
 * 「不能只靠文件头说明规避」。对的——**自己标了 ❌ 还让它能跑,等于把危险留给
 * 下一个不读注释的人**。守卫现在是代码,见 `src/kp-relation-protocol.ts`
 * 的 `clearSafetyVerdict()`,带回归测试。
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
// tsx ESM workaround: shared-types computeCanonicalHash 用了 eval('require')
;(globalThis as { require?: NodeJS.Require }).require ??= createRequire(import.meta.url)

import { openSqliteRaw } from '@maolab/db'
import {
  insertKpRelationBatch,
  clearRelationsBySource,
  countKpRelations,
  type KpRelationRecord,
  type KpRelationType,
} from '@maolab/db'
import {
  buildIndexedList,
  clearSafetyVerdict,
  extractJsonArray,
  resolveIndices,
} from '../src/kp-relation-protocol.js'
import { createClaudeCliCaller } from '../src/claude-cli-provider.js'
import { createQwenCaller } from '../src/qwen-provider.js'
import type { LLMCaller } from '../src/annotation-pipeline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
/**
 * 认 `DATABASE_URL`(与 `scripts/seed-rehearsal-mastery.ts` 一致),缺省仍是真库。
 *
 * 补这个是因为:验证「危险组合被守卫拦下」时,库路径写死意味着**只能拿真库去赌
 * 自己刚写的守卫没 bug**——守住了是运气好,不是做法对。Codex 复审时正是以
 * 「若守卫失效会造成全局删除」为由拒绝在真库上复跑。
 * **没有安全演练的路子,本身就是可测性缺口。** 现在可以:
 *
 *     cp data/maolab.db /tmp/rehearsal.db
 *     DATABASE_URL=file:/tmp/rehearsal.db pnpm ... infer-kp-relations-llm.ts <危险参数>
 */
const DB_PATH = (process.env.DATABASE_URL ?? `file:${resolve(REPO_ROOT, 'data', 'maolab.db')}`)
  .replace(/^file:/, '')

interface Args {
  model: string
  batchSize: number
  limitSubjects: string[] | null
  limitGradeBands: string[] | null
  skipCrossSubject: boolean
  noClear: boolean
}

function parseArgs(): Args {
  const out: Args = {
    model: 'claude-cli:sonnet',
    batchSize: 80,
    limitSubjects: null,
    limitGradeBands: null,
    skipCrossSubject: false,
    noClear: false,
  }
  for (const arg of process.argv.slice(2)) {
    const eq = arg.indexOf('=')
    if (eq < 0) {
      if (arg === '--skip-cross-subject') out.skipCrossSubject = true
      if (arg === '--no-clear') out.noClear = true
      continue
    }
    const k = arg.slice(0, eq).replace(/^--/, '')
    const v = arg.slice(eq + 1)
    if (k === 'model') out.model = v
    else if (k === 'batch-size') out.batchSize = Number.parseInt(v, 10)
    else if (k === 'limit-subjects') out.limitSubjects = v.split(',').map(s => s.trim()).filter(Boolean)
    else if (k === 'limit-grade-bands') out.limitGradeBands = v.split(',').map(s => s.trim()).filter(Boolean)
  }
  return out
}

interface KpRow {
  id: string
  canonical_name: string
  subject: string | null
  grade_band: string | null
}

const SYSTEM_INTRA = `你是 K12 教材知识图谱专家。给你一组同学科同学段的知识点(KP), 输出它们之间最重要的关系。
仅输出 JSON 数组, 每条形如 {"from": 3, "to": 7, "type": "prerequisite|leads-to|related", "evidence": "<= 30 字理由"}。
from/to 用**行号整数**(列表里冒号左边那个数字), 不要写知识点名字, 不要写 id。
不要 markdown / 不要解释 / 不要重复 / 同一对 KP 不要双向都输出。
关系定义:
- prerequisite: from 是 to 的先修(掌握 from 才能学 to), 教学顺序很明确
- leads-to: from 学完自然引出 to (同侧, 较弱)
- related: 主题相关但无先后

只输出真正有教学意义的关系, 宁缺勿滥. 一组 80 个 KP 输出 20-60 条关系合理。`

const SYSTEM_CROSS = `你是 K12 教材跨学科知识联系专家. 给你两个不同学科的 KP 列表, 找出"主题相关"的跨学科 KP 对。
仅输出 JSON 数组, 每条 {"from": <A 列表行号>, "to": <B 列表行号>, "type": "related", "evidence": "<= 30 字"}。
from/to 用**行号整数**, 不要写知识点名字, 不要写 id。
例子:
- 语文"《观潮》" related 物理"潮汐成因"
- 数学"统计图" related 地理"人口分布图"
宁缺勿滥, 一对 50×50 KP 输出 5-20 条合理。仅输出 JSON 数组。`

interface LlmRelation {
  from: string
  to: string
  /** LLM 原样吐回来的字符串,未收窄;落库前经 asRelType() 归一。 */
  type: string
  evidence: string
}

const REL_TYPES: readonly string[] = ['prerequisite', 'leads-to', 'related', 'sibling', 'contains']

/** 协议模块不依赖 db 的枚举(保持可脱库单测),收窄在这道边界上做。 */
function asRelType(v: string): KpRelationType {
  return (REL_TYPES.includes(v) ? v : 'related') as KpRelationType
}


async function inferIntraGroup(
  kps: KpRow[],
  subject: string,
  gradeBand: string,
  llmCall: LLMCaller,
  model: string,
  batchSize: number,
): Promise<{ rels: LlmRelation[]; failedBatches: number; totalBatches: number }> {
  const out: LlmRelation[] = []
  let failedBatches = 0
  let totalBatches = 0
  for (let i = 0; i < kps.length; i += batchSize) {
    const batch = kps.slice(i, i + batchSize)
    totalBatches++
    const prompt = [
      `学科: ${subject} / 学段: ${gradeBand} / 本批 KP ${batch.length} 个(行号: 名称):`,
      buildIndexedList(batch),
      '',
      '输出 JSON 数组. from/to 用行号整数.',
    ].join('\n')
    try {
      const text = await llmCall({ prompt, system: SYSTEM_INTRA, model, apiKey: '' })
      const { rels, outOfRange } = resolveIndices(extractJsonArray(text), batch, batch)
      const drop = outOfRange > 0 ? `, 行号越界丢弃 ${outOfRange}` : ''
      console.log(`[llm-rel] ${subject}/${gradeBand} batch ${totalBatches}: 可用 ${rels.length} 条${drop}`)
      out.push(...rels)
    } catch (e) {
      failedBatches++
      console.error(`[llm-rel] ${subject}/${gradeBand} batch ${totalBatches} failed:`, (e as Error).message)
    }
  }
  return { rels: out, failedBatches, totalBatches }
}

async function inferCrossSubject(
  groupA: { subject: string; kps: KpRow[] },
  groupB: { subject: string; kps: KpRow[] },
  llmCall: LLMCaller,
  model: string,
): Promise<{ rels: LlmRelation[]; ok: boolean }> {
  // 每个学科取前 50 个 KP 做交叉(避免上下文爆)
  const a = groupA.kps.slice(0, 50)
  const b = groupB.kps.slice(0, 50)
  const prompt = [
    `学科 A = ${groupA.subject}, 共 ${a.length} 个 KP(行号: 名称):`,
    buildIndexedList(a),
    '',
    `学科 B = ${groupB.subject}, 共 ${b.length} 个 KP(行号: 名称):`,
    buildIndexedList(b),
    '',
    '找出 A 和 B 之间主题相关的 KP 对. 输出 JSON 数组. from=A 的行号, to=B 的行号, type 必须 related.',
  ].join('\n')
  try {
    const text = await llmCall({ prompt, system: SYSTEM_CROSS, model, apiKey: '' })
    // A、B 是两个不同的行号空间,from 查 a、to 查 b
    const { rels, outOfRange } = resolveIndices(extractJsonArray(text), a, b)
    const drop = outOfRange > 0 ? `, 行号越界丢弃 ${outOfRange}` : ''
    console.log(`[llm-rel] cross ${groupA.subject}↔${groupB.subject}: 可用 ${rels.length} 条${drop}`)
    return { rels, ok: true }
  } catch (e) {
    console.error(`[llm-rel] cross ${groupA.subject}↔${groupB.subject} failed:`, (e as Error).message)
    return { rels: [], ok: false }
  }
}

async function main(): Promise<void> {
  const args = parseArgs()
  console.log('[infer-kp-relations-llm] DB:', DB_PATH, 'model:', args.model)

  // 危险组合在**开库之前**拦掉:注释拦不住不读注释的人,详见 clearSafetyVerdict
  const verdict = clearSafetyVerdict(args)
  if (!verdict.ok) {
    console.error(`[infer-kp-relations-llm] ${verdict.reason}`)
    process.exit(1)
  }

  const db = openSqliteRaw(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  if (!args.noClear) {
    const cleared = clearRelationsBySource(db, 'llm-inferred')
    console.log('[infer-kp-relations-llm] 清旧 llm-inferred:', cleared, '条')
    db.prepare('DROP TABLE IF EXISTS kp_rel_progress').run()
  } else {
    console.log('[infer-kp-relations-llm] --no-clear: 保留已有数据，追加模式')
  }
  // 进度追踪表（断点续跑用）
  db.prepare('CREATE TABLE IF NOT EXISTS kp_rel_progress (group_key TEXT PRIMARY KEY, done_at INTEGER)').run()
  const doneGroups = new Set((db.prepare('SELECT group_key FROM kp_rel_progress').all() as {group_key:string}[]).map(r => r.group_key))

  // 拉所有 KP, 按 (学科, 学段) 分组
  let kpsAll = db.prepare('SELECT id, canonical_name, subject, grade_band FROM knowledge_points').all() as KpRow[]
  if (args.limitSubjects) {
    kpsAll = kpsAll.filter(k => k.subject && args.limitSubjects!.includes(k.subject))
  }
  if (args.limitGradeBands) {
    kpsAll = kpsAll.filter(k => k.grade_band && args.limitGradeBands!.includes(k.grade_band))
  }
  console.log('[infer-kp-relations-llm] 待处理 KP:', kpsAll.length)

  const groups = new Map<string, KpRow[]>()
  for (const k of kpsAll) {
    const key = `${k.subject ?? '?'}|${k.grade_band ?? '?'}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(k)
  }
  console.log('[infer-kp-relations-llm] 分组数:', groups.size)

  const llmCall: LLMCaller = args.model.startsWith('qwen:')
    ? createQwenCaller(process.env.DASHSCOPE_API_KEY ?? '')
    : createClaudeCliCaller({})

  const validIds = new Set(kpsAll.map(k => k.id))
  const now = Date.now()

  /**
   * `complete=false` 时**不写进度表**。
   *
   * 原实现无条件写:高中数学那轮 9 批里 6 批超时、入库 0 条,组照样被标记「已完成」,
   * 此后任何续传都会永远跳过它——**一次失败被记成一次成功**。
   * 进度表的语义必须是「这组确实做完了」,不是「这组被尝试过」。
   */
  function saveRels(rels: LlmRelation[], label: string, complete: boolean): void {
    const records: KpRelationRecord[] = rels
      .filter(r => validIds.has(r.from) && validIds.has(r.to) && r.from !== r.to)
      .map(r => ({
        id: randomUUID(),
        fromKpId: r.from,
        toKpId: r.to,
        relationType: asRelType(r.type),
        weight: r.type === 'prerequisite' ? 0.8 : r.type === 'leads-to' ? 0.6 : 0.5,
        source: 'llm-inferred',
        sourceEvidence: r.evidence,
        createdAt: now,
      }))
    const inserted = insertKpRelationBatch(db, records)
    console.log(`[infer-kp-relations-llm] ${label}: 入库 ${inserted}/${records.length} 条`)
    if (complete) {
      db.prepare('INSERT OR REPLACE INTO kp_rel_progress (group_key, done_at) VALUES (?, ?)').run(label, Date.now())
    } else {
      console.warn(`[infer-kp-relations-llm] ${label}: 本组未完整跑通,**不记进度**,下次会重跑`)
    }
  }

  // 1. 同学科同学段内推断（每组完成即入库，自动跳过已完成组）
  for (const [key, kps] of groups) {
    if (kps.length < 3) continue
    if (doneGroups.has(key)) {
      console.log(`[infer-kp-relations-llm] === ${key} 已完成，跳过 ===`)
      continue
    }
    const [subject, gradeBand] = key.split('|')
    console.log(`[infer-kp-relations-llm] === ${key} (${kps.length} KP) ===`)
    const { rels, failedBatches, totalBatches } = await inferIntraGroup(
      kps, subject!, gradeBand!, llmCall, args.model, args.batchSize,
    )
    if (failedBatches > 0) {
      console.warn(`[infer-kp-relations-llm] ${key}: ${failedBatches}/${totalBatches} 批失败`)
    }
    saveRels(rels, key, failedBatches === 0)
  }

  // 2. 跨学科 related (可选)
  if (!args.skipCrossSubject) {
    const subjects = new Map<string, KpRow[]>()
    for (const k of kpsAll) {
      if (!k.subject) continue
      if (!subjects.has(k.subject)) subjects.set(k.subject, [])
      subjects.get(k.subject)!.push(k)
    }
    const subjectList = [...subjects.entries()].filter(([, kps]) => kps.length >= 5)
    console.log(`[infer-kp-relations-llm] === 跨学科, ${subjectList.length} 学科参与 ===`)
    // 两两组合, 跑 N*(N-1)/2 次
    for (let i = 0; i < subjectList.length; i++) {
      for (let j = i + 1; j < subjectList.length; j++) {
        const { rels, ok } = await inferCrossSubject(
          { subject: subjectList[i]![0], kps: subjectList[i]![1] },
          { subject: subjectList[j]![0], kps: subjectList[j]![1] },
          llmCall,
          args.model,
        )
        saveRels(rels, `cross:${subjectList[i]![0]}↔${subjectList[j]![0]}`, ok)
      }
    }
  }

  console.log('[infer-kp-relations-llm] === 最终统计 ===')
  console.log(JSON.stringify(countKpRelations(db), null, 2))
}

main().catch(e => { console.error(e); process.exit(1) })
