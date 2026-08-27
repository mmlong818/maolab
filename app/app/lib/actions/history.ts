'use server'

import { revalidatePath } from 'next/cache'
import { createDb, createTeachingPlanRepository, createStageRepository } from '@maolab/db'

const DB_URL = process.env.DATABASE_URL ?? 'file:./data/maolab.db'

export interface HistoryEntry {
  planId: string
  topic: string
  createdAt: number
  gradeLevel: string | null
  sceneCount: number
  stages: { id: string; status: string; generatedAt: number | null }[]
}

export async function listHistory(): Promise<HistoryEntry[]> {
  const db = createDb(DB_URL)
  const planRepo = createTeachingPlanRepository(db)
  const stageRepo = createStageRepository(db)

  const plans = await planRepo.list()
  const entries = await Promise.all(
    plans.map(async plan => {
      const stages = await stageRepo.listByPlan(plan.id)
      return {
        planId: plan.id,
        topic: plan.topic,
        createdAt: plan.createdAt,
        gradeLevel: ('gradeLevel' in plan ? plan.gradeLevel : null) ?? null,
        sceneCount: plan.outline?.length ?? 0,
        stages: stages.map(s => ({
          id: s.id,
          status: s.status,
          generatedAt: s.generatedAt ?? null,
        })),
      }
    }),
  )
  return entries
}

/** Delete a teaching plan and all related stages/programs.
 *  ContentUnits in the library are preserved — they may be referenced elsewhere or worth keeping. */
export async function deleteTeachingPlan(planId: string): Promise<void> {
  if (typeof planId !== 'string' || planId.length === 0) {
    throw new Error('planId 不合法')
  }
  // @ts-expect-error — better-sqlite3 has no bundled types in this workspace
  const mod = await import('better-sqlite3')
  const Database = (mod.default ?? mod) as new (p: string) => {
    pragma: (s: string) => unknown
    prepare: (s: string) => { run: (...a: unknown[]) => unknown }
    transaction: <T>(f: () => T) => () => T
    close: () => void
  }
  const path = DB_URL.replace(/^file:/, '')
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.transaction(() => {
    sqlite.prepare('DELETE FROM stages WHERE plan_id = ?').run(planId)
    sqlite.prepare('DELETE FROM programs WHERE plan_id = ?').run(planId)
    sqlite.prepare('DELETE FROM teaching_plans WHERE id = ?').run(planId)
  })()
  sqlite.close()
  revalidatePath('/history')
  revalidatePath('/library')
}
