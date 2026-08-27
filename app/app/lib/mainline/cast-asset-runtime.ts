import type { CastAssetSelection, CastSchoolStage, CastSeason } from '@maolab/shared-types'
import { CAST_CHARACTER_IDS, CAST_EXPRESSIONS, type IpExpression } from '../cast-assets/matrix.js'
import type { CastProfile, CharacterExpressionAsset, GradeBand, MainlineCourse } from './domain.js'

const BASE_CAST_ROOT = '/generated-images/cast/base'

const CAST_ID_TO_MATRIX_ID: Record<string, string> = {
  'student-chen': 'student-thinker',
  'student-k': 'student-joker',
  'student-k-physics': 'student-joker',
  'student-mei': 'student-steady',
}

const SEMANTIC_EXPRESSION_MAP: Record<string, IpExpression> = {
  neutral: 'neutral',
  calm: 'neutral',
  happy: 'happy',
  encouraging: 'happy',
  excited: 'happy',
  thinking: 'thinking',
  questioning: 'thinking',
  curious: 'thinking',
  attempt: 'thinking',
  analytical: 'thinking',
  surprised: 'surprised',
  emphatic: 'surprised',
}

function timeMs(value: Date | number): number {
  return value instanceof Date ? value.getTime() : value
}

export function mainlineCastSeasonForTeachingTime(teachingTime: Date | number = Date.now()): CastSeason {
  const month = new Date(timeMs(teachingTime)).getMonth() + 1
  return month >= 5 && month <= 9 ? 'summer' : 'autumn'
}

export function castSchoolStageForGradeBand(gradeBand: GradeBand): CastSchoolStage {
  if (gradeBand === 'lower-primary' || gradeBand === 'upper-primary') return 'primary'
  if (gradeBand === 'high-school') return 'high'
  return 'middle'
}

export function resolveMainlineCastAssetSelection(
  course: Pick<MainlineCourse, 'gradeBand'>,
  teachingTime: Date | number = Date.now(),
): CastAssetSelection {
  return {
    schoolStage: castSchoolStageForGradeBand(course.gradeBand),
    season: mainlineCastSeasonForTeachingTime(teachingTime),
    resolvedAt: timeMs(teachingTime),
  }
}

export function withClassTimeMainlineCastAssets(
  course: MainlineCourse,
  teachingTime: Date | number = Date.now(),
): MainlineCourse {
  const selection = resolveMainlineCastAssetSelection(course, teachingTime)
  if (sameCastSelection(course.castAssetSelection, selection) && castProfilesUseSelection(course.castProfiles, selection)) {
    return course
  }

  return {
    ...course,
    castAssetSelection: selection,
    castProfiles: course.castProfiles.map(cast => withResolvedAssetRefs(cast, selection)),
  }
}

function sameCastSelection(a: CastAssetSelection | undefined, b: CastAssetSelection): boolean {
  return a?.schoolStage === b.schoolStage && a.season === b.season && typeof a.resolvedAt === 'number'
}

function castProfilesUseSelection(castProfiles: readonly CastProfile[], selection: CastAssetSelection): boolean {
  const expectedSegment = `${BASE_CAST_ROOT}/${selection.schoolStage}/${selection.season}/`
  return castProfiles.every(cast => {
    if (cast.role !== 'teacher' && cast.role !== 'student' && cast.role !== 'peer') return true
    if (!matrixCharacterId(cast.id)) return false
    const refs = cast.assetRefs
    if (!refs?.length) return false
    return refs.every(asset => asset.kind === 'half-body-cutout' && asset.src.startsWith(expectedSegment))
  })
}

function withResolvedAssetRefs(cast: CastProfile, selection: CastAssetSelection): CastProfile {
  if (cast.role !== 'teacher' && cast.role !== 'student' && cast.role !== 'peer') return cast

  const characterId = matrixCharacterId(cast.id)
  if (!characterId) {
    return {
      ...cast,
      assetRefs: [],
    }
  }

  const expressions = expressionsFor(cast)
  return {
    ...cast,
    expressionSet: Array.from(new Set([...cast.expressionSet, ...CAST_EXPRESSIONS])),
    assetRefs: expressions.map(expression => expressionAsset(characterId, expression, selection)),
  }
}

function matrixCharacterId(castId: string): string | undefined {
  const mapped = CAST_ID_TO_MATRIX_ID[castId] ?? castId
  return (CAST_CHARACTER_IDS as readonly string[]).includes(mapped) ? mapped : undefined
}

function expressionsFor(cast: CastProfile): string[] {
  return Array.from(new Set([
    ...CAST_EXPRESSIONS,
    ...cast.expressionSet,
    ...(cast.assetRefs ?? []).map(asset => asset.expression),
  ]))
}

function expressionAsset(
  characterId: string,
  expression: string,
  selection: CastAssetSelection,
): CharacterExpressionAsset {
  const matrixExpression = SEMANTIC_EXPRESSION_MAP[expression] ?? 'neutral'
  return {
    expression,
    src: `${BASE_CAST_ROOT}/${selection.schoolStage}/${selection.season}/${characterId}-${matrixExpression}.png`,
    kind: 'half-body-cutout',
    transparentBackground: true,
  }
}
