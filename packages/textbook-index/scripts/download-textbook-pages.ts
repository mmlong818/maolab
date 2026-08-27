#!/usr/bin/env tsx
/**
 * 把匹配到国家课的教材本体逐页 JPG 下载到本地(可断点续传)
 *
 *   data/textbook-body-pages/{bodyTextbookId}/{n}.jpg
 *   data/textbook-body-pages/{bodyTextbookId}/_meta.json   { totalPages, imageBase, title }
 *
 * 纯 HTTP, 不吃 Claude 配额。重复运行只补缺页。
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/download-textbook-pages.ts
 */

import { readFileSync, existsSync, statSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TextbookBodySource } from '../src/textbook-body-source.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const OUT_ROOT = resolve(PKG_ROOT, 'data', 'textbook-body-pages')

interface IndexEntry {
  id: string
  title: string
  stage: string
  subject: string
  version: string
  grade: string
  volume: string
}

function deriveImageBase(pageUrl: string): string {
  return pageUrl.replace(/\/\d+\.(jpg|jpeg|png)$/i, '')
}

async function exists(base: string, n: number): Promise<boolean> {
  for (let a = 0; a < 3; a++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 15_000)
      const r = await fetch(`${base}/${n}.jpg`, { method: 'HEAD', signal: ctrl.signal })
      clearTimeout(t)
      if (r.ok) return true
      if (r.status === 403 || r.status === 404) return false
    } catch {
      /* retry */
    }
    await new Promise(r => setTimeout(r, 800 * (a + 1)))
  }
  return false
}

/** 指数探上界 + 二分定位真实末页 */
async function probeLastPage(base: string): Promise<number> {
  if (!(await exists(base, 1))) return 0
  let lo = 1
  let hi = 2
  while (await exists(base, hi)) {
    lo = hi
    hi *= 2
    if (hi > 4096) break
  }
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1
    if (await exists(base, mid)) lo = mid
    else hi = mid
  }
  return lo
}

async function downloadPage(base: string, n: number, dest: string): Promise<boolean> {
  if (existsSync(dest) && statSync(dest).size > 1024) return false // 已存在且非空
  for (let a = 0; a < 4; a++) {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 60_000)
      const r = await fetch(`${base}/${n}.jpg`, { signal: ctrl.signal })
      clearTimeout(t)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const buf = Buffer.from(await r.arrayBuffer())
      if (buf.length < 1024) throw new Error('too small')
      await writeFile(dest, buf)
      return true
    } catch {
      await new Promise(r => setTimeout(r, 1000 * (a + 1)))
    }
  }
  throw new Error(`download ${n}.jpg failed`)
}

async function runPool<T>(items: T[], concurrency: number, fn: (it: T) => Promise<void>): Promise<void> {
  let idx = 0
  const worker = async (): Promise<void> => {
    while (true) {
      const i = idx++
      if (i >= items.length) return
      await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
}

async function main(): Promise<void> {
  const index = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-index.json'), 'utf-8'),
  ) as { entries: IndexEntry[] }
  const bodyIndex = JSON.parse(
    readFileSync(resolve(PKG_ROOT, 'data', 'textbook-body-index.json'), 'utf-8'),
  ) as Record<string, TextbookBodySource>

  const matched: TextbookBodySource[] = []
  let unmatched = 0
  for (const e of index.entries) {
    // 高中书的 grade 在 textbook-index 里是 "高一"/"高二"/"" 等，
    // 但 textbook-body-index 统一用 "高中年级"，需要标准化
    const grade = e.stage === '高中' ? '高中年级' : (e.grade ?? '')
    const key = `${e.stage}|${e.subject}|${e.version}|${grade}|${e.volume}`
    const body = bodyIndex[key]
    if (body) matched.push(body)
    else unmatched++
  }
  console.log(`[dl] ${index.entries.length} 棵树, 匹配本体 ${matched.length}, 未匹配 ${unmatched}`)

  let bookDone = 0
  let totalDownloaded = 0
  let totalSkipped = 0
  const failures: string[] = []

  for (const body of matched) {
    bookDone++
    const base = deriveImageBase(body.pages[0]!)
    const dir = join(OUT_ROOT, body.textbookId)
    await mkdir(dir, { recursive: true })

    const last = await probeLastPage(base)
    if (last === 0) {
      failures.push(`${body.textbookId} probe=0 (${body.title})`)
      console.log(`[dl] (${bookDone}/${matched.length}) PROBE FAIL ${body.title}`)
      continue
    }

    const pageNos = Array.from({ length: last }, (_, i) => i + 1)
    let dld = 0
    let skipped = 0
    let bookFail = 0
    await runPool(pageNos, 8, async n => {
      const dest = join(dir, `${n}.jpg`)
      try {
        const wrote = await downloadPage(base, n, dest)
        if (wrote) dld++
        else skipped++
      } catch {
        bookFail++
      }
    })
    totalDownloaded += dld
    totalSkipped += skipped
    if (bookFail > 0) failures.push(`${body.textbookId} ${bookFail}/${last} 页失败`)

    await writeFile(
      join(dir, '_meta.json'),
      JSON.stringify(
        { textbookId: body.textbookId, title: body.title, matchKey: body.matchKey, imageBase: base, totalPages: last },
        null,
        2,
      ),
      'utf-8',
    )
    console.log(
      `[dl] (${bookDone}/${matched.length}) ${body.title} | ${last}页 新下${dld} 跳过${skipped}` +
        (bookFail ? ` 失败${bookFail}` : ''),
    )
  }

  console.log(`\n[dl] 完成: ${matched.length} 本, 新下载 ${totalDownloaded} 页, 跳过 ${totalSkipped} 页`)
  if (failures.length) {
    console.log(`[dl] ${failures.length} 本有问题:`)
    for (const f of failures) console.log('  - ' + f)
  }
}

main().catch(err => {
  console.error('[dl] 失败:', err)
  process.exit(1)
})
