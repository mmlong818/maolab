/**
 * atom-by-kp-repo.ts CRUD + 查询单测 (in-memory sqlite)
 */
import Database from 'better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ensureKnowledgePointTables } from '../knowledge-point-store.js'
import {
  insertCluster,
  insertKnowledgePoint,
} from '../knowledge-point-repo.js'
import {
  insertAtomByKp,
  insertAtomByKpBatch,
  findAtomsByKp,
  deleteAtomsByKpForCourse,
  type AtomByKpRecord,
} from '../atom-by-kp-repo.js'
import {
  newClusterId,
  newKpId,
  type KnowledgePoint,
  type KnowledgePointCluster,
} from '@maolab/shared-types'

type DB = Database.Database

function makeCluster(id: string): KnowledgePointCluster {
  const now = Date.now()
  return {
    id,
    canonicalNameEn: 'test cluster',
    subject: 'math',
    memberKpIds: [],
    createdAt: now,
    updatedAt: now,
  }
}

function makeKp(id: string, clusterId: string, hash: string): KnowledgePoint {
  const now = Date.now()
  return {
    id,
    clusterId,
    canonicalName: '测试 KP',
    aliases: [],
    subject: 'math',
    curriculumSystem: 'pep-2019',
    canonicalHash: hash,
    provenance: { sourceRefs: [] },
    createdAt: now,
    updatedAt: now,
    verified: false,
  }
}

function makeRecord(opts: Partial<AtomByKpRecord> & { kpId: string }): AtomByKpRecord {
  return {
    id: opts.id ?? '',
    kpId: opts.kpId,
    atomId: opts.atomId ?? 'atom-seg-1-node-1',
    courseId: opts.courseId ?? 'course-A',
    atomType: opts.atomType ?? 'single-question',
    ageBand: opts.ageBand ?? 'middle',
    subject: opts.subject ?? 'math',
    generatedAt: opts.generatedAt ?? Date.now(),
    payloadSnapshot: opts.payloadSnapshot ?? JSON.stringify({ foo: 'bar' }),
  }
}

describe('atom-by-kp-repo', () => {
  let db: DB
  let kpId: string

  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    ensureKnowledgePointTables(db)
    const cid = newClusterId()
    kpId = newKpId()
    insertCluster(db, makeCluster(cid))
    insertKnowledgePoint(db, makeKp(kpId, cid, 'hash-1'))
  })

  afterEach(() => {
    db.close()
  })

  it('insertAtomByKp + findAtomsByKp 基本读回', () => {
    insertAtomByKp(db, makeRecord({ kpId, atomId: 'atom-1' }))
    const got = findAtomsByKp(db, { kpId })
    expect(got).toHaveLength(1)
    expect(got[0]?.atomId).toBe('atom-1')
    expect(got[0]?.kpId).toBe(kpId)
  })

  it('insertAtomByKpBatch 批量写入', () => {
    insertAtomByKpBatch(db, [
      makeRecord({ kpId, atomId: 'a1' }),
      makeRecord({ kpId, atomId: 'a2' }),
      makeRecord({ kpId, atomId: 'a3' }),
    ])
    const got = findAtomsByKp(db, { kpId, limit: 10 })
    expect(got).toHaveLength(3)
  })

  it('findAtomsByKp 按 ageBand + subject 过滤', () => {
    insertAtomByKp(db, makeRecord({ kpId, atomId: 'a-mid', ageBand: 'middle', subject: 'math' }))
    insertAtomByKp(db, makeRecord({ kpId, atomId: 'a-high', ageBand: 'high', subject: 'math' }))
    insertAtomByKp(db, makeRecord({ kpId, atomId: 'a-bio', ageBand: 'middle', subject: 'biology' }))

    const mid = findAtomsByKp(db, { kpId, ageBand: 'middle' })
    expect(mid.map(r => r.atomId).sort()).toEqual(['a-bio', 'a-mid'])

    const mathMid = findAtomsByKp(db, { kpId, ageBand: 'middle', subject: 'math' })
    expect(mathMid).toHaveLength(1)
    expect(mathMid[0]?.atomId).toBe('a-mid')
  })

  it('findAtomsByKp 按 maxAgeMs 排除过期记录, 默认按 generated_at desc', () => {
    const now = Date.now()
    insertAtomByKp(db, makeRecord({ kpId, atomId: 'old', generatedAt: now - 200 * 24 * 3600 * 1000 }))
    insertAtomByKp(db, makeRecord({ kpId, atomId: 'recent', generatedAt: now - 1000 }))
    insertAtomByKp(db, makeRecord({ kpId, atomId: 'newest', generatedAt: now }))

    const within90 = findAtomsByKp(db, { kpId })
    expect(within90.map(r => r.atomId)).toEqual(['newest', 'recent'])

    const all = findAtomsByKp(db, { kpId, maxAgeMs: 365 * 24 * 3600 * 1000 })
    expect(all.map(r => r.atomId)).toEqual(['newest', 'recent', 'old'])
  })

  it('findAtomsByKp limit 生效', () => {
    for (let i = 0; i < 8; i++) {
      insertAtomByKp(db, makeRecord({ kpId, atomId: `a${i}`, generatedAt: Date.now() + i }))
    }
    expect(findAtomsByKp(db, { kpId })).toHaveLength(5)
    expect(findAtomsByKp(db, { kpId, limit: 3 })).toHaveLength(3)
  })

  it('deleteAtomsByKpForCourse 按 courseId 清理', () => {
    insertAtomByKpBatch(db, [
      makeRecord({ kpId, atomId: 'a1', courseId: 'c1' }),
      makeRecord({ kpId, atomId: 'a2', courseId: 'c1' }),
      makeRecord({ kpId, atomId: 'a3', courseId: 'c2' }),
    ])
    deleteAtomsByKpForCourse(db, 'c1')
    const remain = findAtomsByKp(db, { kpId, limit: 10 })
    expect(remain).toHaveLength(1)
    expect(remain[0]?.courseId).toBe('c2')
  })
})
