/**
 * Knowledge Ontology v1.1 — kp-cluster-mapper 单测（PR2a）
 *
 * mapper 源码在 app/app/lib/v2/kp-cluster-mapper.ts；为了在 db 包的 vitest 环境
 * 跑通，这里用相对路径直接 import。app 包尚未配 vitest，本测试承担该模块的覆盖。
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ensureKnowledgePointTables } from '../knowledge-point-store.js'
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — 跨包相对路径，vitest 解析；@maolab/db 在该文件不参与
import {
  resolveKpCluster,
  __resetKpClusterCacheForTest,
} from '../../../../app/app/lib/v2/kp-cluster-mapper.js'

type DB = Database.Database

function seedClusterAndKp(db: DB, opts: { kpId: string; clusterId: string; leafNodeId?: string }) {
  const now = Date.now()
  db.prepare(
    `INSERT INTO knowledge_point_clusters
     (id, canonical_name_en, subject, aliases, created_by, verified, created_at, updated_at)
     VALUES (?, ?, ?, '[]', 'auto-singleton', 0, ?, ?)`
  ).run(opts.clusterId, `name-${opts.clusterId}`, 'math', now, now)
  db.prepare(
    `INSERT INTO knowledge_points
     (id, cluster_id, curriculum_system, canonical_name, aliases, canonical_hash,
      subject, grade_band, title, summary, annotations, verified,
      annotator_version, labeled_at, updated_at)
     VALUES (?, ?, 'pep-2019', ?, '[]', ?, 'math', '', '', '', '{}', 0, 'v1', ?, ?)`
  ).run(opts.kpId, opts.clusterId, `name-${opts.kpId}`, `hash-${opts.kpId}`, now, now)
  if (opts.leafNodeId) {
    db.prepare(
      `INSERT INTO chapter_node_knowledge_points
       (chapter_node_id, knowledge_point_id, position, created_at)
       VALUES (?, ?, 0, ?)`
    ).run(opts.leafNodeId, opts.kpId, now)
  }
}

describe('kp-cluster-mapper (PR2a)', () => {
  let db: DB

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    ensureKnowledgePointTables(db)
    __resetKpClusterCacheForTest()
  })

  afterEach(() => {
    db.close()
    vi.restoreAllMocks()
  })

  it('cache miss → DB hit on objectiveId → cache populated & returned', () => {
    seedClusterAndKp(db, { kpId: 'kp-1', clusterId: 'c-1' })
    const r1 = resolveKpCluster(db, { objectiveId: 'kp-1' })
    expect(r1).toEqual({ knowledgePointId: 'kp-1', knowledgePointClusterId: 'c-1' })

    // 第二次：删表也应能从 cache 拿到 → 证明 cache 生效
    db.exec(`DELETE FROM knowledge_points`)
    const r2 = resolveKpCluster(db, { objectiveId: 'kp-1' })
    expect(r2).toEqual({ knowledgePointId: 'kp-1', knowledgePointClusterId: 'c-1' })
  })

  it('cache hit → no DB query', () => {
    seedClusterAndKp(db, { kpId: 'kp-2', clusterId: 'c-2' })
    resolveKpCluster(db, { objectiveId: 'kp-2' }) // populate cache
    const spy = vi.spyOn(db, 'prepare')
    const r = resolveKpCluster(db, { objectiveId: 'kp-2' })
    expect(r).toEqual({ knowledgePointId: 'kp-2', knowledgePointClusterId: 'c-2' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('nothing in DB → returns {null, null} + warn once', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r1 = resolveKpCluster(db, { objectiveId: 'nope', atomSourceLeafId: 'also-nope' })
    expect(r1).toEqual({ knowledgePointId: null, knowledgePointClusterId: null })
    // 第二次不同 key（cache miss），但 warn 只触发过一次
    const r2 = resolveKpCluster(db, { objectiveId: 'still-nope', atomSourceLeafId: 'x' })
    expect(r2).toEqual({ knowledgePointId: null, knowledgePointClusterId: null })
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it('objectiveId directly hits knowledge_points.id', () => {
    seedClusterAndKp(db, { kpId: 'kp-direct', clusterId: 'c-direct' })
    const r = resolveKpCluster(db, { objectiveId: 'kp-direct' })
    expect(r.knowledgePointId).toBe('kp-direct')
    expect(r.knowledgePointClusterId).toBe('c-direct')
  })

  it('objectiveId misses KP but atomSourceLeafId hits chapter_node_knowledge_points', () => {
    seedClusterAndKp(db, { kpId: 'kp-leaf', clusterId: 'c-leaf', leafNodeId: 'leaf-A' })
    const r = resolveKpCluster(db, { objectiveId: 'unknown-obj', atomSourceLeafId: 'leaf-A' })
    expect(r.knowledgePointId).toBe('kp-leaf')
    expect(r.knowledgePointClusterId).toBe('c-leaf')
  })
})
