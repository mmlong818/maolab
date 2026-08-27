export type { UserProfileService } from './types.js'
export { SqliteUserProfileService } from './service.js'
export { buildDefaultProfile, mergeAdaptiveState } from './defaults.js'

import { createDb, createUserProfileRepository, createConceptMasteryRepository } from '@maolab/db'
import { SqliteUserProfileService } from './service.js'
import type { UserProfileService } from './types.js'

export function createUserProfileService(dbUrl: string): UserProfileService {
  const db = createDb(dbUrl)
  const profileRepo = createUserProfileRepository(db)
  const masteryRepo = createConceptMasteryRepository(db)
  return new SqliteUserProfileService(profileRepo, masteryRepo)
}
