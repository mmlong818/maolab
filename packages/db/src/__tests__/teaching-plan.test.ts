import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../client.js'
import { createTeachingPlanRepository } from '../repositories/teaching-plan.sqlite.js'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { TeachingPlan } from '@maolab/shared-types'

function createTestDb() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: './src/migrations' })
  return db
}

const SAMPLE_PLAN: TeachingPlan = {
  id: 'plan-1',
  topic: '光合作用',
  teachingMethod: 'standard',
  style: 'lecture',
  language: 'zh-CN',
  difficulty: 'intermediate',
  agents: [{ id: 'a1', name: '猫叔', role: 'teacher', persona: '温和耐心的教师' }],
  outline: [{ id: 'o1', title: '引入', sceneType: 'slide', objective: '建立动机', durationHint: 120 }],
  emphasizedConcepts: ['暗反应'],
  sourceDocuments: [],
  createdAt: 1000,
}

describe('TeachingPlanRepository', () => {
  let repo: ReturnType<typeof createTeachingPlanRepository>

  beforeEach(() => {
    repo = createTeachingPlanRepository(createTestDb())
  })

  it('saves and retrieves a plan by id', async () => {
    await repo.save(SAMPLE_PLAN)
    const plan = await repo.find('plan-1')
    expect(plan?.topic).toBe('光合作用')
    expect(plan?.outline).toHaveLength(1)
    expect(plan?.emphasizedConcepts).toContain('暗反应')
  })

  it('returns undefined for unknown id', async () => {
    expect(await repo.find('does-not-exist')).toBeUndefined()
  })

  it('lists plans', async () => {
    await repo.save({ ...SAMPLE_PLAN, id: 'plan-1', createdAt: 1000 })
    await repo.save({ ...SAMPLE_PLAN, id: 'plan-2', createdAt: 2000 })
    const listed = await repo.list()
    expect(listed).toHaveLength(2)
    expect(listed[0]?.id).toBe('plan-2')
  })
})
