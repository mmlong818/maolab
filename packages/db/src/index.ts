export { createDb, openSqliteRaw } from './client.js'
export { ensureKnowledgePointTables, KP_DDL } from './knowledge-point-store.js'
export {
  insertAtomByKp,
  insertAtomByKpBatch,
  findAtomsByKp,
  deleteAtomsByKpForCourse,
} from './atom-by-kp-repo.js'
export type { AtomByKpRecord, FindAtomsByKpOpts } from './atom-by-kp-repo.js'
export {
  insertCluster,
  insertKnowledgePoint,
  insertSourceRefs,
  linkChapterNodeKp,
  findKpByCanonicalHash,
} from './knowledge-point-repo.js'
export {
  insertKpRelation,
  insertKpRelationBatch,
  findRelationsFromKp,
  findRelationsToKp,
  findRelationsBetween,
  clearRelationsBySource,
  countKpRelations,
} from './kp-relations-repo.js'
export type { KpRelationRecord, KpRelationType, KpRelationSource } from './kp-relations-repo.js'
export { createUserProfileRepository, DEFAULT_PROFILE } from './repositories/user-profile.sqlite.js'
export { createConceptMasteryRepository } from './repositories/concept-mastery.sqlite.js'
export { createTeachingPlanRepository } from './repositories/teaching-plan.sqlite.js'
export { createStageRepository } from './repositories/stage.sqlite.js'
export { createContentUnitRepository } from './repositories/content-unit.sqlite.js'
export { createProgramRepository } from './repositories/program.sqlite.js'
export { createLocalMediaRepository } from './repositories/media.local.js'
export { createCoursesV2Repository } from './repositories/courses-v2.sqlite.js'
export type { CoursesV2Repository } from './repositories/courses-v2.sqlite.js'
export { createMainlineCourseRepository } from './repositories/mainline-course.sqlite.js'
export type { MainlineCourseRepository, MainlineCourseRecord } from './repositories/mainline-course.sqlite.js'
export { createSeasonRepository } from './repositories/season.sqlite.js'
export type { SeasonRepository, SeasonRecord } from './repositories/season.sqlite.js'
export type {
  UserProfileRepository,
  ConceptMasteryRepository,
  TeachingPlanRepository,
  StageRepository,
  ContentUnitRepository,
  ProgramRepository,
  MediaRepository,
} from './repositories/types.js'
