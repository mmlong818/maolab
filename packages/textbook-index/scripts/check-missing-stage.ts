#!/usr/bin/env tsx
/**
 * 检查哪些学段/学科的书没有 segments 缓存（即未被 --body-only 处理）
 */
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
;(globalThis as { require?: NodeRequire }).require ??= createRequire(import.meta.url)

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(__dirname, '..', '..', '..')
const INDEX = resolve(REPO, 'packages/textbook-index/data/textbook-index.json')
const SEG_DIR = resolve(REPO, 'packages/textbook-index/data/textbook-body-cache')

const idx = JSON.parse(readFileSync(INDEX, 'utf-8')) as { entries: Array<{id:string;stage:string;subject:string;title:string}> }
const segFiles = new Set(readdirSync(SEG_DIR).filter(f => f.endsWith('.segments.json')).map(f => f.replace('.segments.json', '')))

const missing: Array<{stage:string;subject:string;title:string}> = []
const present: Array<{stage:string;subject:string}> = []

for (const e of idx.entries) {
  if (segFiles.has(e.id)) present.push(e)
  else missing.push(e)
}

// 按学段+学科汇总缺失
const missByKey = new Map<string, number>()
for (const m of missing) {
  const k = `[${m.stage}] ${m.subject}`
  missByKey.set(k, (missByKey.get(k) ?? 0) + 1)
}

console.log(`\n有 segments 的书: ${present.length} / ${idx.entries.length}`)
console.log(`\n=== 缺少 segments（未被 body-only 处理）===`)
;[...missByKey.entries()].sort().forEach(([k, n]) => console.log(` ${k}: ${n} 本`))

// 高中详情
const highMissing = missing.filter(m => m.stage === '高中')
console.log(`\n高中缺失 ${highMissing.length} 本:`)
highMissing.forEach(m => console.log(` ${m.subject}: ${m.title}`))
