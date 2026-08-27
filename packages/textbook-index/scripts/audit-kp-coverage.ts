#!/usr/bin/env tsx
/**
 * KP 覆盖率审核
 *
 * 输出：
 * 1. 总体覆盖率（有 KP / 有正文 / 全部 leaf）
 * 2. 0-KP leaf 分类（合理空 vs 疑似漏抽）
 * 3. 按学科/学段的 KP 密度统计
 * 4. 随机抽样准确性验证（KP 名 vs 正文关键词）
 *
 * 用法: pnpm exec tsx scripts/audit-kp-coverage.ts [--accuracy-sample=20]
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

import { openSqliteRaw } from '@maolab/db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const TREES_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-trees')
const SEG_DIR   = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-body-cache')
const DB_PATH   = resolve(REPO_ROOT, 'data/maolab.db')

const ACCURACY_SAMPLE = parseInt(
  process.argv.find(a => a.startsWith('--accuracy-sample='))?.split('=')[1] ?? '20', 10
)

// ── 1. 从 DB 加载已抽 leaf 和 KP ────────────────────────────────
const db = openSqliteRaw(DB_PATH)
type CnkpRow = { chapter_node_id: string; kp_count: number }
const kpByLeaf = new Map<string, number>()
const rows = db.prepare(`
  SELECT chapter_node_id, COUNT(*) as kp_count
  FROM chapter_node_knowledge_points
  GROUP BY chapter_node_id
`).all() as CnkpRow[]
rows.forEach(r => kpByLeaf.set(r.chapter_node_id, r.kp_count))

const totalKpInDb = (db.prepare('SELECT COUNT(*) as n FROM knowledge_points').get() as {n:number}).n
const totalLeafInDb = kpByLeaf.size
db.close()

// ── 2. 从 segments 缓存收集有正文的 leaf ────────────────────────
interface SegFile { segments: Array<{ leafId: string; bodyText?: string }> }

type ChapterNode = { id: string; title: string; child_nodes?: ChapterNode[] }
interface TreeFile { textbookTitle: string; chapterTree: ChapterNode[] }

function findNode(nodes: ChapterNode[], id: string, ancestors: string[] = []): { title: string; ancestors: string[] } | null {
  for (const n of nodes) {
    if (n.id === id) return { title: n.title, ancestors }
    const found = findNode(n.child_nodes ?? [], id, [...ancestors, n.title])
    if (found) return found
  }
  return null
}

interface LeafInfo {
  leafId: string
  treeId: string
  title: string
  ancestors: string[]
  textbookTitle: string
  bodyLen: number
  kpCount: number  // -1 = 未处理
}

const allLeafsWithBody: LeafInfo[] = []
const treeCache = new Map<string, TreeFile | null>()

function getTree(treeId: string): TreeFile | null {
  if (treeCache.has(treeId)) return treeCache.get(treeId)!
  const p = resolve(TREES_DIR, `${treeId}.json`)
  if (!existsSync(p)) { treeCache.set(treeId, null); return null }
  const t = JSON.parse(readFileSync(p, 'utf-8')) as TreeFile
  treeCache.set(treeId, t)
  return t
}

if (existsSync(SEG_DIR)) {
  for (const f of readdirSync(SEG_DIR)) {
    if (!f.endsWith('.segments.json')) continue
    const treeId = f.replace('.segments.json', '')
    const tree = getTree(treeId)
    if (!tree) continue
    const seg = JSON.parse(readFileSync(resolve(SEG_DIR, f), 'utf-8')) as SegFile
    for (const s of seg.segments) {
      if (!s.bodyText?.trim()) continue
      const found = findNode(tree.chapterTree, s.leafId)
      if (!found) continue
      allLeafsWithBody.push({
        leafId: s.leafId,
        treeId,
        title: found.title,
        ancestors: found.ancestors,
        textbookTitle: tree.textbookTitle,
        bodyLen: s.bodyText.trim().length,
        kpCount: kpByLeaf.get(s.leafId) ?? -1,
      })
    }
  }
}

// ── 3. 统计 ────────────────────────────────────────────────────
const totalWithBody = allLeafsWithBody.length
const processed     = allLeafsWithBody.filter(l => l.kpCount >= 0)
const unprocessed   = allLeafsWithBody.filter(l => l.kpCount < 0)
const zeroKp        = processed.filter(l => l.kpCount === 0)
const hasKp         = processed.filter(l => l.kpCount > 0)

// 0-KP 分类：标题含"复习/总结/练习/活动/实验/小结/章末/习题/附录/序/目录/前言"等 = 合理空
const EMPTY_PATTERNS = /复习|总结|练习|活动|实验|小结|章末|习题|附录|序言|目录|前言|测试|考点|单元回顾|综合|园地|拓展|思考|讨论|提高|自测|检测|评价|反思|应用|巩固|写作|口语|阅读理解|听力|作文|日积月累|和大人一起读|展示|交流|数学广角|数学活动/

const legitimateEmpty = zeroKp.filter(l => EMPTY_PATTERNS.test(l.title))
const suspectEmpty    = zeroKp.filter(l => !EMPTY_PATTERNS.test(l.title))

// 按学科统计
const subjectStats = new Map<string, { total: number; hasKp: number; kps: number }>()
function inferSubject(title: string): string {
  if (/物理/.test(title)) return '物理'
  if (/化学/.test(title)) return '化学'
  if (/生物/.test(title)) return '生物'
  if (/数学/.test(title)) return '数学'
  if (/语文/.test(title)) return '语文'
  if (/英语|English|Unit/.test(title)) return '英语'
  if (/历史/.test(title)) return '历史'
  if (/地理/.test(title)) return '地理'
  if (/政治|道德|法治/.test(title)) return '政治'
  if (/体育/.test(title)) return '体育'
  if (/音乐/.test(title)) return '音乐'
  if (/美术/.test(title)) return '美术'
  return '其他'
}
for (const l of allLeafsWithBody) {
  const sub = inferSubject(l.textbookTitle)
  const s = subjectStats.get(sub) ?? { total: 0, hasKp: 0, kps: 0 }
  s.total++
  if (l.kpCount > 0) { s.hasKp++; s.kps += l.kpCount }
  subjectStats.set(sub, s)
}

// ── 4. 准确性抽样（KP 名关键词是否出现在正文里）─────────────────
const accuracySample = hasKp
  .filter(l => l.bodyLen > 200)
  .sort(() => Math.random() - 0.5)
  .slice(0, ACCURACY_SAMPLE)

interface AccuracyResult {
  leaf: LeafInfo
  kps: string[]
  bodyText: string
  hitCount: number
  missCount: number
  misses: string[]
}
const accuracyResults: AccuracyResult[] = []

for (const leaf of accuracySample) {
  const db2 = openSqliteRaw(DB_PATH)
  const kpNames = (db2.prepare(`
    SELECT kp.canonical_name
    FROM chapter_node_knowledge_points cnkp
    JOIN knowledge_points kp ON kp.id = cnkp.knowledge_point_id
    WHERE cnkp.chapter_node_id = ?
  `).all(leaf.leafId) as { canonical_name: string }[]).map(r => r.canonical_name)
  db2.close()

  const segFile = resolve(SEG_DIR, `${leaf.treeId}.segments.json`)
  const seg = JSON.parse(readFileSync(segFile, 'utf-8')) as SegFile
  const bodyText = seg.segments.find(s => s.leafId === leaf.leafId)?.bodyText ?? ''

  // 简单命中率：KP 中的核心词是否出现在正文
  let hitCount = 0; let missCount = 0; const misses: string[] = []
  for (const kp of kpNames) {
    // 取 KP 名的前 6 个中文字符作为核心关键词
    const cjk = kp.replace(/[^一-鿿]/g, '')
    const keyword = cjk.slice(0, 6)
    if (keyword.length < 2) { hitCount++; continue } // 太短跳过
    if (bodyText.includes(keyword)) { hitCount++ }
    else { missCount++; misses.push(kp) }
  }
  accuracyResults.push({ leaf, kps: kpNames, bodyText: bodyText.slice(0, 200), hitCount, missCount, misses })
}

// ── 5. 输出报告 ─────────────────────────────────────────────────
console.log('\n' + '='.repeat(80))
console.log('KP 覆盖率审核报告')
console.log('='.repeat(80))

console.log(`\n【总体统计】`)
console.log(`  DB 中 KP 总数:        ${totalKpInDb}`)
console.log(`  DB 中已抽 leaf:       ${totalLeafInDb}`)
console.log(`  有正文的 leaf 总数:   ${totalWithBody}`)
console.log(`  ├─ 已处理:            ${processed.length} (${(processed.length/totalWithBody*100).toFixed(1)}%)`)
console.log(`  │   ├─ 有 KP:         ${hasKp.length} (${(hasKp.length/processed.length*100).toFixed(1)}%)`)
console.log(`  │   └─ 0 KP:          ${zeroKp.length} (${(zeroKp.length/processed.length*100).toFixed(1)}%)`)
console.log(`  │       ├─ 合理空:    ${legitimateEmpty.length}（含复习/活动/园地等关键词）`)
console.log(`  │       └─ ⚠ 疑似漏:  ${suspectEmpty.length}`)
console.log(`  └─ 未处理:            ${unprocessed.length} (${(unprocessed.length/totalWithBody*100).toFixed(1)}%)`)

console.log(`\n【疑似漏抽（0 KP 但标题无复习/活动关键词）】前20条`)
suspectEmpty.slice(0, 20).forEach(l =>
  console.log(`  [${l.textbookTitle.slice(0, 20)}] ${l.title.slice(0, 40)} (正文 ${l.bodyLen} 字)`)
)
if (suspectEmpty.length > 20) console.log(`  ...共 ${suspectEmpty.length} 条`)

console.log(`\n【按学科 KP 密度统计】`)
console.log(`  ${'学科'.padEnd(6)} ${'有正文leaf'.padStart(10)} ${'有KP leaf'.padStart(10)} ${'总KP'.padStart(8)} ${'均KP'.padStart(8)}`)
const sorted = [...subjectStats.entries()].sort((a, b) => b[1].total - a[1].total)
for (const [sub, s] of sorted) {
  const avg = s.hasKp > 0 ? (s.kps / s.hasKp).toFixed(2) : '-'
  console.log(`  ${sub.padEnd(6)} ${String(s.total).padStart(10)} ${String(s.hasKp).padStart(10)} ${String(s.kps).padStart(8)} ${avg.padStart(8)}`)
}

console.log(`\n【准确性抽样（${accuracySample.length} 个 leaf，关键词命中率）】`)
let totalHit = 0; let totalMiss = 0
for (const r of accuracyResults) {
  totalHit += r.hitCount; totalMiss += r.missCount
  if (r.missCount > 0) {
    console.log(`  ⚠ [${r.leaf.textbookTitle.slice(0, 15)}] ${r.leaf.title.slice(0, 30)}`)
    r.misses.forEach(m => console.log(`      未命中: "${m}"`))
  }
}
const totalChecked = totalHit + totalMiss
console.log(`\n  总体命中率: ${totalHit}/${totalChecked} = ${totalChecked > 0 ? (totalHit/totalChecked*100).toFixed(1) : '-'}%`)
console.log(`  （命中 = KP 核心词（前6字）出现在正文中）`)

console.log('\n' + '='.repeat(80))
