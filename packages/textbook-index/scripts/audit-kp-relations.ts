#!/usr/bin/env tsx
import { openSqliteRaw } from '@maolab/db'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)
const DB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'maolab.db')
const db = openSqliteRaw(DB)

// 1. 重复关系（相同 from+to+type）
const dupes = db.prepare(`
  SELECT from_kp_id, to_kp_id, relation_type, COUNT(*) n
  FROM kp_relations GROUP BY from_kp_id, to_kp_id, relation_type HAVING n > 1
`).all() as any[]
console.log(`\n=== 重复关系: ${dupes.length} 组 ===`)
dupes.slice(0,5).forEach(r => console.log(` ${r.from_kp_id.slice(0,8)}→${r.to_kp_id.slice(0,8)} [${r.relation_type}] x${r.n}`))

// 2. 自引用（from = to）
const selfRef = (db.prepare('SELECT COUNT(*) n FROM kp_relations WHERE from_kp_id = to_kp_id').get() as any).n
console.log(`\n=== 自引用: ${selfRef} 条 ===`)

// 3. 跨学科关系（from/to 学科不同）
const crossSubj = db.prepare(`
  SELECT r.relation_type, a.subject sa, b.subject sb, COUNT(*) n
  FROM kp_relations r
  JOIN knowledge_points a ON a.id = r.from_kp_id
  JOIN knowledge_points b ON b.id = r.to_kp_id
  WHERE a.subject != b.subject
  GROUP BY r.relation_type, a.subject, b.subject
  ORDER BY n DESC LIMIT 15
`).all() as any[]
console.log(`\n=== 跨学科关系（抽样，应该很少）===`)
crossSubj.forEach(r => console.log(` [${r.relation_type}] ${r.sa}→${r.sb}: ${r.n} 条`))

// 4. 随机抽样 20 条看质量
const sample = db.prepare(`
  SELECT r.relation_type, r.source_evidence, a.canonical_name fn, b.canonical_name tn,
         a.subject, a.grade_band
  FROM kp_relations r
  JOIN knowledge_points a ON a.id = r.from_kp_id
  JOIN knowledge_points b ON b.id = r.to_kp_id
  ORDER BY RANDOM() LIMIT 20
`).all() as any[]
console.log(`\n=== 随机抽样 20 条 ===`)
sample.forEach(r =>
  console.log(` [${r.relation_type}][${r.subject}/${r.grade_band}] ${r.fn} → ${r.tn}`)
)

// 5. 总体统计
const total = (db.prepare('SELECT COUNT(*) n FROM kp_relations').get() as any).n
const byType = db.prepare('SELECT relation_type, COUNT(*) n FROM kp_relations GROUP BY relation_type').all() as any[]
console.log(`\n=== 总计: ${total} 条 ===`)
byType.forEach(r => console.log(` ${r.relation_type}: ${r.n}`))
db.close()
