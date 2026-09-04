#!/usr/bin/env tsx
/**
 * 按学段×科目拆分导出 KP 数据集（仅 pep-cn，避免单文件过大）
 *   kp-dataset/split/<学段>/<科目>.json   — 含该组的 knowledge_points + relations
 *   kp-dataset/split/index.json           — 总索引（文件清单 + 计数）
 *
 * 关系已验证全部不跨科目/学段，可干净归组。
 */
import { openSqliteRaw } from '@maolab/db'
import { writeFileSync, mkdirSync, statSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB = resolve(__dirname, '..', '..', '..', 'data', 'maolab.db')
const OUT = resolve(__dirname, '..', '..', '..', 'kp-dataset', 'split')

const db = openSqliteRaw(DB)

const groups = db.prepare(`
  SELECT grade_band, subject, COUNT(*) AS kp_count
  FROM knowledge_points
  WHERE curriculum_system = 'pep-cn'
  GROUP BY grade_band, subject
  ORDER BY grade_band, subject
`).all() as { grade_band: string; subject: string; kp_count: number }[]

const kpStmt = db.prepare(`
  SELECT id, canonical_name, subject, grade_band, curriculum_system,
         confidence, aliases, annotations, summary, title
  FROM knowledge_points
  WHERE grade_band = ? AND subject = ? AND curriculum_system = 'pep-cn'
  ORDER BY canonical_name
`)

const relStmt = db.prepare(`
  SELECT r.id, r.from_kp_id, r.to_kp_id, r.relation_type, r.source_evidence,
         a.canonical_name AS from_name, b.canonical_name AS to_name
  FROM kp_relations r
  JOIN knowledge_points a ON a.id = r.from_kp_id
  JOIN knowledge_points b ON b.id = r.to_kp_id
  WHERE a.grade_band = ? AND a.subject = ? AND a.curriculum_system = 'pep-cn' AND b.curriculum_system = 'pep-cn'
  ORDER BY r.relation_type, a.canonical_name
`)

const index: {
  exported_at: string
  total_kp: number
  total_relations: number
  files: { path: string; grade_band: string; subject: string; kp_count: number; relation_count: number; size_kb: number }[]
} = { exported_at: new Date().toISOString(), total_kp: 0, total_relations: 0, files: [] }

for (const g of groups) {
  const kps = kpStmt.all(g.grade_band, g.subject)
  const rels = relStmt.all(g.grade_band, g.subject)
  const dir = resolve(OUT, g.grade_band)
  mkdirSync(dir, { recursive: true })
  const file = resolve(dir, `${g.subject}.json`)
  writeFileSync(file, JSON.stringify({
    grade_band: g.grade_band,
    subject: g.subject,
    kp_count: kps.length,
    relation_count: rels.length,
    knowledge_points: kps,
    relations: rels,
  }, null, 2), 'utf-8')
  const sizeKb = Math.round(statSync(file).size / 1024)
  index.total_kp += kps.length
  index.total_relations += rels.length
  index.files.push({
    path: `${g.grade_band}/${g.subject}.json`,
    grade_band: g.grade_band,
    subject: g.subject,
    kp_count: kps.length,
    relation_count: rels.length,
    size_kb: sizeKb,
  })
  console.log(`✓ ${g.grade_band}/${g.subject}.json  KP=${kps.length}  REL=${rels.length}  ${sizeKb}KB`)
}

writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(index, null, 2), 'utf-8')
console.log(`\n✓ index.json  共 ${index.files.length} 个文件，KP=${index.total_kp}，REL=${index.total_relations}`)
console.log(`输出目录: ${OUT}`)
db.close()
