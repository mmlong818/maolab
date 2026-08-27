'use server'

import type { Stage } from '@maolab/shared-types'
import { createDb, createStageRepository, createConceptMasteryRepository } from '@maolab/db'

const DB_URL = process.env.DATABASE_URL ?? 'file:./data/maolab.db'

export async function loadStage(stageId: string): Promise<Stage | null> {
  const db = createDb(DB_URL)
  const repo = createStageRepository(db)
  return (await repo.find(stageId)) ?? null
}

export interface QuizResultPayload {
  questionId: string
  correct: boolean
  conceptIds: string[]
}

export async function submitQuizResults(results: QuizResultPayload[]): Promise<void> {
  if (results.length === 0) return
  const db = createDb(DB_URL)
  const repo = createConceptMasteryRepository(db)
  const now = Date.now()

  const conceptScores = new Map<string, { correct: number; total: number }>()
  for (const r of results) {
    for (const cid of r.conceptIds) {
      const entry = conceptScores.get(cid) ?? { correct: 0, total: 0 }
      conceptScores.set(cid, {
        correct: entry.correct + (r.correct ? 1 : 0),
        total: entry.total + 1,
      })
    }
  }

  for (const [conceptId, { correct, total }] of conceptScores) {
    const existing = await repo.get(conceptId)
    const prevScore = existing?.score ?? 0.5
    const sessionScore = correct / total
    // EMA with α=0.4 so recent performance weighs more
    const newScore = prevScore * 0.6 + sessionScore * 0.4
    await repo.upsert({ conceptId, score: newScore, lastReviewedAt: now })
  }
}
