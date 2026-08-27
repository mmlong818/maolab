#!/usr/bin/env tsx
/**
 * infer-kp-relations-auto.ts
 *
 * 三种免费(无 LLM)推断:
 *   1. co-occurrence    : 同一 leaf 内 KP -> 互为 sibling (weight 0.7)
 *   2. cluster-sibling  : 同一 cluster 下 KP -> 互为 sibling (weight 0.9)
 *   3. curriculum-order : 教材编排顺序 -> 前面 leaf 的 KP -> 后面 leaf 的 KP 为 prerequisite (weight 0.4)
 *
 * 幂等:启动先 clearRelationsBySource 删三个 source 的旧记录再重写。
 *
 * 用法:
 *   pnpm --filter @maolab/textbook-index exec tsx scripts/infer-kp-relations-auto.ts
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

import { openSqliteRaw } from '@maolab/db'
import {
  insertKpRelationBatch,
  clearRelationsBySource,
  countKpRelations,
  type KpRelationRecord,
} from '@maolab/db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..', '..')
const DB_PATH = resolve(REPO_ROOT, 'data', 'maolab.db')
const TREES_DIR = resolve(__dirname, '..', 'data', 'textbook-trees')
const INDEX_JSON = resolve(__dirname, '..', 'data', 'textbook-index.json')

interface ChapterNode {
  id?: string
  chapterId?: string
  title?: string
  children?: ChapterNode[]
}

interface TreeJson {
  textbookId: string
  chapterTree: ChapterNode[]
}

// 从 chapterTree(数组)递归出所有叶子,保留顺序
function collectLeafIds(tree: ChapterNode[]): string[] {
  const out: string[] = []
  function walk(node: ChapterNode): void {
    const isLeaf = !node.children || node.children.length === 0
    const id = node.id ?? node.chapterId
    if (isLeaf) {
      if (id) out.push(id)
      return
    }
    for (const c of node.children!) walk(c)
  }
  if (Array.isArray(tree)) for (const root of tree) walk(root)
  return out
}

function main(): void {
  console.log('[infer-kp-relations-auto] DB:', DB_PATH)
  const db = openSqliteRaw(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')

  // 0. 清旧
  const cleared = {
    coOccurrence: clearRelationsBySource(db, 'co-occurrence'),
    clusterSibling: clearRelationsBySource(db, 'cluster-sibling'),
    curriculumOrder: clearRelationsBySource(db, 'curriculum-order'),
  }
  console.log('[infer-kp-relations-auto] 清旧记录:', cleared)

  const now = Date.now()
  const allRecords: KpRelationRecord[] = []

  // 1. co-occurrence: 同 leaf 内 KP -> sibling
  console.log('[infer-kp-relations-auto] === 1. co-occurrence ===')
  const leafGroups = db.prepare(`
    SELECT chapter_node_id, GROUP_CONCAT(knowledge_point_id) AS kp_ids
    FROM chapter_node_knowledge_points
    GROUP BY chapter_node_id
    HAVING COUNT(*) > 1
  `).all() as Array<{ chapter_node_id: string; kp_ids: string }>
  let coOccCount = 0
  for (const g of leafGroups) {
    const ids = g.kp_ids.split(',')
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue
        allRecords.push({
          id: randomUUID(),
          fromKpId: ids[i]!,
          toKpId: ids[j]!,
          relationType: 'sibling',
          weight: 0.7,
          source: 'co-occurrence',
          sourceEvidence: `同时出现于 leaf ${g.chapter_node_id}`,
          createdAt: now,
        })
        coOccCount++
      }
    }
  }
  console.log('[infer-kp-relations-auto]   候选', coOccCount, '条 (来自', leafGroups.length, '个 leaf)')

  // 2. cluster-sibling: 同 cluster 下 KP -> sibling (weight 0.9)
  console.log('[infer-kp-relations-auto] === 2. cluster-sibling ===')
  const clusterGroups = db.prepare(`
    SELECT cluster_id, GROUP_CONCAT(id) AS kp_ids
    FROM knowledge_points
    GROUP BY cluster_id
    HAVING COUNT(*) > 1
  `).all() as Array<{ cluster_id: string; kp_ids: string }>
  let clusterCount = 0
  for (const g of clusterGroups) {
    const ids = g.kp_ids.split(',')
    for (let i = 0; i < ids.length; i++) {
      for (let j = 0; j < ids.length; j++) {
        if (i === j) continue
        allRecords.push({
          id: randomUUID(),
          fromKpId: ids[i]!,
          toKpId: ids[j]!,
          relationType: 'sibling',
          weight: 0.9,
          source: 'cluster-sibling',
          sourceEvidence: `同 cluster ${g.cluster_id}`,
          createdAt: now,
        })
        clusterCount++
      }
    }
  }
  console.log('[infer-kp-relations-auto]   候选', clusterCount, '条 (来自', clusterGroups.length, '个 cluster)')

  // 3. curriculum-order: 同教材内 leaf 顺序 -> prerequisite
  console.log('[infer-kp-relations-auto] === 3. curriculum-order ===')
  const index = JSON.parse(readFileSync(INDEX_JSON, 'utf-8')) as { entries: Array<{ id: string }> }
  let curriculumCount = 0
  let processedTrees = 0
  for (const entry of index.entries) {
    let tree: TreeJson
    try {
      tree = JSON.parse(readFileSync(resolve(TREES_DIR, `${entry.id}.json`), 'utf-8')) as TreeJson
    } catch { continue }
    const leafIds = collectLeafIds(tree.chapterTree as ChapterNode[])
    if (leafIds.length < 2) continue

    // 拿每个 leaf 关联的 KP id (用一次 IN 查询)
    const placeholders = leafIds.map(() => '?').join(',')
    const rows = db.prepare(`
      SELECT chapter_node_id, knowledge_point_id
      FROM chapter_node_knowledge_points
      WHERE chapter_node_id IN (${placeholders})
    `).all(...leafIds) as Array<{ chapter_node_id: string; knowledge_point_id: string }>
    if (rows.length === 0) continue
    const leafToKps = new Map<string, string[]>()
    for (const r of rows) {
      if (!leafToKps.has(r.chapter_node_id)) leafToKps.set(r.chapter_node_id, [])
      leafToKps.get(r.chapter_node_id)!.push(r.knowledge_point_id)
    }

    // 相邻 leaf 之间建 prerequisite (前 -> 后)
    for (let i = 0; i < leafIds.length - 1; i++) {
      const prev = leafToKps.get(leafIds[i]!) ?? []
      const next = leafToKps.get(leafIds[i + 1]!) ?? []
      if (prev.length === 0 || next.length === 0) continue
      for (const a of prev) {
        for (const b of next) {
          if (a === b) continue
          allRecords.push({
            id: randomUUID(),
            fromKpId: a,
            toKpId: b,
            relationType: 'prerequisite',
            weight: 0.4,
            source: 'curriculum-order',
            sourceEvidence: `教材 ${entry.id} 内 leaf ${leafIds[i]!.slice(0, 8)} 早于 leaf ${leafIds[i+1]!.slice(0, 8)}`,
            createdAt: now,
          })
          curriculumCount++
        }
      }
    }
    processedTrees++
  }
  console.log('[infer-kp-relations-auto]   候选', curriculumCount, '条 (来自', processedTrees, '本教材)')

  // 入库
  console.log('[infer-kp-relations-auto] === 入库 ===')
  console.log('[infer-kp-relations-auto]   总候选:', allRecords.length, '条')
  const inserted = insertKpRelationBatch(db, allRecords)
  console.log('[infer-kp-relations-auto]   实际插入:', inserted, '条 (其余被 unique 索引 OR IGNORE 掉)')

  console.log('[infer-kp-relations-auto] === 最终统计 ===')
  console.log(JSON.stringify(countKpRelations(db), null, 2))
}

main()
