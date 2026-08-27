import { describe, it, expect } from 'vitest'
import { PostCourseProcessor } from '../post-course/processor.js'
import type { QuizResult } from '../quiz/grader.js'

function makeQuizResult(conceptsCovered: string[], score: number): QuizResult {
  return {
    score,
    correct: score >= 60,
    feedback: 'feedback',
    conceptsCovered,
  }
}

describe('PostCourseProcessor', () => {
  it('generates empty summary when no quiz results', () => {
    const processor = new PostCourseProcessor()
    const summary = processor.generateRecommendations()
    expect(summary.totalQuestions).toBe(0)
    expect(summary.correctCount).toBe(0)
    expect(summary.averageScore).toBe(0)
    expect(summary.masteredConcepts).toHaveLength(0)
    expect(summary.weakConcepts).toHaveLength(0)
  })

  it('records quiz results and computes averageScore', () => {
    const processor = new PostCourseProcessor()
    processor.flushQuizResults('q1', makeQuizResult(['c1'], 80))
    processor.flushQuizResults('q2', makeQuizResult(['c2'], 60))
    const summary = processor.generateRecommendations()
    expect(summary.totalQuestions).toBe(2)
    expect(summary.averageScore).toBe(70)
  })

  it('counts correctCount based on correct flag', () => {
    const processor = new PostCourseProcessor()
    processor.flushQuizResults('q1', makeQuizResult(['c1'], 100))
    processor.flushQuizResults('q2', makeQuizResult([], 30))
    const summary = processor.generateRecommendations()
    expect(summary.correctCount).toBe(1)
  })

  it('identifies mastered concepts (appeared in conceptsCovered)', () => {
    const processor = new PostCourseProcessor()
    processor.flushQuizResults('q1', makeQuizResult(['c1', 'c2'], 100))
    const summary = processor.generateRecommendations()
    expect(summary.masteredConcepts).toContain('c1')
    expect(summary.masteredConcepts).toContain('c2')
  })

  it('identifies weak concepts from missed questions', () => {
    const processor = new PostCourseProcessor()
    processor.flushQuizResults('q1', makeQuizResult([], 20), ['c3'])
    const summary = processor.generateRecommendations()
    expect(summary.weakConcepts).toContain('c3')
  })

  it('weak concepts excludes mastered concepts', () => {
    const processor = new PostCourseProcessor()
    processor.flushQuizResults('q1', makeQuizResult(['c1'], 100), ['c1'])
    processor.flushQuizResults('q2', makeQuizResult([], 0), ['c1', 'c2'])
    const summary = processor.generateRecommendations()
    expect(summary.weakConcepts).not.toContain('c1')
    expect(summary.weakConcepts).toContain('c2')
  })

  it('recordCompletion() marks the processor as completed', () => {
    const processor = new PostCourseProcessor()
    expect(processor.completed).toBe(false)
    processor.recordCompletion()
    expect(processor.completed).toBe(true)
  })
})
