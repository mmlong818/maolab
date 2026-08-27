/**
 * Knowledge Ontology v1.1 — CRUD repo (PR2.5)
 *
 * 边界：
 *   - 只做 prepared-statement 单事务 CRUD，不做 LLM/网络/业务编排
 *   - 幂等：以 canonical_hash 为 KP 唯一键；重复 KP 仅追加 source_ref
 *   - 与 knowledge-point-store.ts 的 DDL 严格对齐（不重复 DDL）
 */
import { randomUUID } from 'node:crypto'

import type {
  KnowledgePoint,
  KnowledgePointCluster,
  SourceRef,
} from '@maolab/shared-types'
import { assertClusterId } from '@maolab/shared-types'

import type { BetterSqliteDb } from './knowledge-point-store.js'

// ============================================================
// Row 形态（与 DDL 一一对应）
// ============================================================

interface KpRow {
  id: string
  cluster_id: string
  curriculum_system: string
  canonical_name: string
  aliases: string
  canonical_hash: string
  subject: string
  grade_band: string
  title: string
  summary: string
  annotations: string
  confidence: number | null
  verified: number
  annotator_version: string
  labeled_at: number
  curated_at: number | null
  updated_at: number
}

function rowToKp(row: KpRow): KnowledgePoint {
  const aliases = JSON.parse(row.aliases) as string[]
  const dimensions =
    row.annotations && row.annotations !== '{}'
      ? (JSON.parse(row.annotations) as NonNullable<KnowledgePoint['dimensions']>)
      : undefined
  const out: KnowledgePoint = {
    id: row.id,
    clusterId: row.cluster_id,
    canonicalName: row.canonical_name,
    aliases,
    subject: row.subject,
    curriculumSystem: row.curriculum_system,
    canonicalHash: row.canonical_hash,
    provenance: { sourceRefs: [] },
    createdAt: row.labeled_at,
    updatedAt: row.updated_at,
    verified: row.verified !== 0,
  }
  if (row.grade_band) out.gradeBand = row.grade_band
  if (dimensions) out.dimensions = dimensions
  if (row.confidence != null) out.confidence = row.confidence
  return out
}

// ============================================================
// Cluster
// ============================================================

export function insertCluster(
  db: BetterSqliteDb,
  cluster: KnowledgePointCluster,
): void {
  // 灰度断言: env MAOLAB_STRICT_CLUSTER_ID=1 时强制新格式 (clst_ULID)
  // 非严格模式同样校验, 接受旧 UUID 兼容存量
  assertClusterId(cluster.id)
  db.prepare(
    `INSERT INTO knowledge_point_clusters
       (id, canonical_name_en, subject, aliases, created_by, verified, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    cluster.id,
    cluster.canonicalNameEn,
    cluster.subject,
    JSON.stringify([]),
    'auto-singleton',
    0,
    cluster.createdAt,
    cluster.updatedAt,
  )
}

// ============================================================
// KnowledgePoint
// ============================================================

export function insertKnowledgePoint(
  db: BetterSqliteDb,
  kp: KnowledgePoint,
): void {
  // KP 引用 cluster, 必须先校验 cluster id 合法 (新或旧格式)
  assertClusterId(kp.clusterId)
  db.prepare(
    `INSERT INTO knowledge_points
       (id, cluster_id, curriculum_system, canonical_name, aliases, canonical_hash,
        subject, grade_band, title, summary, annotations, confidence, verified,
        annotator_version, labeled_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    kp.id,
    kp.clusterId,
    kp.curriculumSystem,
    kp.canonicalName,
    JSON.stringify(kp.aliases),
    kp.canonicalHash,
    kp.subject,
    kp.gradeBand ?? '',
    kp.canonicalName,
    '',
    JSON.stringify(kp.dimensions ?? {}),
    kp.confidence ?? null,
    kp.verified ? 1 : 0,
    '',
    kp.createdAt,
    kp.updatedAt,
  )
}

export function findKpByCanonicalHash(
  db: BetterSqliteDb,
  canonicalHash: string,
): KnowledgePoint | null {
  const row = db
    .prepare(`SELECT * FROM knowledge_points WHERE canonical_hash = ? LIMIT 1`)
    .get(canonicalHash) as KpRow | undefined
  if (!row) return null
  return rowToKp(row)
}

// ============================================================
// SourceRefs
// ============================================================

export function insertSourceRefs(
  db: BetterSqliteDb,
  kpId: string,
  refs: SourceRef[],
): void {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO knowledge_point_sources
       (id, knowledge_point_id, source, external_id, evidence_snippet, confidence, ingested_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const ref of refs) {
    stmt.run(
      randomUUID(),
      kpId,
      ref.kind,
      ref.leafNodeId ?? ref.systemId ?? null,
      ref.notes ?? null,
      ref.confidence ?? null,
      ref.capturedAt,
    )
  }
}

// ============================================================
// chapter_node <-> KP link
// ============================================================

export function linkChapterNodeKp(
  db: BetterSqliteDb,
  chapterNodeId: string,
  kpId: string,
  position: number,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO chapter_node_knowledge_points
       (chapter_node_id, knowledge_point_id, position, created_at)
     VALUES (?, ?, ?, ?)`,
  ).run(chapterNodeId, kpId, position, Date.now())
}
