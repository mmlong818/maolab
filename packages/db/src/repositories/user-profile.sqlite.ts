import { eq } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import type { DbClient } from '../client.js'
import type { UserProfileRepository } from './types.js'
import type { LearnerProfile, CourseHistory, AdaptiveState } from '@maolab/shared-types'
import { learnerProfiles, courseHistory, adaptiveStates } from '../schema.js'
import { parseJsonColumn } from './parse-column.js'

export const DEFAULT_PROFILE: LearnerProfile = {
  id: 'me',
  learnerType: 'individual',
  preferredLanguage: 'zh-CN',
  preferredStyle: 'lecture',
  preferredDifficulty: 'intermediate',
  preferredAgentCount: 2,
  createdAt: Date.now(),
  updatedAt: Date.now(),
}

const DEFAULT_ADAPTIVE_STATE: AdaptiveState = {
  weak_concepts: [],
  recommended_next: [],
  last_updated: 0,
}

export function createUserProfileRepository(db: DbClient): UserProfileRepository {
  return {
    async find(_id: 'me'): Promise<LearnerProfile | undefined> {
      const row = db.select().from(learnerProfiles).where(eq(learnerProfiles.id, 'me')).get()
      if (!row) return undefined
      return row as LearnerProfile
    },

    async save(profile: LearnerProfile): Promise<void> {
      db.insert(learnerProfiles)
        .values({ ...profile })
        .onConflictDoUpdate({
          target: learnerProfiles.id,
          set: {
            learnerType: profile.learnerType,
            nickname: profile.nickname ?? null,
            age: profile.age ?? null,
            gender: profile.gender ?? null,
            gradeLevel: profile.gradeLevel ?? null,
            preferredLanguage: profile.preferredLanguage,
            preferredStyle: profile.preferredStyle,
            preferredDifficulty: profile.preferredDifficulty,
            preferredAgentCount: profile.preferredAgentCount,
            updatedAt: profile.updatedAt,
          },
        })
        .run()
    },

    async appendCourseHistory(_userId: 'me', entry): Promise<string> {
      const id = randomUUID()
      db.insert(courseHistory).values({ id, ...entry }).run()
      return id
    },

    async updateCourseHistory(courseId: string, patch: Partial<CourseHistory>): Promise<void> {
      db.update(courseHistory).set(patch).where(eq(courseHistory.id, courseId)).run()
    },

    async getCourseHistory(_userId: 'me'): Promise<CourseHistory[]> {
      return db.select().from(courseHistory).all() as CourseHistory[]
    },

    async getAdaptiveState(_userId: 'me'): Promise<AdaptiveState> {
      const row = db.select().from(adaptiveStates).where(eq(adaptiveStates.id, 'me')).get()
      if (!row) return { ...DEFAULT_ADAPTIVE_STATE }
      return {
        weak_concepts: parseJsonColumn<string[]>(row.weakConcepts, { table: 'adaptive_states', id: 'me', column: 'weakConcepts' }),
        recommended_next: parseJsonColumn<string[]>(row.recommendedNext, { table: 'adaptive_states', id: 'me', column: 'recommendedNext' }),
        last_updated: row.lastUpdated,
      }
    },

    async saveAdaptiveState(_userId: 'me', state: AdaptiveState): Promise<void> {
      db.insert(adaptiveStates)
        .values({
          id: 'me',
          weakConcepts: JSON.stringify(state.weak_concepts),
          recommendedNext: JSON.stringify(state.recommended_next),
          lastUpdated: state.last_updated,
        })
        .onConflictDoUpdate({
          target: adaptiveStates.id,
          set: {
            weakConcepts: JSON.stringify(state.weak_concepts),
            recommendedNext: JSON.stringify(state.recommended_next),
            lastUpdated: state.last_updated,
          },
        })
        .run()
    },
  }
}
