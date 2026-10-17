import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { createGenerationRenderRunner, GenerationRenderRunError } from '../generation-render-runner.js'
import { completePageContent, createGenerationSession, generationInputHash, startPageGeneration } from '../generation-session.js'
import type { CoursePlanningState, LessonPagePlan } from '../planning/page-contract.js'

const planPage: LessonPagePlan = {
  id: 'page-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-1'], purpose: 'explain',
  audience: 'student', learningAction: '观察并说明。', newInformation: '呈现定义。', sourceRefs: [],
  contentSpec: { kind: 'explanation', focus: '定义', requiredElements: ['定义', '例子'] },
  visualSpec: { required: false, form: 'none', reason: '文字讲解。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '讲清定义。', teachingMove: '追问依据。', pace: 'normal' }, arcStepId: 'arc-1',
}

function renderingCourse(): MainlineCourse {
  const planning: CoursePlanningState = {
    schemaVersion: 'mainline-page-v2', courseId: 'course-1', planRevisionId: 'plan-1', status: 'plan-approved',
    learningContracts: [], arc: { id: 'arc-1', courseId: 'course-1', steps: [] }, pages: [planPage],
  }
  const base = { id: 'course-1', planning, qualityStatus: 'draft' } as unknown as MainlineCourse
  const inputHash = generationInputHash({ pageId: 'page-1' })
  let session = startPageGeneration(createGenerationSession(base, 'session-1'), 'page-1', inputHash, '2026-09-11T12:00:00.000Z')
  session = completePageContent(session, {
    pageId: 'page-1', planRevisionId: 'plan-1', inputHash,
    contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1', createdAt: '2026-09-11T12:01:00.000Z',
  }, '2026-09-11T12:01:00.000Z')
  return {
    ...base,
    generationSession: session,
    pageContent: {
      schemaVersion: 'mainline-page-content-v1', courseId: 'course-1', planRevisionId: 'plan-1',
      contentRevisionId: 'content-all-1', status: 'review',
      pages: [{
        pageId: 'page-1', order: 1, purpose: 'explain', planRevisionId: 'plan-1', sourceRefs: [],
        content: { kind: 'explanation', title: '定义', coreStatement: '这是需要学生理解的完整定义。', evidence: [{ text: '例子能够支持这一定义。' }], boundary: '不要超出本课讨论范围。' },
        teacherCompanion: { script: '讲稿。', notes: [], pace: 'normal' },
      }],
    },
  }
}

function memory(initial = renderingCourse()) {
  let course = structuredClone(initial)
  return {
    find: async (id: string) => id === course.id ? structuredClone(course) : undefined,
    save: async (next: MainlineCourse) => { course = structuredClone(next) },
    current: () => course,
  }
}

const goodMetrics = {
  stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28,
  clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, occupiedAreaRatio: 0.35,
  visualElementCount: 0,
}

describe('generation render runner', () => {
  it('persists version-bound screenshot evidence before promoting the page', async () => {
    const store = memory()
    const runner = createGenerationRenderRunner({
      find: store.find, save: store.save,
      capture: async () => ({ screenshot: Buffer.from('real-png'), metrics: goodMetrics }),
      writeEvidence: async (_courseId, _pageId, evidenceId) => `data/render-evidence/${evidenceId}.png`,
    })
    const result = await runner.runNext('course-1', 'http://127.0.0.1:3000', '2026-09-11T12:02:00.000Z')
    expect(result.done).toBe(true)
    expect(result.session.status).toBe('course-audit')
    expect(store.current().generationSession?.jobs[0]).toMatchObject({
      status: 'passed', checkpoint: { contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1' },
    })
    expect(store.current().pageRenderEvidence?.[0]).toMatchObject({
      contentRevisionId: 'content-1', screenshotSha256: expect.stringMatching(/^[a-f0-9]{64}$/), issues: [],
    })
  })

  it('persists failed evidence but refuses to promote a clipped page', async () => {
    const store = memory()
    const runner = createGenerationRenderRunner({
      find: store.find, save: store.save,
      capture: async () => ({ screenshot: Buffer.from('clipped'), metrics: { ...goodMetrics, clippedElementCount: 1 } }),
      writeEvidence: async () => 'data/render-evidence/failed.png',
    })
    await expect(runner.runNext('course-1', 'http://127.0.0.1:3000'))
      .rejects.toBeInstanceOf(GenerationRenderRunError)
    expect(store.current().generationSession?.jobs[0]?.status).toBe('content-ready')
    expect(store.current().pageRenderEvidence?.[0]?.issues[0]).toMatchObject({ code: 'clipping', severity: 'blocking' })
  })
})
