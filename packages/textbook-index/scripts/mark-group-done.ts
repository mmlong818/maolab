#!/usr/bin/env tsx
// 手动标记某个 (subject|grade_band) 组为已完成
import { openSqliteRaw } from '@maolab/db'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)
const DB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'maolab.db')
const db = openSqliteRaw(DB)
db.prepare('CREATE TABLE IF NOT EXISTS kp_rel_progress (group_key TEXT PRIMARY KEY, done_at INTEGER)').run()
const groups = process.argv.slice(2)
for (const g of groups) {
  db.prepare('INSERT OR REPLACE INTO kp_rel_progress VALUES (?,?)').run(g, Date.now())
  console.log('已标记:', g)
}
const all = db.prepare('SELECT group_key FROM kp_rel_progress').all() as {group_key:string}[]
console.log('当前进度表:', all.map(r=>r.group_key).join(', '))
db.close()
