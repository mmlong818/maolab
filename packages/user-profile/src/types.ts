import type { LearnerProfile, AdaptiveState, ConceptMastery } from '@maolab/shared-types'

export interface UserProfileService {
  getProfile(): Promise<LearnerProfile>
  updatePreferences(patch: Partial<Pick<
    LearnerProfile,
    'preferredLanguage' | 'preferredStyle' | 'preferredDifficulty' | 'preferredAgentCount'
  >>): Promise<LearnerProfile>
  mergeAdaptiveState(incoming: AdaptiveState): Promise<void>
  upsertConceptMastery(entry: ConceptMastery): Promise<void>
  appendCourseHistory(entry: { stageId: string; completedAt: number; score: number }): Promise<void>
  getAdaptiveState(): Promise<AdaptiveState | null>
  listConceptMastery(): Promise<ConceptMastery[]>
}
