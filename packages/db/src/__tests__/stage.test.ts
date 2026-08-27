import { describe, it, expect, beforeEach } from 'vitest'
import { createDb } from '../client.js'
import { createStageRepository } from '../repositories/stage.sqlite.js'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import type { Stage, Scene } from '@maolab/shared-types'

function createTestDb() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: './src/migrations' })
  return db
}

const SAMPLE_STAGE: Stage = {
  id: 'stage-1',
  planId: 'plan-1',
  status: 'generating',
  scenes: [],
  agents: [],
}

const SAMPLE_SCENE: Scene = {
  id: 's1',
  outlineItemId: 'o1',
  type: 'slide',
  title: '第一章',
  content: { type: 'slide', slides: [], conceptIds: [] },
  actions: [],
  durationHint: 120,
  generationStatus: 'pending',
}

describe('StageRepository', () => {
  let repo: ReturnType<typeof createStageRepository>

  beforeEach(() => {
    repo = createStageRepository(createTestDb())
  })

  it('saves and retrieves a stage', async () => {
    await repo.save(SAMPLE_STAGE)
    const stage = await repo.find('stage-1')
    expect(stage?.planId).toBe('plan-1')
    expect(stage?.status).toBe('generating')
  })

  it('returns undefined for unknown id', async () => {
    expect(await repo.find('unknown')).toBeUndefined()
  })

  it('updateStatus changes status', async () => {
    await repo.save(SAMPLE_STAGE)
    await repo.updateStatus('stage-1', 'ready')
    expect((await repo.find('stage-1'))?.status).toBe('ready')
  })

  it('updateScene inserts new scene', async () => {
    await repo.save(SAMPLE_STAGE)
    await repo.updateScene('stage-1', SAMPLE_SCENE)
    const stage = await repo.find('stage-1')
    expect(stage?.scenes).toHaveLength(1)
    expect(stage?.scenes[0]?.id).toBe('s1')
  })

  it('updateScene updates existing scene', async () => {
    await repo.save({ ...SAMPLE_STAGE, scenes: [SAMPLE_SCENE] })
    await repo.updateScene('stage-1', { ...SAMPLE_SCENE, generationStatus: 'done' })
    const stage = await repo.find('stage-1')
    expect(stage?.scenes[0]?.generationStatus).toBe('done')
  })

  it('listByPlan returns correct stages', async () => {
    await repo.save({ ...SAMPLE_STAGE, id: 'stage-1', planId: 'plan-A' })
    await repo.save({ ...SAMPLE_STAGE, id: 'stage-2', planId: 'plan-B' })
    const list = await repo.listByPlan('plan-A')
    expect(list).toHaveLength(1)
    expect(list[0]?.id).toBe('stage-1')
  })
})
