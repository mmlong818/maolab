#!/usr/bin/env tsx
/**
 * 清空所有 KP 及其衍生数据 (假 KP 重置)
 *
 * 旧 batch-kp-extract 凭标题臆测产出的"假 KP"及一切基于其衍生的数据全部清掉,
 * 为"据真实教材正文重抽"腾空。按外键依赖顺序 (先子表后父表) DELETE。
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/reset-kp.ts            # dry-run, 只报行数
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/reset-kp.ts --execute  # 真正清空
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __require = createRequire(import.meta.url)
;(globalThis as { require?: NodeRequire }).require = __require

import { openSqliteRaw } from '@maolab/db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const DB_PATH = resolve(REPO_ROOT, 'data/maolab.db')

// 外键依赖顺序: 子表在前, 父表 (cluster) 在后
const TABLES = [
  'kp_relations',
  'atom_by_kp',
  'knowledge_point_sources',
  'chapter_node_knowledge_points',
  'knowledge_points',
  'knowledge_point_clusters',
] as const

type RawDb = ReturnType<typeof openSqliteRaw>

function existingTables(db: RawDb): Set<string> {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as Array<{ name: string }>
  return new Set(rows.map((r) => r.name))
}

function counts(db: RawDb, present: Set<string>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of TABLES) {
    if (!present.has(t)) {
      out[t] = -1
      continue
    }
    const row = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }
    out[t] = row.n
  }
  return out
}

function printCounts(label: string, c: Record<string, number>): void {
  console.log(`\n[${label}]`)
  for (const t of TABLES) {
    const n = c[t]!
    console.log(`  ${t.padEnd(32)} ${n < 0 ? '(表不存在)' : n}`)
  }
}

function main(): void {
  const execute = process.argv.includes('--execute')
  const db = openSqliteRaw(DB_PATH)
  const present = existingTables(db)

  const before = counts(db, present)
  printCounts('清空前', before)

  if (!execute) {
    console.log('\n>>> dry-run。确认无误后加 --execute 真正清空。')
    db.close()
    return
  }

  const tx = db.transaction(() => {
    for (const t of TABLES) {
      if (present.has(t)) db.prepare(`DELETE FROM ${t}`).run()
    }
  })
  tx()

  const after = counts(db, present)
  printCounts('清空后', after)

  console.log('\n[VACUUM] 回收空间...')
  db.exec('VACUUM')
  db.close()
  console.log('完成。所有 KP 及衍生数据已清空,可重新据真实教材正文抽取。')
}

main()
