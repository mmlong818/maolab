/**
 * Browser-safe Mainline exports.
 *
 * Client components must import from this module or a concrete leaf module.
 * Keep server-only stores, release gates, generation runners, and Node hashing
 * out of this boundary.
 */
export * from './domain.js'
export * from './ai-verify.js'
export * from './assessment-alignment.js'
export * from './feature-zones.js'
export type {
  GenerationSessionStatus,
  TeachingQualityAuditRecord,
} from './generation-session.js'
export * from './player-dual-teacher.js'
export * from './planning/page-audit.js'
export * from './planning/page-contract.js'
export * from './planning/page-content-contract.js'
export * from './planning/page-first-planner.js'
export * from './planning/page-skeleton-library.js'
export * from './planning/source-reference.js'
export * from './presentation/chrome.js'
export * from './presentation/course-display-title.js'
export * from './presentation/page-content-presentation.js'
export * from './presentation/presentation-pages.js'
export * from './presentation/composition.js'
export * from './presentation/presentation.js'
export * from './presentation/primitives.js'
export * from './presentation/style-packs.js'
export * from './presentation/tokens.js'
export * from './quality-gates.js'
export * from './recap-template.js'
export * from './learning-action.js'
export * from './lesson-phase.js'
export * from './classroom-session.js'
export * from './runtime-interaction.js'
export * from './samples.js'
export * from './scene-techniques.js'
export * from './season.js'
export * from './speech-text.js'
export * from './staged-learning.js'
export * from './tts-cast.js'
export * from './voice-playback.js'
export * from './worked-example-scaffold.js'
