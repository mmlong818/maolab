/**
 * v1.1 PR2a — student_responses 列扩展 + 懒回填集成测试
 *
 * 该文件验证 ALTER 兜底逻辑、与 KP 表协作的懒回填路径。
 * student-response-store 源码在 app 包；这里在 db 包做 schema 级集成验证。
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensureKnowledgePointTables } from '../knowledge-point-store.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — 跨包相对路径
import {
  ensureStudentResponseColumns,
} from '../../../../app/app/lib/v2/student-response-store.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — 跨包相对路径
import {
  resolveKpCluster,
  __resetKpClusterCacheForTest,
} from '../../../../app/app/lib/v2/kp-cluster-mapper.js'

type DB = Database.Database

const BASE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS student_responses (
  id TEXT PRIMARY KEY NOT NULL,
  course_id TEXT NOT NULL,
  atom_id TEXT NOT NULL,
  student_id TEXT NOT NULL DEFAULT 'self',
  objective_ids TEXT NOT NULL DEFAULT '[]',
  atom_type TEXT NOT NULL,
  response TEXT NOT NULL,
  correct INTEGER,
  time_spent_ms INTEGER,
  difficulty_level TEXT NOT NULL DEFAULT 'standard',
  submitted_at INTEGER NOT NULL
);
`

describe('student_responses v1.1 schema + backfill', () => {
  let db: DB

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    db.exec(BASE_TABLE_SQL)
    ensureStudentResponseColumns(db)
    ensureKnowledgePointTables(db)
    __resetKpClusterCacheForTest()
  })

  afterEach(() => {
    db.close()
  })

  it('ALTER adds 3 new columns + 3 new indexes (idempotent)', () => {
    const cols = (db.prepare(`PRAGMA table_info(student_responses)`).all() as Array<{ name: string }>).map(
      (r) => r.name
    )
    expect(cols).toContain('knowledge_point_cluster_id')
    expect(cols).toContain('knowledge_point_id')
    expect(cols).toContain('atom_source_leaf_id')

    const idx = (
      db
        .prepare(`SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='student_responses'`)
        .all() as Array<{ name: string }>
    ).map((r) => r.name)
    expect(idx).toContain('idx_sr_cluster')
    expect(idx).toContain('idx_sr_kp')
    expect(idx).toContain('idx_sr_leaf')

    // 再调一次应当幂等不报错
    expect(() => ensureStudentResponseColumns(db)).not.toThrow()
  })

  it('insert response with NULL cluster_id, then resolveKpCluster yields mapping for backfill', () => {
    // Seed KP
    const now = Date.now()
    db.prepare(
      `INSERT INTO knowledge_point_clusters (id, canonical_name_en, subject, aliases, created_by, verified, created_at, updated_at)
       VALUES ('c-x', 'pythagoras', 'math', '[]', 'auto-singleton', 0, ?, ?)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO knowledge_points (id, cluster_id, curriculum_system, canonical_name, aliases, canonical_hash,
        subject, grade_band, title, summary, annotations, verified, annotator_version, labeled_at, updated_at)
       VALUES ('kp-x', 'c-x', 'pep-2019', '勾股定理', '[]', 'h', 'math', '', '', '', '{}', 0, 'v1', ?, ?)`
    ).run(now, now)

    db.prepare(
      `INSERT INTO student_responses
        (id, course_id, atom_id, student_id, objective_ids, atom_type, response, correct, time_spent_ms, difficulty_level, submitted_at)
       VALUES ('sr-1', 'course-1', 'atom-1', 'self', ?, 'mcq', '{}', 1, 1000, 'standard', ?)`
    ).run(JSON.stringify(['kp-x']), now)

    // 读出 → cluster_id NULL
    const before = db.prepare(`SELECT knowledge_point_cluster_id FROM student_responses WHERE id='sr-1'`).get() as {
      knowledge_point_cluster_id: string | null
    }
    expect(before.knowledge_point_cluster_id).toBeNull()

    // resolve 应命中
    const mapping = resolveKpCluster(db, { objectiveId: 'kp-x' })
    expect(mapping).toEqual({ knowledgePointId: 'kp-x', knowledgePointClusterId: 'c-x' })

    // 手动模拟回填写回（store 里是异步 setImmediate）
    db.prepare(
      `UPDATE student_responses SET knowledge_point_cluster_id=?, knowledge_point_id=? WHERE id=?`
    ).run(mapping.knowledgePointClusterId, mapping.knowledgePointId, 'sr-1')

    const after = db.prepare(`SELECT knowledge_point_cluster_id, knowledge_point_id FROM student_responses WHERE id='sr-1'`).get() as {
      knowledge_point_cluster_id: string
      knowledge_point_id: string
    }
    expect(after.knowledge_point_cluster_id).toBe('c-x')
    expect(after.knowledge_point_id).toBe('kp-x')
  })

  it('PR3a: atomSourceLeafId backfill via leaf → chapter_node_knowledge_points → KP', () => {
    const now = Date.now()
    // Seed cluster + kp + chapter_node link
    db.prepare(
      `INSERT INTO knowledge_point_clusters (id, canonical_name_en, subject, aliases, created_by, verified, created_at, updated_at)
       VALUES ('c-y', 'leaf-resolve', 'math', '[]', 'auto-singleton', 0, ?, ?)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO knowledge_points (id, cluster_id, curriculum_system, canonical_name, aliases, canonical_hash,
        subject, grade_band, title, summary, annotations, verified, annotator_version, labeled_at, updated_at)
       VALUES ('kp-y', 'c-y', 'pep-2019', '函数', '[]', 'hy', 'math', '', '', '', '{}', 0, 'v1', ?, ?)`
    ).run(now, now)
    db.prepare(
      `INSERT INTO chapter_node_knowledge_points (chapter_node_id, knowledge_point_id, position, created_at)
       VALUES ('leaf-x', 'kp-y', 0, ?)`
    ).run(now)

    // Insert sr with atom_source_leaf_id='leaf-x', objective_ids=['unknown_obj']
    db.prepare(
      `INSERT INTO student_responses
        (id, course_id, atom_id, student_id, objective_ids, atom_type, response, correct,
         time_spent_ms, difficulty_level, submitted_at, atom_source_leaf_id)
       VALUES ('sr-leaf', 'course-1', 'atom-2', 'self', ?, 'mcq', '{}', 1, 100, 'standard', ?, 'leaf-x')`
    ).run(JSON.stringify(['unknown_obj']), now)

    // resolveKpCluster with both — objectiveId misses, leaf hits
    const mapping = resolveKpCluster(db, {
      objectiveId: 'unknown_obj',
      atomSourceLeafId: 'leaf-x',
    })
    expect(mapping).toEqual({ knowledgePointId: 'kp-y', knowledgePointClusterId: 'c-y' })
  })

  it('PR3a: no objective + no leaf → mapping null, no throw', () => {
    const r = resolveKpCluster(db, {})
    expect(r).toEqual({ knowledgePointId: null, knowledgePointClusterId: null })
  })
})
