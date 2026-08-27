'use server'

import type { Scene, Program } from '@maolab/shared-types'
import { createDb, createProgramRepository, createContentUnitRepository, createStageRepository } from '@maolab/db'
import { randomUUID } from 'node:crypto'

const DB_URL = process.env['DATABASE_URL'] ?? 'file:./data/maolab.db'

/**
 * Resolve a stage-or-program identifier into a renderable scene list.
 *
 * The URL space still uses `stageId` everywhere; under the hood we now persist
 * both a legacy Stage and a new Program/ContentUnit graph. This action prefers
 * the Program view when one exists for the stage's plan, falling back to the
 * inline Stage.scenes for older or partially-generated stages.
 */
export interface ResolvedProgram {
  programId?: string
  stageId: string
  planId: string
  scenes: Scene[]
  source: 'program' | 'stage'
}

export async function resolveProgramForStage(stageId: string): Promise<ResolvedProgram | undefined> {
  const db = createDb(DB_URL)
  const stageRepo = createStageRepository(db)
  const programRepo = createProgramRepository(db)
  const contentRepo = createContentUnitRepository(db)

  const stage = await stageRepo.find(stageId)
  if (!stage) return undefined

  // Prefer a ready Program for the same plan, if one exists.
  const programs = await programRepo.listByPlan(stage.planId)
  const readyProgram = programs.find(p => p.status === 'ready' || p.status === 'partial')

  if (readyProgram) {
    const full = await programRepo.find(readyProgram.id)
    if (full && full.ordered.length > 0) {
      const sorted = [...full.ordered].sort((a, b) => a.orderIndex - b.orderIndex)
      const units = await contentRepo.findMany(sorted.map(r => r.unitId))
      const unitById = new Map(units.map(u => [u.id, u]))
      const scenes: Scene[] = sorted
        .map(ref => {
          const unit = unitById.get(ref.unitId)
          if (!unit) return undefined
          const scene: Scene = {
            id: ref.unitId,
            outlineItemId: ref.unitId,
            type: unit.subkind as Scene['type'],
            title: ref.overrideTitle ?? unit.title,
            content: unit.content,
            actions: [],
            durationHint: unit.durationHint,
            generationStatus: 'done',
          }
          return scene
        })
        .filter((s): s is Scene => s !== undefined)
      if (scenes.length > 0) {
        return {
          programId: full.id,
          stageId,
          planId: stage.planId,
          scenes,
          source: 'program',
        }
      }
    }
  }

  return {
    stageId,
    planId: stage.planId,
    scenes: stage.scenes,
    source: 'stage',
  }
}

/** Lighter helper for pages that just need the scene list. */
export async function loadScenesForStage(stageId: string): Promise<Scene[]> {
  const resolved = await resolveProgramForStage(stageId)
  return resolved?.scenes ?? []
}
