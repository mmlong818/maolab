import { describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { createGenerationPageRunner, type GenerationPagePersistence } from '../generation-page-runner.js'
import { createGenerationSession, resumeBlockedPage, startPageGeneration } from '../generation-session.js'
import type { GeneratedLessonPage } from '../planning/page-content-contract.js'
import type { CoursePlanningState, LessonPagePlan } from '../planning/page-contract.js'

const pages: LessonPagePlan[] = [1, 2].map(order => ({
  id: `page-${order}`,
  order,
  fragmentId: 'fragment-1',
  knowledgePointIds: [],
  purpose: 'explain',
  audience: 'student',
  learningAction: `理解第 ${order} 个要点。`,
  newInformation: `第 ${order} 个新信息。`,
  sourceRefs: [],
  contentSpec: { kind: 'explanation', focus: `概念 ${order}`, requiredElements: [`要点 ${order}`] },
  visualSpec: { required: false, form: 'none', reason: '不需要图像。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '讲清要点。', teachingMove: '追问依据。', pace: 'brief' },
  arcStepId: 'arc-1',
  ...(order === 2 ? { previousPageId: 'page-1' } : {}),
}))

function makeCourse(): MainlineCourse {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2',
    courseId: 'course-1',
    planRevisionId: 'plan-1',
    status: 'plan-approved',
    learningContracts: [],
    arc: { id: 'arc-1', courseId: 'course-1', steps: [] },
    pages,
  }
  const course = {
    id: 'course-1', topic: '测试课', subject: '物理', gradeBand: '八年级', boundary: '',
    sourceMaterial: [], planning, qualityStatus: 'draft',
  } as unknown as MainlineCourse
  course.generationSession = createGenerationSession(course, 'session-1', '2026-09-11T12:00:00.000Z')
  return course
}

function generatedPage(planPage: LessonPagePlan): GeneratedLessonPage {
  return {
    pageId: planPage.id,
    order: planPage.order,
    purpose: planPage.purpose,
    planRevisionId: 'plan-1',
    sourceRefs: [],
    content: {
      kind: 'explanation',
      title: `概念 ${planPage.order}`,
      coreStatement: `先理解第 ${planPage.order} 个概念。`,
      evidence: [{ text: `这是第 ${planPage.order} 个新信息。` }],
      boundary: '仅用于测试。',
    },
    teacherCompanion: { script: '请观察并说明依据。', notes: [], pace: 'brief' },
  }
}

function memoryPersistence(initial = makeCourse()) {
  let course = structuredClone(initial)
  const persistence: GenerationPagePersistence = {
    async find(id) { return id === course.id ? structuredClone(course) : undefined },
    async save(next) { course = structuredClone(next) },
  }
  return { persistence, current: () => structuredClone(course), replace: (next: MainlineCourse) => { course = structuredClone(next) } }
}

function runner(memory = memoryPersistence(), overrides: Partial<Parameters<typeof createGenerationPageRunner>[0]> = {}) {
  const generate = vi.fn(async ({ planPage }: { planPage: LessonPagePlan; qualityFeedback: readonly string[] }) => generatedPage(planPage))
  const auditFacts = vi.fn(async (_course: MainlineCourse, page: GeneratedLessonPage) => ({ revisionId: `fact:${page.pageId}` }))
  return {
    memory,
    generate,
    auditFacts,
    value: createGenerationPageRunner({ persistence: memory.persistence, generate, auditFacts, ...overrides }),
  }
}

describe('generation page runner', () => {
  it('generates exactly one planned page per run and persists each passed content checkpoint', async () => {
    const test = runner()
    const first = await test.value.runNext('course-1', '2026-09-11T12:01:00.000Z')
    expect(first.done).toBe(false)
    expect(first.session.jobs.map(job => job.status)).toEqual(['content-ready', 'queued'])
    expect(test.memory.current().pageContent?.pages.map(page => page.pageId)).toEqual(['page-1'])

    const second = await test.value.runNext('course-1', '2026-09-11T12:02:00.000Z')
    expect(second.done).toBe(true)
    expect(second.session.status).toBe('rendering')
    expect(test.generate).toHaveBeenCalledTimes(2)
    expect(test.memory.current().pageContent).toMatchObject({
      status: 'review',
      pages: [{ pageId: 'page-1' }, { pageId: 'page-2' }],
    })
  })

  it('keeps passed pages and resumes from the first missing page after a new runner instance', async () => {
    const memory = memoryPersistence()
    await runner(memory).value.runNext('course-1', '2026-09-11T12:01:00.000Z')
    const restarted = runner(memory)
    const result = await restarted.value.runNext('course-1', '2026-09-11T12:02:00.000Z')
    expect(restarted.generate).toHaveBeenCalledOnce()
    expect(restarted.generate.mock.calls[0]?.[0].planPage.id).toBe('page-2')
    expect(result.session.jobs.map(job => job.status)).toEqual(['content-ready', 'content-ready'])
  })

  it('blocks only the failed page and does not create partial page content', async () => {
    const auditFacts = vi.fn(async () => { throw new Error('单页事实核查未通过：结论错误') })
    const test = runner(memoryPersistence(), { auditFacts })
    await expect(test.value.runNext('course-1', '2026-09-11T12:01:00.000Z')).rejects.toThrow(/结论错误/)
    expect(test.memory.current().generationSession?.jobs).toMatchObject([
      { status: 'blocked', diagnostics: [{ kind: 'validation_error' }] },
      { status: 'queued', diagnostics: [] },
    ])
    expect(test.memory.current().pageContent).toBeUndefined()
  })

  it('feeds retained validation diagnostics into a resumed page generation', async () => {
    const memory = memoryPersistence()
    const first = runner(memory, {
      auditFacts: async () => { throw new Error('单页事实核查未通过：迁移材料没有来源。') },
    })
    await expect(first.value.runNext('course-1', '2026-09-11T12:01:00.000Z')).rejects.toThrow()

    const blocked = memory.current()
    blocked.generationSession = resumeBlockedPage(
      blocked.generationSession!,
      'page-1',
      '2026-09-11T12:02:00.000Z',
    )
    memory.replace(blocked)

    const resumed = runner(memory)
    await resumed.value.runNext('course-1', '2026-09-11T12:03:00.000Z')
    expect(resumed.generate.mock.calls[0]?.[0].qualityFeedback).toEqual([
      '单页事实核查未通过：迁移材料没有来源。',
    ])
  })

  it('rejects stale model output when the approved plan changes during generation', async () => {
    const memory = memoryPersistence()
    const generate = vi.fn(async ({ planPage }: { planPage: LessonPagePlan }) => {
      const changed = memory.current()
      changed.planning = { ...changed.planning!, planRevisionId: 'plan-2' }
      memory.replace(changed)
      return generatedPage(planPage)
    })
    const test = runner(memory, { generate })
    await expect(test.value.runNext('course-1', '2026-09-11T12:01:00.000Z'))
      .rejects.toMatchObject({ code: 'SESSION_CONFLICT' })
    expect(memory.current().pageContent).toBeUndefined()
  })

  it('serializes concurrent requests so the second request advances to the next page', async () => {
    const test = runner()
    const results = await Promise.all([
      test.value.runNext('course-1', '2026-09-11T12:01:00.000Z'),
      test.value.runNext('course-1', '2026-09-11T12:02:00.000Z'),
    ])
    expect(results.map(result => result.page?.pageId)).toEqual(['page-1', 'page-2'])
    expect(test.generate).toHaveBeenCalledTimes(2)
  })

  it('does not execute a model again after all page content is ready', async () => {
    const test = runner()
    await test.value.runNext('course-1', '2026-09-11T12:01:00.000Z')
    await test.value.runNext('course-1', '2026-09-11T12:02:00.000Z')
    const final = await test.value.runNext('course-1', '2026-09-11T12:03:00.000Z')
    expect(final.done).toBe(true)
    expect(final.page).toBeUndefined()
    expect(test.generate).toHaveBeenCalledTimes(2)
  })
})
