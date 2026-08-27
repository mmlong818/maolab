import type { QuizQuestion, QuizQuestionType } from '@maolab/shared-types'

export type { QuizQuestion }

export interface QuizResult {
  score: number
  correct: boolean
  feedback: string
  conceptsCovered: string[]
}

export type ShortAnswerGradeFn = (
  question: QuizQuestion,
  studentAnswer: string,
) => Promise<{ score: number; feedback: string; conceptsCovered: string[] }>

export interface QuizGrader {
  grade(question: QuizQuestion, studentAnswer: string): Promise<QuizResult>
}

export class MultipleChoiceGrader implements QuizGrader {
  async grade(question: QuizQuestion, studentAnswer: string): Promise<QuizResult> {
    if (!question.correctAnswers || question.correctAnswers.length === 0) {
      throw new Error(`Multiple choice question ${question.id} has no correctAnswers`)
    }
    const correct = question.correctAnswers
    const given = studentAnswer.split(',').map((s) => s.trim()).sort()
    const expected = [...correct].sort()

    const isCorrect =
      given.length === expected.length && given.every((v, i) => v === expected[i])

    return {
      score: isCorrect ? 100 : 0,
      correct: isCorrect,
      feedback: isCorrect
        ? `Correct! ${question.explanation}`
        : `Incorrect. ${question.explanation}`,
      conceptsCovered: isCorrect ? [...question.concepts] : [],
    }
  }
}

export class ShortAnswerGrader implements QuizGrader {
  constructor(private readonly gradeFn: ShortAnswerGradeFn) {}

  async grade(question: QuizQuestion, studentAnswer: string): Promise<QuizResult> {
    const result = await this.gradeFn(question, studentAnswer)
    return {
      ...result,
      correct: result.score >= 60,
    }
  }
}

export class GraderFactory {
  static create(type: QuizQuestionType, gradeFn: ShortAnswerGradeFn): QuizGrader {
    switch (type) {
      case 'multiple_choice':
        return new MultipleChoiceGrader()
      case 'short_answer':
        return new ShortAnswerGrader(gradeFn)
      default: {
        const _exhaustive: never = type
        throw new Error(`Unknown question type: ${String(_exhaustive)}`)
      }
    }
  }
}
