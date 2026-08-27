import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openSqliteRaw } from '@maolab/db'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearSeed, seedMastery, seedScoreFor, seededKpIds, SEED_PROFILE_ID } from '../seed-mastery.js'

/**
 * 种子学情的数据安全回归。
 *
 * 首版把种子和真实作答混在同表同 profile,`--clear` 直接 DELETE、写入直接 upsert,
 * 文档却说「清掉种子」——真实作答一旦出现,照文档执行就会**不可逆地删掉或改写真数据**
 * (2026-07-28 Codex 复审判为 P0)。第二版加了台账后仍留两个洞,同日二轮复审指出:
 * 只比分数认不出「同分但被真实作答更新过」的行;再次 force 保留旧基线会抹掉中途的真作答。
 *
 * 这组测试守的都是同一条:**宁可留下一条种子,不动一条真数据。**
 */

let dir: string
let dbPath: string
let ledgerPath: string
let db: ReturnType<typeof openSqliteRaw>

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'seed-mastery-'))
  dbPath = join(dir, 'test.db')
  ledgerPath = join(dir, 'ledger.json')
  db = openSqliteRaw(dbPath)
  db.exec(`CREATE TABLE concept_mastery (
    id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, concept_id TEXT NOT NULL,
    score REAL NOT NULL, last_reviewed_at INTEGER NOT NULL,
    UNIQUE(profile_id, concept_id))`)
})

afterEach(() => {
  db.close()
  rmSync(dir, { recursive: true, force: true })
})

/** 模拟真实作答写入/更新:分数与时间都由真实管线决定,时间显式给,便于断言。 */
function putReal(kpId: string, score: number, reviewedAt = 1000) {
  db.prepare(`INSERT INTO concept_mastery (id, profile_id, concept_id, score, last_reviewed_at)
    VALUES (?,?,?,?,?)
    ON CONFLICT(profile_id, concept_id) DO UPDATE SET score = excluded.score, last_reviewed_at = excluded.last_reviewed_at`)
    .run('real-' + kpId, SEED_PROFILE_ID, kpId, score, reviewedAt)
}
function rowOf(kpId: string): { score: number; reviewedAt: number } | undefined {
  return db.prepare('SELECT score, last_reviewed_at AS reviewedAt FROM concept_mastery WHERE profile_id=? AND concept_id=?')
    .get(SEED_PROFILE_ID, kpId) as { score: number; reviewedAt: number } | undefined
}
const scoreOf = (kpId: string) => rowOf(kpId)?.score
const COUNTS = new Map([['kp-a', 2], ['kp-b', 0]])

describe('写入 · 默认不覆盖真实作答', () => {
  it('目标 KP 已有记录 → 整批拒绝,一行都不写', () => {
    putReal('kp-a', 0.9)
    const out = seedMastery(db, ledgerPath, 'c1', COUNTS)
    expect(out.written).toEqual([])
    expect(out.refused.map(r => r.kpId)).toContain('kp-a')
    expect(scoreOf('kp-a')).toBe(0.9)
    expect(scoreOf('kp-b')).toBeUndefined() // 连没冲突的那个也不写:整批中止
  })

  it('空表时正常写入,分数按教材误区数推导', () => {
    const out = seedMastery(db, ledgerPath, 'c1', COUNTS)
    expect(out.refused).toEqual([])
    expect(scoreOf('kp-a')).toBeCloseTo(seedScoreFor(2), 6)
    expect(scoreOf('kp-b')).toBeCloseTo(seedScoreFor(0), 6)
  })

  it('重播自己写的、没被动过的种子不算覆盖,无需 force', () => {
    seedMastery(db, ledgerPath, 'c1', COUNTS)
    const out = seedMastery(db, ledgerPath, 'c1', COUNTS)
    expect(out.refused).toEqual([])
    expect(out.written).toHaveLength(2)
  })

  it('显式 force 才覆盖,且台账记下原值以便回滚', () => {
    putReal('kp-a', 0.9)
    seedMastery(db, ledgerPath, 'c1', COUNTS, { force: true })
    expect(scoreOf('kp-a')).toBeCloseTo(seedScoreFor(2), 6)
    clearSeed(db, ledgerPath, 'c1')
    expect(scoreOf('kp-a')).toBe(0.9) // 原值被精确恢复
  })
})

