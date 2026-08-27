import type { LearnerProfile, AdaptiveState } from '@maolab/shared-types'

export function buildDefaultProfile(): LearnerProfile {
  const now = Date.now()
  return {
    id: 'me',
    learnerType: 'individual' as const,
    preferredLanguage: 'zh-CN',
    preferredStyle: 'lecture' as const,
    preferredDifficulty: 'intermediate' as const,
    preferredAgentCount: 2,
    createdAt: now,
    updatedAt: now,
  }
}

export function mergeAdaptiveState(
  existing: AdaptiveState | null,
  incoming: AdaptiveState,
): AdaptiveState {
  if (existing === null) return incoming

  const merged = Array.from(
    new Set([...existing.weak_concepts, ...incoming.weak_concepts]),
  ).slice(0, 20)

  return {
    weak_concepts: merged,
    recommended_next: incoming.recommended_next,
    last_updated: incoming.last_updated,
  }
}
