/**
 * 一次性手动建表脚本 — Knowledge Ontology v1.1
 *
 * 用法：
 *   pnpm --filter @maolab/db tsx scripts/init-kp-tables.ts
 *
 * 注：本脚本**不**由 runtime 自动调用。PR2 时再决定是否接到启动路径。
 */
import Database from 'better-sqlite3'

import { ensureKnowledgePointTables } from '../src/knowledge-point-store.js'

function main(): void {
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  const path = url.replace(/^file:/, '')
  // eslint-disable-next-line no-console
  console.log(`[init-kp-tables] opening ${path}`)
  const db = new Database(path)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  ensureKnowledgePointTables(db)

  const rows = db
    .prepare(
      `SELECT type, name FROM sqlite_master
       WHERE type IN ('table','index')
         AND name LIKE 'knowledge%' OR name LIKE 'chapter_node_knowledge%'
         OR name LIKE 'idx_kp%' OR name LIKE 'idx_kpc%' OR name LIKE 'idx_kps%' OR name LIKE 'idx_cnkp%'
       ORDER BY type, name`,
    )
    .all() as Array<{ type: string; name: string }>

  // eslint-disable-next-line no-console
  console.log('[init-kp-tables] objects created:')
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${r.type.padEnd(6)} ${r.name}`)
  }
  db.close()
}

main()
