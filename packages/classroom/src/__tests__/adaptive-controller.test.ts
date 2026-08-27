import { describe, it, expect } from 'vitest'
import { AdaptiveController } from '../adaptive/controller.js'
import type { Scene } from '@maolab/shared-types'
import type { QuizResult } from '../quiz/grader.js'

function makeSlideScene(id: string, conceptIds: string[]): Scene {
  return {
    id,
    outlineItemId: `item-${id}`,
    type: 'slide',
    title: `Scene ${id}`,
    content: { type: 'slide', slides: [], conceptIds },
    actions: [],
    durationHint: 180,
    generationStatus: 'done',
  }
}

function makeQuizScene(id: string): Scene {
  return {
    id,
    outlineItemId: `item-${id}`,
    type: 'quiz',
    title: `Quiz ${id}`,
    content: {
      type: 'quiz',
      questions: [
        {
          id: 'q1',
          type: 'multiple_choice',
          stem: 'Test question',
          options: ['A', 'B'],
          correctAnswers: ['A'],
          explanation: 'A is correct',
          concepts: ['concept-a'],
        },
      ],
    },
    actions: [],
    durationHint: 120,
    generationStatus: 'done',
  }
}

function makeQuizResult(score: number): QuizResult {
  return {
    score,
    correct: score >= 60,
    feedback: 'feedback',
    conceptsCovered: score >= 60 ? ['concept-a'] : [],
  }
}

describe('AdaptiveController', () => {
  it('initializes with mastery map empty', () => {
    const ctrl = new AdaptiveController()
    expect(ctrl.getMasteryMap()).toEqual({})
  })

  it('recordQuizResult() updates mastery for covered concepts', () => {
    const ctrl = new AdaptiveController()
    const scene = makeQuizScene('q1')
    ctrl.recordQuizResult(scene, makeQuizResult(100))
    const mastery = ctrl.getMasteryMap()
    expect(mastery['concept-a']).toBeGreaterThan(0)
  })

  it('recordQuizResult() does not increase mastery for uncovered concepts', () => {
    const ctrl = new AdaptiveController()
    const scene = makeQuizScene('q1')
    ctrl.recordQuizResult(scene, makeQuizResult(0))
    const mastery = ctrl.getMasteryMap()
    expect(mastery['concept-a'] ?? 0).toBe(0)
  })

  it('shouldSkip() returns false for slide scenes with no mastery data', () => {
    const ctrl = new AdaptiveController()
    const scene = makeSlideScene('s1', ['concept-a'])
    expect(ctrl.shouldSkip(scene)).toBe(false)
  })

  it('shouldSkip() returns true for slide scene when all concepts are mastered', () => {
    const ctrl = new AdaptiveController()
    ctrl.setMastery('concept-a', 1.0)
    const scene = makeSlideScene('s1', ['concept-a'])
    expect(ctrl.shouldSkip(scene)).toBe(true)
  })

  it('shouldSkip() returns false for slide scene with partial mastery below 0.85', () => {
    const ctrl = new AdaptiveController()
    ctrl.setMastery('concept-a', 0.84)
    ctrl.setMastery('concept-b', 1.0)
    const scene = makeSlideScene('s1', ['concept-a', 'concept-b'])
    expect(ctrl.shouldSkip(scene)).toBe(false)
  })

  it('shouldSkip() never returns true for quiz scenes', () => {
    const ctrl = new AdaptiveController()
    ctrl.setMastery('concept-a', 1.0)
    const scene = makeQuizScene('q1')
    expect(ctrl.shouldSkip(scene)).toBe(false)
  })

  it('suggestRemediation() returns empty array when mastery is sufficient', () => {
    const ctrl = new AdaptiveController()
    ctrl.setMastery('concept-a', 1.0)
    expect(ctrl.suggestRemediation(['concept-a'])).toHaveLength(0)
  })

  it('shouldGenerateSupplementary() returns true when masteryScore <= 0.60', () => {
    const ctrl = new AdaptiveController()
    expect(ctrl.shouldGenerateSupplementary(0.60)).toBe(true)
    expect(ctrl.shouldGenerateSupplementary(0.50)).toBe(true)
    expect(ctrl.shouldGenerateSupplementary(0.0)).toBe(true)
  })

  it('shouldGenerateSupplementary() returns false when masteryScore > 0.60', () => {
    const ctrl = new AdaptiveController()
    expect(ctrl.shouldGenerateSupplementary(0.61)).toBe(false)
    expect(ctrl.shouldGenerateSupplementary(1.0)).toBe(false)
  })

  it('suggestRemediation() returns concepts below threshold', () => {
    const ctrl = new AdaptiveController()
    ctrl.setMastery('concept-a', 0.3)
    ctrl.setMastery('concept-b', 1.0)
    const result = ctrl.suggestRemediation(['concept-a', 'concept-b'])
    expect(result).toContain('concept-a')
    expect(result).not.toContain('concept-b')
  })
})
