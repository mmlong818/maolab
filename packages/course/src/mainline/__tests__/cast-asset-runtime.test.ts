import { describe, expect, it } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import {
  castSchoolStageForGradeBand,
  mainlineCastSeasonForTeachingTime,
  withClassTimeMainlineCastAssets,
} from '../cast-asset-runtime.js'

describe('mainline cast asset runtime', () => {
  it('maps gradeBand and teaching date to the matrix slice on the server side', () => {
    expect(castSchoolStageForGradeBand('lower-primary')).toBe('primary')
    expect(castSchoolStageForGradeBand('upper-primary')).toBe('primary')
    expect(castSchoolStageForGradeBand('middle-school')).toBe('middle')
    expect(castSchoolStageForGradeBand('high-school')).toBe('high')
    expect(mainlineCastSeasonForTeachingTime(new Date('2026-07-04T10:00:00+08:00'))).toBe('summer')
    expect(mainlineCastSeasonForTeachingTime(new Date('2026-10-04T10:00:00+08:00'))).toBe('autumn')
  })

  it('rewrites golden sample castRefs from fixed middle/summer paths to class-time primary/autumn paths', () => {
    const course = GOLDEN_MAINLINE_COURSES.find(c => c.id === 'golden-primary-jingyesi')!
    const next = withClassTimeMainlineCastAssets(course, new Date('2026-10-04T10:00:00+08:00'))

    expect(next.castAssetSelection).toMatchObject({ schoolStage: 'primary', season: 'autumn' })
    const teacher = next.castProfiles.find(c => c.id === 'teacher-xiaomei')!
    const student = next.castProfiles.find(c => c.id === 'student-mei')!
    expect(teacher.assetRefs?.some(asset => asset.src === '/generated-images/cast/base/primary/autumn/teacher-xiaomei-neutral.png')).toBe(true)
    expect(student.assetRefs?.some(asset => asset.src === '/generated-images/cast/base/primary/autumn/student-steady-thinking.png')).toBe(true)
  })

  it('keeps an already resolved course stable while stage and season are unchanged', () => {
    const course = GOLDEN_MAINLINE_COURSES.find(c => c.id === 'golden-middle-tianjingsha')!
    const first = withClassTimeMainlineCastAssets(course, new Date('2026-07-04T10:00:00+08:00'))
    const second = withClassTimeMainlineCastAssets(first, new Date('2026-07-05T10:00:00+08:00'))

    expect(second).toBe(first)
    expect(second.castAssetSelection?.resolvedAt).toBe(first.castAssetSelection?.resolvedAt)
  })
})
