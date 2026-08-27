import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, createUserProfileRepository, createConceptMasteryRepository } from '@maolab/db'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { SqliteUserProfileService } from '../service.js'

function makeService() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: 'E:/CC/code/maolab/packages/db/src/migrations' })
  const profileRepo = createUserProfileRepository(db)
  const masteryRepo = createConceptMasteryRepository(db)
  return new SqliteUserProfileService(profileRepo, masteryRepo)
}

describe('SqliteUserProfileService', () => {
  let svc: SqliteUserProfileService

  beforeEach(() => {
    svc = makeService()
  })

  it('getProfile() returns cold-start default on first call', async () => {
    const p = await svc.getProfile()
    expect(p.preferredLanguage).toBe('zh-CN')
    expect(p.id).toBe('me')
    expect(p.preferredDifficulty).toBe('intermediate')
  })

  it('getProfile() persists default so second call returns same data', async () => {
    const first = await svc.getProfile()
    const second = await svc.getProfile()
    expect(second.createdAt).toBe(first.createdAt)
  })

  it('updatePreferences() patches only provided fields', async () => {
    await svc.getProfile()
    const updated = await svc.updatePreferences({ preferredStyle: 'socratic' })
    expect(updated.preferredStyle).toBe('socratic')
    expect(updated.preferredLanguage).toBe('zh-CN')
  })

  it('mergeAdaptiveState() accumulates weak_concepts across calls', async () => {
    await svc.getProfile()
    await svc.mergeAdaptiveState({ weak_concepts: ['A'], recommended_next: [], last_updated: 1 })
    await svc.mergeAdaptiveState({ weak_concepts: ['B'], recommended_next: ['X'], last_updated: 2 })
    const state = await svc.getAdaptiveState()
    expect(state?.weak_concepts).toContain('A')
    expect(state?.weak_concepts).toContain('B')
    expect(state?.recommended_next).toEqual(['X'])
  })

  it('upsertConceptMastery() overwrites existing entry for same conceptId', async () => {
    await svc.upsertConceptMastery({ conceptId: 'newton-1st', score: 0.5, lastReviewedAt: 1 })
    await svc.upsertConceptMastery({ conceptId: 'newton-1st', score: 0.9, lastReviewedAt: 2 })
    const list = await svc.listConceptMastery()
    const entry = list.find(e => e.conceptId === 'newton-1st')
    expect(entry?.score).toBe(0.9)
    expect(list.filter(e => e.conceptId === 'newton-1st').length).toBe(1)
  })

  it('listConceptMastery() returns entries sorted by score ascending', async () => {
    await svc.upsertConceptMastery({ conceptId: 'c1', score: 0.8, lastReviewedAt: 1 })
    await svc.upsertConceptMastery({ conceptId: 'c2', score: 0.3, lastReviewedAt: 2 })
    await svc.upsertConceptMastery({ conceptId: 'c3', score: 0.6, lastReviewedAt: 3 })
    const list = await svc.listConceptMastery()
    expect(list[0]!.score).toBeLessThanOrEqual(list[1]!.score)
    expect(list[1]!.score).toBeLessThanOrEqual(list[2]!.score)
  })

  it('getAdaptiveState() returns null before any merge', async () => {
    const state = await svc.getAdaptiveState()
    expect(state).toBeNull()
  })
})
