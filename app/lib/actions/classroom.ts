'use server'

import { z } from 'zod'
import { createDb, createStageRepository } from '@maolab/db'
import type { Stage, Scene, WhiteboardElement } from '@maolab/shared-types'
import { AdaptiveController } from '@maolab/classroom'

function getDbUrl(): string {
  return process.env['DATABASE_URL'] ?? 'file:./data/maolab.db'
}

function getDb() {
  return createDb(getDbUrl())
}

export async function loadStage(stageId: string): Promise<Stage | null> {
  const db = getDb()
  const repo = createStageRepository(db)
  return (await repo.find(stageId)) ?? null
}

export async function submitAnswer(
  stageId: string,
  sceneId: string,
  answer: unknown,
): Promise<{ success: boolean; error?: string }> {
  // Phase 1: validates input only. Grading and persistence deferred to Phase 2.
  const parsed = z.object({ value: z.unknown() }).safeParse({ value: answer })
  if (!parsed.success || answer === null || answer === undefined) {
    return { success: false, error: 'Invalid answer: answer must not be null' }
  }

  const db = getDb()
  const repo = createStageRepository(db)
  const stage = await repo.find(stageId)
  if (!stage) return { success: false, error: `Stage not found: ${stageId}` }

  const scene = stage.scenes.find((s) => s.id === sceneId)
  if (!scene) return { success: false, error: `Scene not found: ${sceneId}` }

  return { success: true }
}

export async function completeCourse(stageId: string): Promise<void> {
  const db = getDb()
  const repo = createStageRepository(db)
  const stage = await repo.find(stageId)
  if (!stage) throw new Error(`Stage not found: ${stageId}`)
  // Mark stage as ready (complete) and record the completion timestamp
  await repo.save({ ...stage, status: 'ready', generatedAt: Date.now() })
}

export async function checkShouldSkip(masteryScore: number): Promise<boolean> {
  const ctrl = new AdaptiveController()
  const dummyScene = {
    id: 'check',
    outlineItemId: 'check',
    type: 'slide' as const,
    title: 'check',
    content: { type: 'slide' as const, slides: [], conceptIds: ['__check__'] },
    actions: [],
    durationHint: 0,
    generationStatus: 'done' as const,
  }
  ctrl.setMastery('__check__', masteryScore)
  return ctrl.shouldSkip(dummyScene)
}

const SnapshotElementSchema = z.array(
  z.object({ id: z.string(), type: z.string(), data: z.unknown() }),
)

export async function saveWhiteboardSnapshot(
  stageId: string,
  sceneId: string,
  snapshotData: unknown,
): Promise<void> {
  const parsed = SnapshotElementSchema.safeParse(snapshotData)
  if (!parsed.success) {
    throw new Error(`Invalid snapshot data: ${parsed.error.message}`)
  }
  // Zod validates id/type/data presence; cast to WhiteboardElement[] for repo compatibility
  const elements = parsed.data as WhiteboardElement[]

  const db = getDb()
  const repo = createStageRepository(db)
  const stage = await repo.find(stageId)
  if (!stage) throw new Error(`Stage not found: ${stageId}`)

  const updatedScenes = stage.scenes.map((scene) => {
    if (scene.id !== sceneId) return scene
    return {
      ...scene,
      whiteboardSnapshot: {
        capturedAt: Date.now(),
        elements,
      },
    }
  })

  await repo.save({ ...stage, scenes: updatedScenes })
}
