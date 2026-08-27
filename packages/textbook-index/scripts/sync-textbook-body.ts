#!/usr/bin/env tsx
/**
 * 同步 tch_material 教材正文本体索引 -> data/textbook-body-index.json
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/sync-textbook-body.ts
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncTextbookBodyIndex } from '../src/textbook-body-source.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const OUT_PATH = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-body-index.json')

async function main(): Promise<void> {
  console.log('[sync-textbook-body] 拉取 tch_material 教材本体...')
  const index = await syncTextbookBodyIndex({
    onProgress: (done, total) => console.log(`[sync-textbook-body] part ${done}/${total}`),
  })
  const keys = Object.keys(index)
  const totalPages = keys.reduce((s, k) => s + index[k]!.pages.length, 0)
  await mkdir(dirname(OUT_PATH), { recursive: true })
  await writeFile(OUT_PATH, JSON.stringify(index, null, 2), 'utf-8')
  console.log(`[sync-textbook-body] 写出 ${keys.length} 本教材本体 (共 ${totalPages} 页) -> ${OUT_PATH}`)
}

main().catch(err => {
  console.error('[sync-textbook-body] 失败:', err)
  process.exit(1)
})
