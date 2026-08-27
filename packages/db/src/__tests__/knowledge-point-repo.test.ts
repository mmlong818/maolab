/**
 * knowledge-point-repo.ts CRUD 单测（in-memory sqlite）
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensureKnowledgePointTables } from '../knowledge-point-store.js'
import {
  findKpByCanonicalHash,
  insertCluster,
  insertKnowledgePoint,
  insertSourceRefs,
  linkChapterNodeKp,
} from '../knowledge-point-repo.js'
import type {
  KnowledgePoint,
  KnowledgePointCluster,
  SourceRef,
} from '@maolab/shared-types'
import { newClusterId, newKpId } from '@maolab/shared-types'

type DB = Database.Database

function makeCluster(
  id: string,
  name: string,
  subject = 'physics',
): KnowledgePointCluster {
  const now = Date.now()
  return {
    id,
    canonicalNameEn: name,
    subject,
    memberKpIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

function makeKp(
  id: string,
  clusterId: string,
  canonicalHash: string,
  canonicalName = '勾股定理',
): KnowledgePoint {
  const now = Date.now()
  return {
    id,
    clusterId,
    canonicalName,
    aliases: ['毕达哥拉斯定理'],
    subject: 'physics',
    gradeBand: 'high-1',
    curriculumSystem: 'pep-2019',
    canonicalHash,
    provenance: { sourceRefs: [] },
    createdAt: now,
    updatedAt: now,
  }
}

function makeRef(leafId: string): SourceRef {
  return {
    kind: 'pep-cn',
    systemId: 'pep-2019',
    leafNodeId: leafId,
    confidence: 0.9,
    capturedAt: Date.now(),
  }
}

describe('knowledge-point-repo CRUD', () => {
  let db: DB

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    ensureKnowledgePointTables(db)
  })

  afterEach(() => {
    db.close()
  })

  it('insertCluster + 读回', () => {
    const id = newClusterId()
    insertCluster(db, makeCluster(id, 'pythagorean theorem'))
    const row = db
      .prepare(
        `SELECT id, canonical_name_en, subject FROM knowledge_point_clusters WHERE id = ?`,
      )
      .get(id) as { id: string; canonical_name_en: string; subject: string }
    expect(row.id).toBe(id)
    expect(row.canonical_name_en).toBe('pythagorean theorem')
    expect(row.subject).toBe('physics')
  })

  it('insertKnowledgePoint + 读回', () => {
    const cid = newClusterId()
    const kid = newKpId()
    insertCluster(db, makeCluster(cid, 'newton second law'))
    insertKnowledgePoint(db, makeKp(kid, cid, 'hash-a', '牛顿第二定律'))
    const row = db
      .prepare(`SELECT id, cluster_id, canonical_name FROM knowledge_points WHERE id = ?`)
      .get(kid) as { id: string; cluster_id: string; canonical_name: string }
    expect(row.canonical_name).toBe('牛顿第二定律')
    expect(row.cluster_id).toBe(cid)
  })

  it('insertSourceRefs 多条', () => {
    const cid = newClusterId()
    const kid = newKpId()
    insertCluster(db, makeCluster(cid, 'free fall'))
    insertKnowledgePoint(db, makeKp(kid, cid, 'hash-b'))
    insertSourceRefs(db, kid, [makeRef('leaf-a'), makeRef('leaf-b')])
    const rows = db
      .prepare(`SELECT external_id FROM knowledge_point_sources WHERE knowledge_point_id = ?`)
      .all(kid) as { external_id: string }[]
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.external_id).sort()).toEqual(['leaf-a', 'leaf-b'])
  })

  it('linkChapterNodeKp 多个叶子指向同 KP', () => {
    const cid = newClusterId()
    const kid = newKpId()
    insertCluster(db, makeCluster(cid, 'friction'))
    insertKnowledgePoint(db, makeKp(kid, cid, 'hash-c'))
    linkChapterNodeKp(db, 'leaf-x', kid, 0)
    linkChapterNodeKp(db, 'leaf-y', kid, 0)
    const rows = db
      .prepare(`SELECT chapter_node_id FROM chapter_node_knowledge_points WHERE knowledge_point_id = ?`)
      .all(kid) as { chapter_node_id: string }[]
    expect(rows).toHaveLength(2)
  })

  it('findKpByCanonicalHash 重复 → 第二次返回已存在', () => {
    const cid = newClusterId()
    const kid = newKpId()
    insertCluster(db, makeCluster(cid, 'momentum'))
    insertKnowledgePoint(db, makeKp(kid, cid, 'hash-dup'))
    const first = findKpByCanonicalHash(db, 'hash-dup')
    expect(first).not.toBeNull()
    expect(first!.id).toBe(kid)
    const miss = findKpByCanonicalHash(db, 'hash-nope')
    expect(miss).toBeNull()
  })

  it('findKpByCanonicalHash 在重复插入时检测到已存在', () => {
    const cid = newClusterId()
    const kid = newKpId()
    insertCluster(db, makeCluster(cid, 'energy'))
    insertKnowledgePoint(db, makeKp(kid, cid, 'hash-shared'))
    const existing = findKpByCanonicalHash(db, 'hash-shared')
    expect(existing).not.toBeNull()
    // 模拟"第二次入库"路径：检测到 → 仅追加 source
    insertSourceRefs(db, existing!.id, [makeRef('leaf-new')])
    const sources = db
      .prepare(`SELECT external_id FROM knowledge_point_sources WHERE knowledge_point_id = ?`)
      .all(existing!.id) as { external_id: string }[]
    expect(sources).toHaveLength(1)
    expect(sources[0]!.external_id).toBe('leaf-new')
  })

  it('insertCluster 拒绝非法 id (assertClusterId 守门)', () => {
    expect(() => insertCluster(db, makeCluster('garbage', 'whatever'))).toThrow(/not a valid cluster id/)
    expect(() => insertCluster(db, makeCluster('clst_', 'whatever'))).toThrow()
  })
})
