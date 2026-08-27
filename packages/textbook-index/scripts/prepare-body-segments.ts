#!/usr/bin/env tsx
/**
 * 全量预生成 segments 缓存: 遍历所有匹配到 tch_material 本体的树,
 * 逐本 OCR(qwen-vl-max)+ 切分(qwen-plus)写缓存,供后续 batch-kp-extract 据正文抽 KP。
 *
 * 走 DashScope qwen,不吃 Claude 订阅配额,可后台跑。
 * 断点续传: 已有 {treeId}.segments.json 缓存的树默认跳过(--force 强制重切)。
 * 单本失败不中断,最后汇总。
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/prepare-body-segments.ts
 *   ... --force            # 忽略已有缓存重切
 *   ... --tree=<treeId>    # 只处理一本
 *   ... --concurrency=4    # OCR 单本内并发(默认 4)
 */

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectLeaves } from '../src/annotation-pipeline.js'
import {
  ocrTextbookBody,
  listLocalBodyPages,
  loadCachedBodyOcr,
} from '../src/textbook-body-ocr.js'
import {
  segmentTextbookBody,
  loadCachedSegments,
  type LeafForSegment,
} from '../src/textbook-body-segment.js'
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

interface CliArgs {
  force: boolean
  treeId: string | null
  concurrency: number
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2)
  const treeArg = argv.find(a => a.startsWith('--tree='))
  const concArg = argv.find(a => a.startsWith('--concurrency='))
  return {
    force: argv.includes('--force'),
    treeId: treeArg ? treeArg.slice('--tree='.length) : null,
    concurrency: concArg ? Math.max(1, Number(concArg.slice('--concurrency='.length)) || 4) : 4,
  }
}

interface BookOutcome {
  treeId: string
  title: string
  status: 'cached' | 'done' | 'no-body' | 'no-local' | 'error'
  detail?: string
}

async function processBook(
  entry: IndexEntry,
  bodyIndex: Record<string, TextbookBodySource>,
  args: CliArgs,
): Promise<BookOutcome> {
  const grade = entry.stage === '高中' ? '高中年级' : (entry.grade ?? '')
  const matchKey = `${entry.stage}|${entry.subject}|${entry.version}|${grade}|${entry.volume}`
  const body = bodyIndex[matchKey]
  if (!body) return { treeId: entry.id, title: entry.title, status: 'no-body', detail: matchKey }

  if (!args.force) {
    const cached = await loadCachedSegments(entry.id)
    if (cached) {
      const withBody = cached.segments.filter(s => s.bodyText && s.bodyText.length > 0).length
      return {
        treeId: entry.id,
        title: entry.title,
        status: 'cached',
        detail: `${withBody}/${cached.segments.length} 叶子有正文`,
      }
    }
  }

  const local = await listLocalBodyPages(body.textbookId)
  const hadOcrCache = (await loadCachedBodyOcr(body.textbookId)) !== null
  if (!local && !hadOcrCache) {
    return { treeId: entry.id, title: entry.title, status: 'no-local', detail: body.textbookId }
  }
  const ocrPages = local ? local.pages : body.pages

  const tree = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-trees', `${entry.id}.json`), 'utf-8'),
  ) as TextbookFullInfo
  const leaves = collectLeaves(tree.chapterTree)
  const leafInputs: LeafForSegment[] = leaves.map(l => ({
    leafId: l.node.id,
    title: l.node.title,
    ancestorTitles: l.ancestorTitles,
  }))

  const ocr = await ocrTextbookBody(
    { textbookId: body.textbookId, title: body.title, pages: ocrPages },
    {
      concurrency: args.concurrency,
      onProgress: (d, t) => process.stdout.write(`\r    OCR ${d}/${t}   `),
    },
  )
  process.stdout.write('\r')

  const seg = await segmentTextbookBody(
    { treeId: entry.id, bodyOcr: ocr, leaves: leafInputs },
    { forceRefresh: args.force },
  )
  const withBody = seg.segments.filter(s => s.bodyText && s.bodyText.length > 0).length
  return {
    treeId: entry.id,
    title: entry.title,
    status: 'done',
    detail: `OCR ${ocr.pageCount}/${ocr.totalPages} 页, ${withBody}/${seg.segments.length} 叶子有正文`,
  }
}

async function main(): Promise<void> {
  loadEnv()
  const args = parseArgs()

  const index = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-index.json'), 'utf-8'),
  ) as { entries: IndexEntry[] }
  const bodyIndex = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-body-index.json'), 'utf-8'),
  ) as Record<string, TextbookBodySource>

  let entries = index.entries
  if (args.treeId) entries = entries.filter(e => e.id === args.treeId)

  // 只处理匹配到本体的树
  const matched = entries.filter(e => {
    const g = e.stage === '高中' ? '高中年级' : (e.grade ?? '')
    const mk = `${e.stage}|${e.subject}|${e.version}|${g}|${e.volume}`
    return bodyIndex[mk] != null
  })
  console.log(`[prepare-body-segments] ${matched.length}/${entries.length} 本匹配到 tch_material 本体${args.force ? ' (--force 重切)' : ''}`)

  const outcomes: BookOutcome[] = []
  let i = 0
  for (const entry of matched) {
    i++
    console.log(`\n[${i}/${matched.length}] ${entry.title} (${entry.id})`)
    try {
      const out = await processBook(entry, bodyIndex, args)
      outcomes.push(out)
      console.log(`  -> ${out.status}${out.detail ? ': ' + out.detail : ''}`)
    } catch (err) {
      const detail = String(err).slice(0, 200)
      outcomes.push({ treeId: entry.id, title: entry.title, status: 'error', detail })
      console.log(`  -> error: ${detail}`)
    }
  }

  const by = (s: BookOutcome['status']): BookOutcome[] => outcomes.filter(o => o.status === s)
  console.log('\n===== 汇总 =====')
  console.log(`  已缓存跳过: ${by('cached').length}`)
  console.log(`  本次完成  : ${by('done').length}`)
  console.log(`  无本体    : ${by('no-body').length}`)
  console.log(`  无本地页  : ${by('no-local').length}`)
  console.log(`  失败      : ${by('error').length}`)
  const errs = by('error')
  if (errs.length) {
    console.log('\n失败明细:')
    for (const e of errs) console.log(`  - ${e.title} (${e.treeId}): ${e.detail}`)
  }
  const noLocal = by('no-local')
  if (noLocal.length) {
    console.log('\n无本地页(需先 download-textbook-pages):')
    for (const e of noLocal) console.log(`  - ${e.title} (${e.detail})`)
  }
}

main().catch(err => {
  console.error('\n[prepare-body-segments] 致命错误:', err)
  process.exit(1)
})
