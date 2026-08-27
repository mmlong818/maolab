#!/usr/bin/env tsx
/**
 * 三模型 KP 抽取质量对比
 * 从 DB 抽 N 个已抽 leaf（保证有 body text），分别用 3 个模型重跑，输出对比表格。
 * 用法: ZHIPU_API_KEY=... DASHSCOPE_API_KEY=... tsx scripts/compare-kp-quality.ts [--n=50]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

import { openSqliteRaw } from '@maolab/db'
import {
  createClaudeCliCaller,
  createZhipuCaller,
  createQwenCaller,
  createKnowledgePointExtractionAnnotator,
  loadCachedSegments,
  type AnnotationContext,
} from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const TREES_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-trees')
const DB_PATH = resolve(REPO_ROOT, 'data/maolab.db')

const N = parseInt(process.argv.find(a => a.startsWith('--n='))?.slice(4) ?? '50', 10)

// ── 初始化三个模型 ──────────────────────────────────────────────
const zhipuKey = process.env.ZHIPU_API_KEY ?? ''
const qwenKey = process.env.DASHSCOPE_API_KEY ?? ''
if (!zhipuKey) { console.error('ZHIPU_API_KEY 未设置'); process.exit(1) }
if (!qwenKey) { console.error('DASHSCOPE_API_KEY 未设置'); process.exit(1) }

const callers = {
  'zhipu:glm-5.1': createZhipuCaller(zhipuKey),
  'qwen:qwen-plus': createQwenCaller(qwenKey),
  'claude-cli:haiku': createClaudeCliCaller({ timeoutMs: 120_000 }),
}

// ── 从 DB 抽样 leaf ────────────────────────────────────────────
const db = openSqliteRaw(DB_PATH)
type LeafRow = { chapter_node_id: string }
const sampledLeaves = db.prepare(`
  SELECT DISTINCT chapter_node_id
  FROM chapter_node_knowledge_points
  ORDER BY RANDOM()
  LIMIT ?
`).all(N * 3) as LeafRow[] // 多取备用，按有正文过滤后取 N 个
db.close()

// ── 建立 leafId → treeId 反查索引（扫 segments 缓存目录）──────
const SEG_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-body-cache')
const leafToTree = new Map<string, string>()
if (existsSync(SEG_DIR)) {
  const { readdirSync } = await import('node:fs')
  for (const f of readdirSync(SEG_DIR)) {
    if (!f.endsWith('.segments.json')) continue
    const treeId = f.replace('.segments.json', '')
    try {
      const raw = JSON.parse(readFileSync(resolve(SEG_DIR, f), 'utf-8')) as { segments: { leafId: string }[] }
      for (const s of raw.segments) leafToTree.set(s.leafId, treeId)
    } catch { /* skip */ }
  }
}

// ── 加载 leaf 上下文（需要 body text）──────────────────────────
interface LeafCtx { leafId: string; treeId: string; ctx: AnnotationContext }
const leafCtxs: LeafCtx[] = []

const treeCache = new Map<string, unknown>()
function loadTree(treeId: string): unknown {
  if (treeCache.has(treeId)) return treeCache.get(treeId)
  const p = resolve(TREES_DIR, `${treeId}.json`)
  if (!existsSync(p)) return null
  const t = JSON.parse(readFileSync(p, 'utf-8'))
  treeCache.set(treeId, t)
  return t
}

type ChapterNode = { id: string; title: string; child_nodes?: ChapterNode[] }
function findNode(nodes: ChapterNode[], id: string, path: string[] = []): { node: ChapterNode; path: string[] } | null {
  for (const n of nodes) {
    if (n.id === id) return { node: n, path }
    const found = findNode(n.child_nodes ?? [], id, [...path, n.title])
    if (found) return found
  }
  return null
}

for (const row of sampledLeaves) {
  if (leafCtxs.length >= N) break
  const treeId = leafToTree.get(row.chapter_node_id)
  if (!treeId) continue
  const tree = loadTree(treeId) as { textbookTitle: string; chapterTree: ChapterNode[] } | null
  if (!tree) continue
  const segCache = await loadCachedSegments(treeId)
  if (!segCache) continue
  const seg = segCache.segments.find(s => s.leafId === row.chapter_node_id)
  if (!seg?.bodyText?.trim()) continue
  const found = findNode(tree.chapterTree, row.chapter_node_id)
  if (!found) continue
  const ctx: AnnotationContext = {
    chapterId: row.chapter_node_id,
    chapterTitle: found.node.title,
    subject: '',
    stage: '',
    ancestorTitles: found.path,
    linkedLessonTitles: [],
    textbookTitle: tree.textbookTitle,
    chapterBodyText: seg.bodyText,
  }
  leafCtxs.push({ leafId: row.chapter_node_id, treeId, ctx })
}

console.log(`\n抽到 ${leafCtxs.length} 个有正文的 leaf，开始三模型对比\n`)

// ── 对每个 leaf 并发跑三个模型 ─────────────────────────────────
type ModelResult = { kps: string[]; elapsed: number; error?: string }
type LeafComparison = {
  title: string
  treeId: string
  results: Record<string, ModelResult>
}

const comparisons: LeafComparison[] = []
let done = 0

for (const { ctx, treeId } of leafCtxs) {
  const results: Record<string, ModelResult> = {}
  await Promise.all(
    Object.entries(callers).map(async ([model, llmCall]) => {
      const annotator = createKnowledgePointExtractionAnnotator({ model })
      const t0 = Date.now()
      try {
        const r = await annotator.annotate(ctx, { apiKey: '', llmCall, model })
        results[model] = {
          kps: r.annotation.value.map(k => k.canonicalName),
          elapsed: Date.now() - t0,
        }
      } catch (e) {
        results[model] = { kps: [], elapsed: Date.now() - t0, error: (e as Error).message.slice(0, 80) }
      }
    })
  )
  comparisons.push({ title: ctx.chapterTitle, treeId, results })
  done++
  if (done % 5 === 0) console.error(`[进度] ${done}/${leafCtxs.length}`)
}

// ── 输出对比报告 ────────────────────────────────────────────────
const models = Object.keys(callers)
console.log('\n' + '='.repeat(100))
console.log('KP 抽取质量对比报告')
console.log('='.repeat(100))

let totalKps: Record<string, number> = {}
let errors: Record<string, number> = {}
models.forEach(m => { totalKps[m] = 0; errors[m] = 0 })

for (const c of comparisons) {
  console.log(`\n【${c.title}】`)
  for (const m of models) {
    const r = c.results[m]
    if (!r) continue
    totalKps[m] = (totalKps[m] ?? 0) + r.kps.length
    errors[m] ??= 0
    if (r.error) { errors[m]++; console.log(`  ${m.padEnd(22)} ✗ ${r.error}`) }
    else console.log(`  ${m.padEnd(22)} (${r.elapsed}ms, ${r.kps.length}KP) ${r.kps.join(' / ') || '(0个)'}`)
  }
}

console.log('\n' + '='.repeat(100))
console.log('汇总统计')
console.log('='.repeat(100))
console.log(`${'模型'.padEnd(24)} ${'总KP'.padStart(6)} ${'均KP/leaf'.padStart(10)} ${'失败'.padStart(6)}`)
for (const m of models) {
  const kpCount = totalKps[m] ?? 0
  const errorCount = errors[m] ?? 0
  console.log(`${m.padEnd(24)} ${String(kpCount).padStart(6)} ${(kpCount/comparisons.length).toFixed(2).padStart(10)} ${String(errorCount).padStart(6)}`)
}
