import { eq, lt } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import type { ConceptMasteryRepository } from './types.js'
import type { ConceptMastery } from '@maolab/shared-types'
import { conceptMastery } from '../schema.js'

export function createConceptMasteryRepository(db: DbClient): ConceptMasteryRepository {
  return {
    async get(conceptId: string): Promise<ConceptMastery | undefined> {
      const row = db.select().from(conceptMastery).where(eq(conceptMastery.conceptId, conceptId)).get()
      if (!row) return undefined
      return { conceptId: row.conceptId, score: row.score, lastReviewedAt: row.lastReviewedAt }
    },

    async upsert(entry: ConceptMastery): Promise<void> {
      db.insert(conceptMastery)
        .values({ conceptId: entry.conceptId, score: entry.score, lastReviewedAt: entry.lastReviewedAt })
        .onConflictDoUpdate({
          target: conceptMastery.conceptId,
          set: { score: entry.score, lastReviewedAt: entry.lastReviewedAt },
        })
        .run()
    },

    async listWeak(threshold = 0.6): Promise<ConceptMastery[]> {
      const rows = db.select().from(conceptMastery).where(lt(conceptMastery.score, threshold)).all()
      return rows.map(r => ({ conceptId: r.conceptId, score: r.score, lastReviewedAt: r.lastReviewedAt }))
    },

    async listAll(): Promise<ConceptMastery[]> {
      const rows = db.select().from(conceptMastery).all()
      return rows.map(r => ({ conceptId: r.conceptId, score: r.score, lastReviewedAt: r.lastReviewedAt }))
    },
  }
}
