#!/usr/bin/env tsx
/**
 * 单本端到端验证: tree -> matchKey -> body -> OCR -> segment
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/verify-body-pipeline.ts [treeId]
 * 默认验证道法八上 (955fadcc-fb53-4225-b4d9-af191d7a1553)
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectLeaves } from '../src/annotation-pipeline.js'
import { ocrTextbookBody, listLocalBodyPages } from '../src/textbook-body-ocr.js'
import { segmentTextbookBody, type LeafForSegment } from '../src/textbook-body-segment.js'
import type { TextbookFullInfo } from '../src/tree-types.js'
import type { TextbookBodySource } from '../src/textbook-body-source.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const REPO_ROOT = resolve(PKG_ROOT, '..', '..')

/** 手动加载 app/.env.local (standalone tsx 不走 Next.js 自动加载) */
function loadEnv(): void {
  try {
    const raw = readFileSync(resolve(REPO_ROOT, 'app', '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq <= 0) continue
      const k = t.slice(0, eq).trim()
      const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
      if (!process.env[k]) process.env[k] = v
    }
  } catch {
    /* ignore */
  }
}

interface IndexEntry {
  id: string
  title: string
  stage: string
  subject: string
  version: string
  grade: string
  volume: string
}

async function main(): Promise<void> {
  loadEnv()
  const treeId = process.argv[2] ?? '955fadcc-fb53-4225-b4d9-af191d7a1553'

  const index = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-index.json'), 'utf-8'),
  ) as { entries: IndexEntry[] }
  const entry = index.entries.find(e => e.id === treeId)
  if (!entry) throw new Error(`tree ${treeId} 不在 textbook-index`)
  const matchKey = `${entry.stage}|${entry.subject}|${entry.version}|${entry.grade}|${entry.volume}`
  console.log(`[verify] tree=${entry.title}`)
  console.log(`[verify] matchKey=${matchKey}`)

  const bodyIndex = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-body-index.json'), 'utf-8'),
  ) as Record<string, TextbookBodySource>
  const body = bodyIndex[matchKey]
  if (!body) throw new Error(`matchKey ${matchKey} 无对应 tch_material 本体`)
  console.log(`[verify] body=${body.textbookId} ${body.title} (${body.pages.length} 页)`)

  const tree = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-trees', `${treeId}.json`), 'utf-8'),
  ) as TextbookFullInfo
  const leaves = collectLeaves(tree.chapterTree)
  const leafInputs: LeafForSegment[] = leaves.map(l => ({
    leafId: l.node.id,
    title: l.node.title,
    ancestorTitles: l.ancestorTitles,
  }))
  console.log(`[verify] ${leafInputs.length} 个叶子`)

  const local = await listLocalBodyPages(body.textbookId)
  if (local) console.log(`[verify] 用本地 ${local.totalPages} 页`)
  else console.log(`[verify] 本地缺失, 回退 preview ${body.pages.length} 页`)
  const ocrPages = local ? local.pages : body.pages

  console.log('[verify] OCR (命中缓存秒回, 否则逐页转写)...')
  const ocr = await ocrTextbookBody(
    { textbookId: body.textbookId, title: body.title, pages: ocrPages },
    { concurrency: 4, onProgress: (d, t) => process.stdout.write(`\r  OCR ${d}/${t}`) },
  )
  console.log(`\n[verify] OCR 完成: ${ocr.pageCount}/${ocr.totalPages} 页有正文, fullText ${ocr.fullText.length} 字`)

  console.log('[verify] 切分...')
  const seg = await segmentTextbookBody({ treeId, bodyOcr: ocr, leaves: leafInputs })
  console.log(`[verify] 切分完成 (model=${seg.model})\n`)

  let withBody = 0
  for (const s of seg.segments) {
    const chars = s.bodyText.length
    if (chars > 0) withBody++
    const head = s.bodyText.replace(/\s+/g, ' ').slice(0, 80)
    console.log(`  [P${s.startPage}-${s.endPage}] ${chars}字 | ${s.title}`)
    if (head) console.log(`      ${head}`)
  }
  console.log(`\n[verify] ${withBody}/${seg.segments.length} 个叶子拿到正文`)
}

main().catch(err => {
  console.error('\n[verify] 失败:', err)
  process.exit(1)
})
