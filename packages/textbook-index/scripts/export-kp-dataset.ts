#!/usr/bin/env tsx
/**
 * 导出 KP 数据集到 JSON 文件（仅 pep-cn，排除 maolab-course 内部课程数据）
 *   kp-dataset/knowledge_points.json
 *   kp-dataset/kp_relations.json
 *   kp-dataset/meta.json
 */
import { openSqliteRaw } from '@maolab/db'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB = resolve(__dirname, '..', '..', '..', 'data', 'maolab.db')
const OUT = resolve(__dirname, '..', '..', '..', 'kp-dataset')

const db = openSqliteRaw(DB)
mkdirSync(OUT, { recursive: true })

const kps = db.prepare(`
  SELECT id, canonical_name, subject, grade_band, curriculum_system,
         confidence, aliases, annotations, summary, title
  FROM knowledge_points
  WHERE curriculum_system = 'pep-cn'
  ORDER BY grade_band, subject, canonical_name
`).all()

writeFileSync(`${OUT}/knowledge_points.json`, JSON.stringify(kps, null, 2), 'utf-8')
console.log(`✓ knowledge_points.json: ${kps.length} 条`)

const rels = db.prepare(`
  SELECT r.id, r.from_kp_id, r.to_kp_id, r.relation_type, r.source_evidence,
         a.canonical_name AS from_name, a.subject AS from_subject,
         b.canonical_name AS to_name, b.subject AS to_subject
  FROM kp_relations r
  JOIN knowledge_points a ON a.id = r.from_kp_id
  JOIN knowledge_points b ON b.id = r.to_kp_id
  WHERE a.curriculum_system = 'pep-cn' AND b.curriculum_system = 'pep-cn'
  ORDER BY r.relation_type, a.subject, a.canonical_name
`).all()

writeFileSync(`${OUT}/kp_relations.json`, JSON.stringify(rels, null, 2), 'utf-8')
console.log(`✓ kp_relations.json: ${rels.length} 条`)

const meta = {
  exported_at: new Date().toISOString(),
  total_kp: kps.length,
  total_relations: rels.length,
  grade_bands: [...new Set((kps as any[]).map((k: any) => k.grade_band))].sort(),
  subjects: [...new Set((kps as any[]).map((k: any) => k.subject))].sort(),
  relation_types: ['prerequisite', 'leads-to', 'related'],
  schema: {
    knowledge_points: 'id, canonical_name, subject, grade_band, curriculum_system, confidence, aliases, annotations, summary, title',
    kp_relations: 'id, from_kp_id, to_kp_id, relation_type, source_evidence, from_name, from_subject, to_name, to_subject',
  },
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify(meta, null, 2), 'utf-8')
console.log(`✓ meta.json`)
console.log(`\n输出目录: ${OUT}`)
db.close()
