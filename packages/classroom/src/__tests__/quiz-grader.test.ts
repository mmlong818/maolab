import { describe, it, expect, vi } from 'vitest'
import { MultipleChoiceGrader, ShortAnswerGrader, GraderFactory } from '../quiz/grader.js'
import type { QuizQuestion } from '@maolab/shared-types'

function makeMCQ(correctAnswers: string[]): QuizQuestion {
  return {
    id: 'q1',
    type: 'multiple_choice',
    stem: 'Which of the following is correct?',
    options: ['A', 'B', 'C', 'D'],
    correctAnswers,
    explanation: 'Because A is correct.',
    concepts: ['concept-1'],
  }
}

function makeSAQ(): QuizQuestion {
  return {
    id: 'q2',
    type: 'short_answer',
    stem: 'Explain photosynthesis.',
    explanation: 'Plants convert sunlight to energy.',
    concepts: ['concept-2', 'concept-3'],
  }
}

describe('MultipleChoiceGrader', () => {
  const grader = new MultipleChoiceGrader()

  it('returns 100 for correct single answer', async () => {
    const result = await grader.grade(makeMCQ(['A']), 'A')
    expect(result.score).toBe(100)
    expect(result.correct).toBe(true)
  })

  it('returns 0 for wrong answer', async () => {
    const result = await grader.grade(makeMCQ(['A']), 'B')
    expect(result.score).toBe(0)
    expect(result.correct).toBe(false)
  })

  it('returns 100 for correct multi-answer (all correct)', async () => {
    const result = await grader.grade(makeMCQ(['A', 'C']), 'A,C')
    expect(result.score).toBe(100)
    expect(result.correct).toBe(true)
  })

  it('returns 0 for partial multi-answer', async () => {
    const result = await grader.grade(makeMCQ(['A', 'C']), 'A')
    expect(result.score).toBe(0)
    expect(result.correct).toBe(false)
  })

  it('includes explanation in feedback', async () => {
    const result = await grader.grade(makeMCQ(['A']), 'B')
    expect(result.feedback).toContain('Because A is correct.')
  })

  it('includes concepts covered on correct answer', async () => {
    const result = await grader.grade(makeMCQ(['A']), 'A')
    expect(result.conceptsCovered).toContain('concept-1')
  })

  it('returns empty conceptsCovered on wrong answer', async () => {
    const result = await grader.grade(makeMCQ(['A']), 'B')
    expect(result.conceptsCovered).toHaveLength(0)
  })

  it('throws when correctAnswers is empty', async () => {
    const question = makeMCQ([])
    await expect(grader.grade(question, 'A')).rejects.toThrow(
      `Multiple choice question ${question.id} has no correctAnswers`,
    )
  })
})

describe('ShortAnswerGrader', () => {
  it('delegates to grade function and returns result', async () => {
    const mockGrade = vi.fn().mockResolvedValue({
      score: 80,
      feedback: 'Good answer',
      conceptsCovered: ['concept-2'],
    })
    const grader = new ShortAnswerGrader(mockGrade)
    const result = await grader.grade(makeSAQ(), 'Plants use sunlight')
    expect(result.score).toBe(80)
    expect(result.feedback).toBe('Good answer')
    expect(result.conceptsCovered).toContain('concept-2')
    expect(mockGrade).toHaveBeenCalledWith(makeSAQ(), 'Plants use sunlight')
  })

  it('sets correct=true when score >= 60', async () => {
    const mockGrade = vi.fn().mockResolvedValue({
      score: 60,
      feedback: 'OK',
      conceptsCovered: [],
    })
    const grader = new ShortAnswerGrader(mockGrade)
    const result = await grader.grade(makeSAQ(), 'some answer')
    expect(result.correct).toBe(true)
  })

  it('sets correct=false when score < 60', async () => {
    const mockGrade = vi.fn().mockResolvedValue({
      score: 59,
      feedback: 'Not enough',
      conceptsCovered: [],
    })
    const grader = new ShortAnswerGrader(mockGrade)
    const result = await grader.grade(makeSAQ(), 'weak answer')
    expect(result.correct).toBe(false)
  })
})

describe('GraderFactory', () => {
  it('creates MultipleChoiceGrader for multiple_choice type', () => {
    const mockGrade = vi.fn()
    const grader = GraderFactory.create('multiple_choice', mockGrade)
    expect(grader).toBeInstanceOf(MultipleChoiceGrader)
  })

  it('creates ShortAnswerGrader for short_answer type', () => {
    const mockGrade = vi.fn()
    const grader = GraderFactory.create('short_answer', mockGrade)
    expect(grader).toBeInstanceOf(ShortAnswerGrader)
  })

  it('throws for unknown question type', () => {
    const mockGrade = vi.fn()
    expect(() => GraderFactory.create('unknown' as never, mockGrade)).toThrow()
  })
})
