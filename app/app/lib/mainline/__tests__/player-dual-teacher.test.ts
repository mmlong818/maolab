import { describe, expect, it } from 'vitest'
import { courseHasDualTeacherOption, dualTeacherSceneBehavior } from '../player-dual-teacher.js'

describe('courseHasDualTeacherOption', () => {
  it('is false when every scene is ai (explicit or defaulted)', () => {
    expect(courseHasDualTeacherOption([{ executor: 'ai' }, {}])).toBe(false)
  })

  it('is true when any scene is teacher-led', () => {
    expect(courseHasDualTeacherOption([{ executor: 'ai' }, { executor: 'teacher' }])).toBe(true)
  })

  it('is true when any scene is co-led', () => {
    expect(courseHasDualTeacherOption([{ executor: 'co' }])).toBe(true)
  })

  it('is false for an empty course', () => {
    expect(courseHasDualTeacherOption([])).toBe(false)
  })
})

describe('dualTeacherSceneBehavior', () => {
  it('leaves every scene unaffected when the toggle is off, regardless of executor', () => {
    expect(dualTeacherSceneBehavior({ executor: 'teacher' }, false)).toEqual({ showBigBoard: false, silenceTts: false })
    expect(dualTeacherSceneBehavior({ executor: 'co' }, false)).toEqual({ showBigBoard: false, silenceTts: false })
    expect(dualTeacherSceneBehavior({ executor: 'ai' }, false)).toEqual({ showBigBoard: false, silenceTts: false })
  })

  it('switches teacher scenes to the big-board / silent-tts state when on', () => {
    expect(dualTeacherSceneBehavior({ executor: 'teacher' }, true)).toEqual({ showBigBoard: true, silenceTts: true })
  })

  it('leaves ai scenes fully untouched when on (explicit or defaulted)', () => {
    expect(dualTeacherSceneBehavior({ executor: 'ai' }, true)).toEqual({ showBigBoard: false, silenceTts: false })
    expect(dualTeacherSceneBehavior({}, true)).toEqual({ showBigBoard: false, silenceTts: false })
  })

  it('leaves co scenes performing normally when on (manual advance only, no interrupt)', () => {
    expect(dualTeacherSceneBehavior({ executor: 'co' }, true)).toEqual({ showBigBoard: false, silenceTts: false })
  })
})
