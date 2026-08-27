export {
  toneRulesFor,
  findToneViolations,
  type PedagogyGradeBand,
  type ToneRules,
  type ToneViolation,
  type BannedPhrase,
} from './tone-rules.js'

export {
  MISCONCEPTION_REGISTRY,
  misconceptionsFor,
  findBannedPhrasings,
  type MisconceptionEntry,
  type PedagogySubject,
  type PhrasingViolation,
} from './misconceptions.js'

export {
  METAPHOR_REGISTRY,
  metaphorsFor,
  type MetaphorEntry,
  type MetaphorMatch,
  type MetaphorStatus,
} from './metaphors.js'
