/**
 * kp-relations-repo — 知识点关系表 CRUD。
 *
 * 关系类型：
 *   prerequisite : 先修 (掌握 A 才能学 B)
 *   contains     : 包含 (KP 集合包含子 KP)
 *   sibling      : 平行同辈 (同一类型不同实例)
 *   related      : 相关 (跨学科联想 / 主题接近)
 *   leads-to     : 下游 (A 是 B 的前置, 反向; 用于推荐"下一步")
 *
 * 来源：
 *   co-occurrence    : 同一 leaf 内出现
 *   cluster-sibling  : 同一 cluster 内不同 KP
 *   curriculum-order : 教材编排顺序
 *   llm-inferred     : LLM 推断 (后续 Agent 跑)
 *   manual           : 教师手动 (本期不做)
 */

import type { BetterSqliteDb } from './knowledge-point-store.js'

export type KpRelationType = 'prerequisite' | 'contains' | 'sibling' | 'related' | 'leads-to'
export type KpRelationSource = 'co-occurrence' | 'cluster-sibling' | 'curriculum-order' | 'llm-inferred' | 'manual'

export interface KpRelationRecord {
  id: string
  fromKpId: string
  toKpId: string
  relationType: KpRelationType
  weight: number
  source: KpRelationSource
  sourceEvidence: string | null
  createdAt: number
}

interface KpRelationRow {
  id: string
  from_kp_id: string
  to_kp_id: string
  relation_type: string
  weight: number
  source: string
  source_evidence: string | null
  created_at: number
}

function rowToRecord(row: KpRelationRow): KpRelationRecord {
  return {
    id: row.id,
    fromKpId: row.from_kp_id,
    toKpId: row.to_kp_id,
    relationType: row.relation_type as KpRelationType,
    weight: row.weight,
    source: row.source as KpRelationSource,
    sourceEvidence: row.source_evidence,
    createdAt: row.created_at,
  }
}

export function insertKpRelation(db: BetterSqliteDb, record: KpRelationRecord): void {
  db.prepare(`
    INSERT OR IGNORE INTO kp_relations
      (id, from_kp_id, to_kp_id, relation_type, weight, source, source_evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.fromKpId,
    record.toKpId,
    record.relationType,
    record.weight,
    record.source,
    record.sourceEvidence,
    record.createdAt,
  )
}

export function insertKpRelationBatch(db: BetterSqliteDb, records: KpRelationRecord[]): number {
  if (records.length === 0) return 0
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO kp_relations
      (id, from_kp_id, to_kp_id, relation_type, weight, source, source_evidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  let inserted = 0
  const tx = db.transaction((items: KpRelationRecord[]) => {
    for (const r of items) {
      const info = stmt.run(r.id, r.fromKpId, r.toKpId, r.relationType, r.weight, r.source, r.sourceEvidence, r.createdAt)
      if (info.changes > 0) inserted++
    }
  })
  tx(records)
  return inserted
}

export function findRelationsFromKp(db: BetterSqliteDb, fromKpId: string, type?: KpRelationType): KpRelationRecord[] {
  const sql = type
    ? 'SELECT * FROM kp_relations WHERE from_kp_id = ? AND relation_type = ? ORDER BY weight DESC'
    : 'SELECT * FROM kp_relations WHERE from_kp_id = ? ORDER BY weight DESC'
  const rows = type
    ? db.prepare(sql).all(fromKpId, type) as KpRelationRow[]
    : db.prepare(sql).all(fromKpId) as KpRelationRow[]
  return rows.map(rowToRecord)
}

export function findRelationsToKp(db: BetterSqliteDb, toKpId: string, type?: KpRelationType): KpRelationRecord[] {
  const sql = type
    ? 'SELECT * FROM kp_relations WHERE to_kp_id = ? AND relation_type = ? ORDER BY weight DESC'
    : 'SELECT * FROM kp_relations WHERE to_kp_id = ? ORDER BY weight DESC'
  const rows = type
    ? db.prepare(sql).all(toKpId, type) as KpRelationRow[]
    : db.prepare(sql).all(toKpId) as KpRelationRow[]
  return rows.map(rowToRecord)
}

export function findRelationsBetween(db: BetterSqliteDb, kpAId: string, kpBId: string): KpRelationRecord[] {
  const rows = db.prepare(`
    SELECT * FROM kp_relations
    WHERE (from_kp_id = ? AND to_kp_id = ?) OR (from_kp_id = ? AND to_kp_id = ?)
    ORDER BY weight DESC
  `).all(kpAId, kpBId, kpBId, kpAId) as KpRelationRow[]
  return rows.map(rowToRecord)
}

export function clearRelationsBySource(db: BetterSqliteDb, source: KpRelationSource): number {
  const info = db.prepare('DELETE FROM kp_relations WHERE source = ?').run(source)
  return info.changes
}

export function countKpRelations(db: BetterSqliteDb): { total: number; bySource: Record<string, number>; byType: Record<string, number> } {
  const total = (db.prepare('SELECT COUNT(*) c FROM kp_relations').get() as { c: number }).c
  const bySourceRows = db.prepare('SELECT source, COUNT(*) c FROM kp_relations GROUP BY source').all() as Array<{ source: string; c: number }>
  const byTypeRows = db.prepare('SELECT relation_type, COUNT(*) c FROM kp_relations GROUP BY relation_type').all() as Array<{ relation_type: string; c: number }>
  const bySource: Record<string, number> = {}
  for (const r of bySourceRows) bySource[r.source] = r.c
  const byType: Record<string, number> = {}
  for (const r of byTypeRows) byType[r.relation_type] = r.c
  return { total, bySource, byType }
}
