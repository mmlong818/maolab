#!/usr/bin/env tsx
import { openSqliteRaw } from '@maolab/db'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB = resolve(__dirname, '..', '..', '..', 'data', 'maolab.db')
const db = openSqliteRaw(DB)

type Row = Record<string, unknown>

const short = db.prepare("SELECT canonical_name,subject,confidence FROM knowledge_points WHERE length(canonical_name)<4").all() as Row[]
console.log(`\n=== 名字极短 (<4字): ${short.length} 条 ===`)
short.slice(0, 20).forEach(r => console.log(` "${r.canonical_name}" [${r.subject}] conf=${r.confidence}`))

const lowConf = db.prepare("SELECT canonical_name,subject,confidence FROM knowledge_points WHERE confidence < 0.3 ORDER BY confidence").all() as Row[]
console.log(`\n=== 置信度 < 0.3: ${lowConf.length} 条 ===`)
lowConf.slice(0, 20).forEach(r => console.log(` "${r.canonical_name}" [${r.subject}] conf=${r.confidence}`))

const vague = db.prepare("SELECT canonical_name,subject FROM knowledge_points WHERE canonical_name LIKE '%基础知识%' OR canonical_name LIKE '%重点内容%' OR canonical_name LIKE '%知识点%' OR canonical_name LIKE '%学习目标%' OR canonical_name LIKE '%本节课%'").all() as Row[]
console.log(`\n=== 空泛无信息: ${vague.length} 条 ===`)
vague.forEach(r => console.log(` "${r.canonical_name}" [${r.subject}]`))

const dupes = db.prepare("SELECT canonical_name,subject,COUNT(*) n FROM knowledge_points GROUP BY canonical_name,subject HAVING n>1 ORDER BY n DESC").all() as Row[]
console.log(`\n=== 同名重复 (同学科): ${dupes.length} 组 ===`)
dupes.slice(0, 20).forEach(r => console.log(` "${r.canonical_name}" [${r.subject}] x${r.n}`))

const totalKp = (db.prepare("SELECT COUNT(*) n FROM knowledge_points").get() as Row).n
console.log(`\n总 KP: ${totalKp}`)
db.close()
