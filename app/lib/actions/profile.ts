'use server'

import { z } from 'zod'
import { createUserProfileService } from '@maolab/user-profile'

function getService() {
  const url = process.env['DATABASE_URL'] ?? 'file:./data/maolab.db'
  return createUserProfileService(url)
}

export async function getProfile() {
  return getService().getProfile()
}

const PreferencesSchema = z.object({
  preferredLanguage: z.string().optional(),
  preferredStyle: z.enum(['lecture', 'socratic', 'project']).optional(),
  preferredDifficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
  preferredAgentCount: z.number().int().min(1).max(5).optional(),
})

export async function updatePreferences(raw: unknown) {
  const parsed = PreferencesSchema.parse(raw)
  // Strip undefined values to satisfy exactOptionalPropertyTypes
  const patch = Object.fromEntries(
    Object.entries(parsed).filter(([, v]) => v !== undefined),
  ) as Parameters<ReturnType<typeof createUserProfileService>['updatePreferences']>[0]
  return getService().updatePreferences(patch)
}

export async function getAdaptiveState() {
  return getService().getAdaptiveState()
}

const AdaptiveStateSchema = z.object({
  weak_concepts: z.array(z.string()),
  recommended_next: z.array(z.string()),
  last_updated: z.number(),
})

export async function mergeAdaptiveState(raw: unknown) {
  const incoming = AdaptiveStateSchema.parse(raw)
  return getService().mergeAdaptiveState(incoming)
}

const ConceptMasterySchema = z.object({
  conceptId: z.string().min(1),
  score: z.number().min(0).max(1),
  lastReviewedAt: z.number(),
})

export async function upsertConceptMastery(raw: unknown) {
  const entry = ConceptMasterySchema.parse(raw)
  return getService().upsertConceptMastery(entry)
}

export async function listConceptMastery() {
  return getService().listConceptMastery()
}

const CourseHistorySchema = z.object({
  stageId: z.string().min(1),
  completedAt: z.number(),
  score: z.number().min(0).max(1),
})

export async function appendCourseHistory(raw: unknown) {
  const entry = CourseHistorySchema.parse(raw)
  return getService().appendCourseHistory(entry)
}