describe('撤销 · 只撤自己写的', () => {
  it('未被改动过的种子 → 此前无记录的删掉', () => {
    seedMastery(db, ledgerPath, 'c1', COUNTS)
    const out = clearSeed(db, ledgerPath, 'c1')
    expect(out.removed.sort()).toEqual(['kp-a', 'kp-b'])
    expect(scoreOf('kp-a')).toBeUndefined()
  })

  it('**真实作答改动过的行一律不碰**(核心红线)', () => {
    seedMastery(db, ledgerPath, 'c1', COUNTS)
    // 学生真的答了题,掌握度被真实管线更新
    putReal('kp-a', 0.82, 555_000)

    const out = clearSeed(db, ledgerPath, 'c1')
    expect(out.skipped.map(s => s.kpId)).toEqual(['kp-a'])
    expect(scoreOf('kp-a')).toBe(0.82) // 真数据原封不动
    expect(scoreOf('kp-b')).toBeUndefined() // 没被动过的种子照常撤掉
  })

  it('**同分但时间已更新 → 仍判为真实作答,不碰**(分数会碰撞,时间戳才是指纹)', () => {
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 2]]))
    // 真实作答恰好算出与种子相同的分数,只有 last_reviewed_at 变了
    putReal('kp-a', seedScoreFor(2), 777_000)

    const out = clearSeed(db, ledgerPath, 'c1')
    expect(out.skipped.map(s => s.kpId)).toEqual(['kp-a'])
    expect(rowOf('kp-a')).toEqual({ score: seedScoreFor(2), reviewedAt: 777_000 })
  })

  it('恢复原值要连 last_reviewed_at 一起还原', () => {
    putReal('kp-a', 0.9, 424_242)
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 2]]), { force: true })
    clearSeed(db, ledgerPath, 'c1')
    expect(rowOf('kp-a')).toEqual({ score: 0.9, reviewedAt: 424_242 })
  })

  it('不越界撤别的课程的种子', () => {
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 1]]))
    seedMastery(db, ledgerPath, 'c2', new Map([['kp-b', 1]]))
    clearSeed(db, ledgerPath, 'c1')
    expect(scoreOf('kp-a')).toBeUndefined()
    expect(scoreOf('kp-b')).toBeCloseTo(seedScoreFor(1), 6)
  })

  it('重复撤销幂等,不报错也不误删', () => {
    seedMastery(db, ledgerPath, 'c1', COUNTS)
    clearSeed(db, ledgerPath, 'c1')
    const second = clearSeed(db, ledgerPath, 'c1')
    expect(second).toEqual({ restored: [], removed: [], skipped: [] })
  })
})

describe('来源披露 · 页面据此标注「演示种子」', () => {
  it('列出仍属种子的 KP', () => {
    seedMastery(db, ledgerPath, 'c1', COUNTS)
    expect([...seededKpIds(db, ledgerPath, 'c1')].sort()).toEqual(['kp-a', 'kp-b'])
  })

  it('被真实作答改动过的不再算种子', () => {
    seedMastery(db, ledgerPath, 'c1', COUNTS)
    putReal('kp-a', 0.82, 555_000)
    expect([...seededKpIds(db, ledgerPath, 'c1')]).toEqual(['kp-b'])
  })

  it('同分但时间已更新的也不再算种子(否则页面会把真作答标成演示数据)', () => {
    seedMastery(db, ledgerPath, 'c1', COUNTS)
    putReal('kp-a', seedScoreFor(2), 777_000)
    expect([...seededKpIds(db, ledgerPath, 'c1')]).toEqual(['kp-b'])
  })

  it('没播过种的课返回空集', () => {
    expect(seededKpIds(db, ledgerPath, 'never-seeded').size).toBe(0)
  })
})

describe('重复播种 · 基线取舍', () => {
  it('种子没被动过时二次播种,撤销仍退回最初的真实值(不退到上一次的种子值)', () => {
    putReal('kp-a', 0.9)
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 1]]), { force: true })
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 3]]), { force: true })
    clearSeed(db, ledgerPath, 'c1')
    expect(scoreOf('kp-a')).toBe(0.9)
  })

  it('**中途出现的真实作答成为新基线,不被旧基线抹掉**(真实 0.90 → 种子 → 真实 0.82 → 再种子 → 撤销)', () => {
    putReal('kp-a', 0.9, 1000)
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 1]]), { force: true })
    putReal('kp-a', 0.82, 888_000) // 学生真的答了题
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 3]]), { force: true })
    clearSeed(db, ledgerPath, 'c1')
    // 回滚到 0.82 而不是 0.90——用回滚的名义销毁中途的真数据同样是破坏
    expect(rowOf('kp-a')).toEqual({ score: 0.82, reviewedAt: 888_000 })
  })

  it('中途被真实作答改动后再次播种,不加 force 会被拒绝', () => {
    seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 1]]))
    putReal('kp-a', 0.82, 888_000)
    const out = seedMastery(db, ledgerPath, 'c1', new Map([['kp-a', 3]]))
    expect(out.written).toEqual([])
    expect(out.refused.map(r => r.kpId)).toEqual(['kp-a'])
    expect(scoreOf('kp-a')).toBe(0.82)
  })
})
