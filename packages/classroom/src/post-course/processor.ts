import type { QuizResult } from '../quiz/grader.js'

export interface CourseSummary {
  totalQuestions: number
  correctCount: number
  averageScore: number
  masteredConcepts: string[]
  weakConcepts: string[]
}

interface ResultEntry {
  result: QuizResult
  questionConceptIds: string[]
}

export class PostCourseProcessor {
  private entries: ResultEntry[] = []
  private _completed = false

  flushQuizResults(
    _questionId: string,
    result: QuizResult,
    questionConceptIds: string[] = [],
  ): void {
    this.entries = [...this.entries, { result, questionConceptIds }]
  }

  recordCompletion(): void {
    this._completed = true
  }

  get completed(): boolean {
    return this._completed
  }

  generateRecommendations(): CourseSummary {
    if (this.entries.length === 0) {
      return {
        totalQuestions: 0,
        correctCount: 0,
        averageScore: 0,
        masteredConcepts: [],
        weakConcepts: [],
      }
    }

    const totalQuestions = this.entries.length
    const correctCount = this.entries.filter((e) => e.result.correct).length
    const averageScore =
      this.entries.reduce((sum, e) => sum + e.result.score, 0) / totalQuestions

    const mastered = new Set<string>()
    for (const entry of this.entries) {
      for (const c of entry.result.conceptsCovered) {
        mastered.add(c)
      }
    }

    const weak = new Set<string>()
    for (const entry of this.entries) {
      if (!entry.result.correct) {
        for (const c of entry.questionConceptIds) {
          if (!mastered.has(c)) {
            weak.add(c)
          }
        }
      }
    }

    return {
      totalQuestions,
      correctCount,
      averageScore,
      masteredConcepts: [...mastered],
      weakConcepts: [...weak],
    }
  }
}
