import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import {
  createGenerationSessionService,
  type GenerationSessionPersistence,
} from '../generation-session-service.js'
import { generationInputHash } from '../generation-session.js'
import type { CoursePlanningState, LessonPagePlan } from '../planning/page-contract.js'

const page: LessonPagePlan = {
  id: 'page-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'],
  purpose: 'question', audience: 'student', learningAction: '先作答。', newInformation: '呈现问题。',
  sourceRefs: [],
  contentSpec: { kind: 'question', promptGoal: '判断', answerPolicy: 'separate-following-page', responsePageId: 'page-2', materialRefs: [] },
  visualSpec: { required: false, form: 'none', reason: '测试。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '提问。', teachingMove: '等待。', pace: 'brief' }, arcStepId: 'arc-1',
}

function makeCourse(): MainlineCourse {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2', courseId: 'course-1', planRevisionId: 'plan-1', status: 'plan-approved',
    learningContracts: [], arc: { id: 'arc-1', courseId: 'course-1', steps: [] }, pages: [page],
  }
  return { id: 'course-1', planning, qualityStatus: 'draft' } as unknown as MainlineCourse
}

function memoryPersistence(initial = makeCourse()) {
  let course = structuredClone(initial)
  let saves = 0
  const persistence: GenerationSessionPersistence = {
    async find(id) { return id === course.id ? structuredClone(course) : undefined },
    async save(next) { course = structuredClone(next); saves += 1 },
  }
  return { persistence, current: () => course, saves: () => saves }
}

describe('generation session service', () => {
  it('persists a created session and keeps duplicate creation idempotent', async () => {
    const memory = memoryPersistence()
    const service = createGenerationSessionService(memory.persistence)
    const first = await service.execute('course-1', { action: 'create', sessionId: 'session-1' }, '2026-09-11T10:00:00.000Z')
    const second = await service.execute('course-1', { action: 'create', sessionId: 'session-1' }, '2026-09-11T10:01:00.000Z')
    expect(second).toEqual(first)
    expect(memory.saves()).toBe(1)
    expect(memory.current().generationSession).toEqual(first)
  })

  it('rejects a stale expected version instead of overwriting newer state', async () => {
    const memory = memoryPersistence()
    const service = createGenerationSessionService(memory.persistence)
    const created = await service.execute('course-1', { action: 'create', sessionId: 'session-1' }, '2026-09-11T10:00:00.000Z')
    await service.execute('course-1', {
      action: 'start-page', expectedUpdatedAt: created.updatedAt, pageId: 'page-1', inputHash: generationInputHash({ pageId: 'page-1' }),
    }, '2026-09-11T10:01:00.000Z')
    await expect(service.execute('course-1', {
      action: 'cancel', expectedUpdatedAt: created.updatedAt,
    }, '2026-09-11T10:02:00.000Z')).rejects.toMatchObject({ code: 'SESSION_CONFLICT' })
  })

  it('serializes concurrent commands so only one can consume a version', async () => {
    const memory = memoryPersistence()
    const service = createGenerationSessionService(memory.persistence)
    const created = await service.execute('course-1', { action: 'create', sessionId: 'session-1' }, '2026-09-11T10:00:00.000Z')
    const results = await Promise.allSettled([
      service.execute('course-1', {
        action: 'start-page', expectedUpdatedAt: created.updatedAt, pageId: 'page-1', inputHash: generationInputHash({ pageId: 'page-1' }),
      }, '2026-09-11T10:01:00.000Z'),
      service.execute('course-1', { action: 'cancel', expectedUpdatedAt: created.updatedAt }, '2026-09-11T10:02:00.000Z'),
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      status: 'rejected', reason: { code: 'SESSION_CONFLICT' },
    })
  })

  it('recovers persisted interrupted work through a new service instance', async () => {
    const memory = memoryPersistence()
    let service = createGenerationSessionService(memory.persistence)
    const created = await service.execute('course-1', { action: 'create', sessionId: 'session-1' }, '2026-09-11T10:00:00.000Z')
    const running = await service.execute('course-1', {
      action: 'start-page', expectedUpdatedAt: created.updatedAt, pageId: 'page-1', inputHash: generationInputHash({ pageId: 'page-1' }),
    }, '2026-09-11T10:01:00.000Z')
    service = createGenerationSessionService(memory.persistence)
    const recovered = await service.execute('course-1', {
      action: 'recover', expectedUpdatedAt: running.updatedAt,
    }, '2026-09-11T10:02:00.000Z')
    expect(recovered.jobs[0]).toMatchObject({ status: 'queued', attempt: 1 })
  })

  it('reports missing courses and missing sessions distinctly', async () => {
    const memory = memoryPersistence()
    const service = createGenerationSessionService(memory.persistence)
    await expect(service.execute('missing', { action: 'create', sessionId: 'session-1' }))
      .rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' })
    await expect(service.execute('course-1', { action: 'cancel', expectedUpdatedAt: 'none' }))
      .rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' })
  })
})
