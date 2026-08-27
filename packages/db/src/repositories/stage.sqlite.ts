import { eq } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import type { StageRepository } from './types.js'
import type { Stage, Scene } from '@maolab/shared-types'
import { stages } from '../schema.js'
import { parseJsonColumn } from './parse-column.js'

export function createStageRepository(db: DbClient): StageRepository {
  return {
    async find(id: string): Promise<Stage | undefined> {
      const row = db.select().from(stages).where(eq(stages.id, id)).get()
      if (!row) return undefined
      return deserializeStage(row)
    },

    async save(stage: Stage): Promise<void> {
      db.insert(stages)
        .values({
          id: stage.id,
          planId: stage.planId,
          status: stage.status,
          scenes: JSON.stringify(stage.scenes),
          agents: JSON.stringify(stage.agents),
          generatedAt: stage.generatedAt ?? null,
          errorMessage: stage.errorMessage ?? null,
          slideTheme: stage.slideTheme ?? null,
        })
        .onConflictDoUpdate({
          target: stages.id,
          set: {
            status: stage.status,
            scenes: JSON.stringify(stage.scenes),
            agents: JSON.stringify(stage.agents),
            generatedAt: stage.generatedAt ?? null,
            errorMessage: stage.errorMessage ?? null,
            slideTheme: stage.slideTheme ?? null,
          },
        })
        .run()
    },

    async updateStatus(id: string, status: Stage['status'], error?: string): Promise<void> {
      db.update(stages)
        .set({ status, errorMessage: error ?? null })
        .where(eq(stages.id, id))
        .run()
    },

    async updateScene(stageId: string, scene: Scene): Promise<void> {
      const row = db.select().from(stages).where(eq(stages.id, stageId)).get()
      if (!row) throw new Error(`Stage not found: ${stageId}`)
      const sceneList = parseJsonColumn<Scene[]>(row.scenes, { table: 'stages', id: stageId, column: 'scenes' })
      const idx = sceneList.findIndex(s => s.id === scene.id)
      if (idx === -1) sceneList.push(scene)
      else sceneList[idx] = scene
      db.update(stages).set({ scenes: JSON.stringify(sceneList) }).where(eq(stages.id, stageId)).run()
    },

    async listByPlan(planId: string): Promise<Pick<Stage, 'id' | 'status' | 'generatedAt'>[]> {
      return db
        .select({ id: stages.id, status: stages.status, generatedAt: stages.generatedAt })
        .from(stages)
        .where(eq(stages.planId, planId))
        .all() as Pick<Stage, 'id' | 'status' | 'generatedAt'>[]
    },
  }
}

function deserializeStage(row: typeof stages.$inferSelect): Stage {
  const stage: Stage = {
    id: row.id,
    planId: row.planId,
    status: row.status as Stage['status'],
    scenes: parseJsonColumn<Scene[]>(row.scenes, { table: 'stages', id: row.id, column: 'scenes' }),
    agents: parseJsonColumn<Stage['agents']>(row.agents, { table: 'stages', id: row.id, column: 'agents' }),
  }
  if (row.generatedAt != null) stage.generatedAt = row.generatedAt
  if (row.errorMessage != null) stage.errorMessage = row.errorMessage
  if (row.slideTheme != null) stage.slideTheme = row.slideTheme
  return stage
}
