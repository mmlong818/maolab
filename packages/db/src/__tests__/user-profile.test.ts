import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../client.js'
import { createUserProfileRepository, DEFAULT_PROFILE } from '../repositories/user-profile.sqlite.js'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { LearnerProfile, AdaptiveState } from '@maolab/shared-types'

function createTestDb() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: './src/migrations' })
  return db
}

describe('UserProfileRepository', () => {
  let repo: ReturnType<typeof createUserProfileRepository>

  beforeEach(() => {
    repo = createUserProfileRepository(createTestDb())
  })

  it('returns undefined for new user', async () => {
    const profile = await repo.find('me')
    expect(profile).toBeUndefined()
  })

  it('saves and retrieves profile', async () => {
    const profile: LearnerProfile = {
      ...DEFAULT_PROFILE,
      preferredLanguage: 'en-US',
      preferredDifficulty: 'advanced',
      preferredAgentCount: 3,
    }
    await repo.save(profile)
    const retrieved = await repo.find('me')
    expect(retrieved?.preferredLanguage).toBe('en-US')
    expect(retrieved?.preferredDifficulty).toBe('advanced')
    expect(retrieved?.preferredAgentCount).toBe(3)
  })

  it('updates existing profile via save', async () => {
    await repo.save({ ...DEFAULT_PROFILE })
    await repo.save({ ...DEFAULT_PROFILE, preferredStyle: 'socratic', updatedAt: Date.now() })
    const profile = await repo.find('me')
    expect(profile?.preferredStyle).toBe('socratic')
  })

  it('records and retrieves course history', async () => {
    const id = await repo.appendCourseHistory('me', {
      topic: '光合作用',
      stageId: 'stage-1',
      completionRate: 0,
      lastAccessedAt: Date.now(),
      totalDuration: 0,
      status: 'in_progress',
    })
    await repo.updateCourseHistory(id, { completionRate: 0.5 })
    const history = await repo.getCourseHistory('me')
    expect(history).toHaveLength(1)
    expect(history[0]?.completionRate).toBe(0.5)
  })

  it('returns empty adaptive state for new user', async () => {
    const state = await repo.getAdaptiveState('me')
    expect(state.weak_concepts).toEqual([])
    expect(state.recommended_next).toEqual([])
  })

  it('saves and retrieves adaptive state', async () => {
    const state: AdaptiveState = {
      weak_concepts: ['递归', '动态规划'],
      recommended_next: ['图论'],
      last_updated: Date.now(),
    }
    await repo.saveAdaptiveState('me', state)
    const retrieved = await repo.getAdaptiveState('me')
    expect(retrieved.weak_concepts).toEqual(['递归', '动态规划'])
    expect(retrieved.recommended_next).toEqual(['图论'])
  })
})
