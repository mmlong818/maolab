/**
 * Knowledge Ontology v1.1 — schema 落地验收测试
 *
 * 用 in-memory better-sqlite3 跑 DDL，验证 4 张表 + 关键索引 + 幂等。
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensureKnowledgePointTables } from '../knowledge-point-store.js'

type DB = Database.Database

function listTables(db: DB): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`)
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

function listIndexes(db: DB): string[] {
  return (
    db
      .prepare(`SELECT name FROM sqlite_master WHERE type='index' ORDER BY name`)
      .all() as Array<{ name: string }>
  ).map((r) => r.name)
}

describe('knowledge-point schema (v1.1 migration 0006)', () => {
  let db: DB

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    ensureKnowledgePointTables(db)
  })

  afterEach(() => {
    db.close()
  })

  it('creates all 4 tables', () => {
    const tables = listTables(db)
    expect(tables).toContain('knowledge_point_clusters')
    expect(tables).toContain('knowledge_points')
    expect(tables).toContain('knowledge_point_sources')
    expect(tables).toContain('chapter_node_knowledge_points')
  })

  it('creates canonical_hash unique index on knowledge_points', () => {
    const indexes = listIndexes(db)
    expect(indexes).toContain('idx_kp_canonical_hash')

    const now = Date.now()
    db.prepare(
      `INSERT INTO knowledge_point_clusters (id, canonical_name_en, subject, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('clst_1', 'pythagorean theorem', 'math', 'manual', now, now)

    const insertKp = db.prepare(
      `INSERT INTO knowledge_points
       (id, cluster_id, curriculum_system, canonical_name, canonical_hash, subject, labeled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    insertKp.run('kp_1', 'clst_1', 'pep-2019', '勾股定理', 'hash-abc', 'math', now, now)
    expect(() =>
      insertKp.run('kp_2', 'clst_1', 'pep-2019', '勾股定理 v2', 'hash-abc', 'math', now, now),
    ).toThrow(/UNIQUE/i)
  })

  it('creates cluster_id index on knowledge_points', () => {
    const indexes = listIndexes(db)
    expect(indexes).toContain('idx_kp_cluster')
  })

  it('is idempotent — re-running ensureKnowledgePointTables does not throw', () => {
    expect(() => ensureKnowledgePointTables(db)).not.toThrow()
    expect(() => ensureKnowledgePointTables(db)).not.toThrow()
    expect(listTables(db).filter((t) => t.startsWith('knowledge') || t.startsWith('chapter_node_'))).toHaveLength(4)
  })

  it('inserts a knowledge_point_clusters row successfully', () => {
    const now = Date.now()
    db.prepare(
      `INSERT INTO knowledge_point_clusters (id, canonical_name_en, subject, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run('clst_x', 'newton second law', 'physics', 'manual', now, now)

    const row = db
      .prepare(`SELECT id, canonical_name_en, subject, aliases, verified FROM knowledge_point_clusters WHERE id = ?`)
      .get('clst_x') as { id: string; canonical_name_en: string; subject: string; aliases: string; verified: number }

    expect(row.id).toBe('clst_x')
    expect(row.canonical_name_en).toBe('newton second law')
    expect(row.subject).toBe('physics')
    expect(row.aliases).toBe('[]')
    expect(row.verified).toBe(0)
  })

  it('enforces FK from knowledge_points -> knowledge_point_clusters when foreign_keys=ON', () => {
    const now = Date.now()
    // foreign_keys 已在 beforeEach 中 ON；引用不存在 cluster 应被拒绝
    const insert = db.prepare(
      `INSERT INTO knowledge_points
       (id, cluster_id, curriculum_system, canonical_name, canonical_hash, subject, labeled_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    expect(() =>
      insert.run('kp_orphan', 'clst_missing', 'pep-2019', '孤儿', 'hash-orphan', 'math', now, now),
    ).toThrow(/FOREIGN KEY/i)
  })
})
