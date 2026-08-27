#!/usr/bin/env tsx
/**
 * 检视某棵树已抽取的 KP (核对是否扎根教材正文, 非凭标题猜)
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/inspect-kp.ts <treeId>
 */

import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const __require = createRequire(import.meta.url)
;(globalThis as { require?: NodeRequire }).require = __require

import { openSqliteRaw } from '@maolab/db'
import { collectLeaves, type TextbookFullInfo } from '../src/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const DB_PATH = resolve(REPO_ROOT, 'data/maolab.db')
const TREES_DIR = resolve(REPO_ROOT, 'packages/textbook-index/data/textbook-trees')

interface KpRow {
  id: string
  canonical_name: string
  canonical_name_en: string
  confidence: number | null
  annotations: string
  position: number
}

function main(): void {
  const treeId = process.argv[2] ?? '955fadcc-fb53-4225-b4d9-af191d7a1553'
  const tree = JSON.parse(readFileSync(resolve(TREES_DIR, `${treeId}.json`), 'utf-8')) as TextbookFullInfo
  const leaves = collectLeaves(tree.chapterTree)
  const titleById = new Map(leaves.map((l) => [l.node.id, l.node.title]))

  const db = openSqliteRaw(DB_PATH)
  const stmt = db.prepare(`
    SELECT kp.id, kp.canonical_name, c.canonical_name_en AS canonical_name_en, kp.confidence, kp.annotations, cnkp.position
    FROM chapter_node_knowledge_points cnkp
    JOIN knowledge_points kp ON kp.id = cnkp.knowledge_point_id
    JOIN knowledge_point_clusters c ON c.id = kp.cluster_id
    WHERE cnkp.chapter_node_id = ?
    ORDER BY cnkp.position
  `)

  for (const [leafId, title] of titleById) {
    const rows = stmt.all(leafId) as KpRow[]
    if (rows.length === 0) continue
    console.log(`\n=== ${title} (${rows.length} KP) ===`)
    for (const r of rows) {
      let objectives: string[] = []
      let reasoning = ''
      let kType = ''
      try {
        const ann = JSON.parse(r.annotations) as Record<string, { value?: unknown }>
        const lo = ann.learningObjectives?.value
        if (Array.isArray(lo)) objectives = lo as string[]
        const kt = ann.knowledgeType?.value
        if (typeof kt === 'string') kType = kt
        const rs = (ann as Record<string, unknown>).reasoning
        if (typeof rs === 'string') reasoning = rs
      } catch {
        /* ignore */
      }
      console.log(`  • ${r.canonical_name} | ${r.canonical_name_en} | ${kType} | conf=${r.confidence ?? '?'}`)
      if (objectives.length) console.log(`      目标: ${objectives.join(' / ')}`)
      if (reasoning) console.log(`      理由: ${reasoning}`)
    }
  }
  db.close()
}

main()
