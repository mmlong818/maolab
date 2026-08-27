#!/usr/bin/env tsx
/**
 * 清理无效 KP：
 *   - conf < 0.15 且 subject = '思政'（来自复习活动页的元伦理条目）
 *   - 空泛元学习策略（2条）
 * 使用 cascade delete（knowledge_points → chapter_node_knowledge_points / source_refs 等）
 */
import { openSqliteRaw } from '@maolab/db'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB = resolve(__dirname, '..', '..', '..', 'data', 'maolab.db')
const db = openSqliteRaw(DB)

const DRY_RUN = !process.argv.includes('--execute')

const toDelete = db.prepare(`
  SELECT id, canonical_name, subject, confidence FROM knowledge_points
  WHERE (confidence < 0.15 AND subject = '思政')
     OR canonical_name LIKE '%基础知识复习%系统策略%'
     OR canonical_name LIKE '%学习目标与能力维度%'
`).all() as { id: string; canonical_name: string; subject: string; confidence: number }[]

console.log(`\n待删除（共 ${toDelete.length} 条）${DRY_RUN ? ' [DRY RUN]' : ' [EXECUTE]'}:`)
toDelete.forEach(r => console.log(`  "${r.canonical_name}" [${r.subject}] conf=${r.confidence}`))

if (DRY_RUN) {
  console.log('\n加 --execute 参数执行删除')
  db.close()
  process.exit(0)
}

const tx = db.transaction(() => {
  for (const r of toDelete) {
    db.prepare('DELETE FROM knowledge_points WHERE id = ?').run(r.id)
  }
})
tx()

const after = (db.prepare('SELECT COUNT(*) n FROM knowledge_points').get() as { n: number }).n
console.log(`\n✓ 删除完成，当前 KP 总数: ${after}`)
db.close()
