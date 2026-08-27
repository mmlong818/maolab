import type { LearnerProfile, AdaptiveState, ConceptMastery, CourseHistory } from '@maolab/shared-types'
import type { UserProfileRepository, ConceptMasteryRepository } from '@maolab/db'
import type { UserProfileService } from './types.js'
import { buildDefaultProfile, mergeAdaptiveState } from './defaults.js'

export class SqliteUserProfileService implements UserProfileService {
  constructor(
    private readonly profileRepo: UserProfileRepository,
    private readonly masteryRepo: ConceptMasteryRepository,
  ) {}

  async getProfile(): Promise<LearnerProfile> {
    const existing = await this.profileRepo.find('me')
    if (existing) return existing
    const defaults = buildDefaultProfile()
    await this.profileRepo.save(defaults)
    return defaults
  }

  async updatePreferences(
    patch: Partial<Pick<LearnerProfile, 'learnerType' | 'nickname' | 'age' | 'gender' | 'gradeLevel' | 'preferredLanguage' | 'preferredStyle' | 'preferredDifficulty' | 'preferredAgentCount'>>,
  ): Promise<LearnerProfile> {
    const current = await this.getProfile()
    const updated: LearnerProfile = { ...current, ...patch, updatedAt: Date.now() }
    await this.profileRepo.save(updated)
    return updated
  }

  async mergeAdaptiveState(incoming: AdaptiveState): Promise<void> {
    const current = await this.profileRepo.getAdaptiveState('me')
    const existing = current.last_updated === 0 ? null : current
    const merged = mergeAdaptiveState(existing, incoming)
    await this.profileRepo.saveAdaptiveState('me', merged)
  }

  async upsertConceptMastery(entry: ConceptMastery): Promise<void> {
    await this.masteryRepo.upsert(entry)
  }

  async appendCourseHistory(entry: { stageId: string; completedAt: number; score: number }): Promise<void> {
    const historyEntry: Omit<CourseHistory, 'id'> = {
      topic: entry.stageId,
      stageId: entry.stageId,
      completionRate: entry.score,
      lastAccessedAt: entry.completedAt,
      totalDuration: 0,
      status: 'completed',
    }
    await this.profileRepo.appendCourseHistory('me', historyEntry)
  }

  async getAdaptiveState(): Promise<AdaptiveState | null> {
    const state = await this.profileRepo.getAdaptiveState('me')
    return state.last_updated === 0 ? null : state
  }

  async listConceptMastery(): Promise<ConceptMastery[]> {
    const all = await this.masteryRepo.listAll()
    return all.slice().sort((a, b) => a.score - b.score)
  }
}
