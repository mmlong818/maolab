'use server'

import type { LearnerProfile } from '@maolab/shared-types'
import { createUserProfileService } from '@maolab/user-profile'

const DB_URL = process.env.DATABASE_URL ?? 'file:./data/maolab.db'

function getService() {
  return createUserProfileService(DB_URL)
}

export async function getProfile(): Promise<LearnerProfile> {
  return getService().getProfile()
}

export async function updatePreferences(
  patch: Partial<Pick<
    LearnerProfile,
    'learnerType' | 'nickname' | 'age' | 'gender' | 'gradeLevel' |
    'preferredLanguage' | 'preferredStyle' | 'preferredDifficulty' | 'preferredAgentCount'
  >>,
): Promise<LearnerProfile> {
  return getService().updatePreferences(patch)
}
