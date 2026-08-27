#!/usr/bin/env tsx
import { openSqliteRaw } from '@maolab/db'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

const DB = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', 'maolab.db')
const INDEX = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'textbook-index.json')

const db = openSqliteRaw(DB)

// 学科分布
const subjects = db.prepare('SELECT subject, COUNT(*) n FROM knowledge_points GROUP BY subject ORDER BY n DESC').all() as any[]
console.log('=== 学科分布 ===')
subjects.forEach(r => console.log(` ${r.subject}: ${r.n} KP`))

// 学段分布
const grades = db.prepare('SELECT grade_band, COUNT(*) n FROM knowledge_points GROUP BY grade_band ORDER BY n DESC').all() as any[]
console.log('\n=== 学段分布 ===')
grades.forEach(r => console.log(` ${r.grade_band || '(未标注)'}: ${r.n} KP`))

// 总数
const total = (db.prepare('SELECT COUNT(*) n FROM knowledge_points').get() as any).n
const leaves = (db.prepare('SELECT COUNT(DISTINCT chapter_node_id) n FROM chapter_node_knowledge_points').get() as any).n
console.log(`\n总计: ${total} KP，覆盖 ${leaves} 个章节`)
db.close()

// 教材来源（从 textbook-index.json）
if (existsSync(INDEX)) {
  const idx = JSON.parse(readFileSync(INDEX, 'utf-8')) as { entries: any[] }
  const byStageSubject = new Map<string, Set<string>>()
  for (const e of idx.entries) {
    const key = `${e.stage}|${e.subject}`
    if (!byStageSubject.has(key)) byStageSubject.set(key, new Set())
    byStageSubject.get(key)!.add(e.title ?? e.id)
  }
  console.log('\n=== 教材覆盖（textbook-index.json，共 ' + idx.entries.length + ' 本）===')
  const sorted = [...byStageSubject.entries()].sort()
  for (const [key, titles] of sorted) {
    const [stage, subject] = key.split('|')
    console.log(` [${stage}] ${subject}: ${titles.size} 本`)
  }
}
