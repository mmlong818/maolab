import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../client.js'
import { createConceptMasteryRepository } from '../repositories/concept-mastery.sqlite.js'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

function createTestDb() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: './src/migrations' })
  return db
}

describe('ConceptMasteryRepository', () => {
  let repo: ReturnType<typeof createConceptMasteryRepository>

  beforeEach(() => {
    repo = createConceptMasteryRepository(createTestDb())
  })

  it('returns undefined for unknown concept', async () => {
    expect(await repo.get('未知概念')).toBeUndefined()
  })

  it('upserts and retrieves a concept', async () => {
    await repo.upsert({ conceptId: '光反应', score: 0.8, lastReviewedAt: Date.now() })
    const entry = await repo.get('光反应')
    expect(entry?.score).toBe(0.8)
  })

  it('updates score on second upsert', async () => {
    await repo.upsert({ conceptId: '光反应', score: 0.5, lastReviewedAt: 1000 })
    await repo.upsert({ conceptId: '光反应', score: 0.9, lastReviewedAt: 2000 })
    const entry = await repo.get('光反应')
    expect(entry?.score).toBe(0.9)
    expect(entry?.lastReviewedAt).toBe(2000)
  })

  it('listWeak returns only concepts below threshold', async () => {
    await repo.upsert({ conceptId: '光反应', score: 0.9, lastReviewedAt: Date.now() })
    await repo.upsert({ conceptId: '暗反应', score: 0.4, lastReviewedAt: Date.now() })
    const weak = await repo.listWeak(0.6)
    expect(weak.map(w => w.conceptId)).toContain('暗反应')
    expect(weak.map(w => w.conceptId)).not.toContain('光反应')
  })

  it('listAll returns all entries', async () => {
    await repo.upsert({ conceptId: '光反应', score: 0.9, lastReviewedAt: Date.now() })
    await repo.upsert({ conceptId: '暗反应', score: 0.4, lastReviewedAt: Date.now() })
    expect((await repo.listAll())).toHaveLength(2)
  })
})
