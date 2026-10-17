// 4a 测试用：用 3c 的两知识点夹具与夹具模型通道，把一门课走到"整课验收通过、可发布"。只给测试与本机脚本用。
// 4b：completeFixtureCourse 把一门已建好、处在规划阶段的课（含 reviseCourse 建出的修订版）走到整课验收
import { randomUUID } from 'node:crypto'
import { createMainlineCourseStore } from '../mainline/store.js'
import type { SourceAssetRef } from '../mainline/domain.js'
import type { CourseDocumentStore } from '../ports.js'
import { createCourseGenerationServices } from '../services/generation.js'
import { createPrepFacade } from '../services/prep-facade.js'
import type { PrepFacade, PrepLlmRequest, PrepRuntime } from '../services/prep-facade-types.js'
import { fixtureLlmReply, PREP_FIXTURE_KP_IDS, prepFixtureKnowledge } from './prep-fixtures.js'

const GOOD_METRICS = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 1, occupiedAreaRatio: 0.35 }
const imagesOff = { imagesAvailable: false } as const

/** candidateResources：建课后、确认计划前挂到每条 sourceMaterial 上（模拟教材接地；复审 D9 的教材接地课程发布测试用） */
export async function buildReadyFixtureCourse(documents: CourseDocumentStore, options: { newId?: () => string; candidateResources?: SourceAssetRef[] } = {}): Promise<{ courseId: string; facade: PrepFacade }> {
  const knowledge = prepFixtureKnowledge()
  const facade = createPrepFacade({ documents, knowledge, newId: options.newId ?? (() => `ready-${randomUUID()}`) })
  const fail = (step: string, r: { ok: boolean; message?: string }): never => { throw new Error(`夹具课程在"${step}"失败：${r.message ?? ''}`) }
  const planned = await facade.planCourse({ kpIds: PREP_FIXTURE_KP_IDS })
  if (!planned.ok) fail('建课', planned)
  const courseId = (planned as unknown as { course: { courseId: string } }).course.courseId
  if (options.candidateResources) {
    const store = createMainlineCourseStore(documents)
    const course = (await store.findMainlineCourse(courseId))!
    await store.saveMainlineCourse({ ...course, sourceMaterial: course.sourceMaterial.map((source) => ({ ...source, candidateResources: options.candidateResources! })) })
  }
  await completeFixtureCourse(documents, courseId)
  return { courseId, facade }
}

export async function completeFixtureCourse(documents: CourseDocumentStore, courseId: string): Promise<void> {
  const facade = createPrepFacade({ documents, knowledge: prepFixtureKnowledge(), newId: () => `ready-${randomUUID()}` })
  const runtime: PrepRuntime = { sleep: async () => {}, llm: { async completeJson(request: PrepLlmRequest) { return fixtureLlmReply(request) } } }
  const fail = (step: string, r: { ok: boolean; message?: string }): never => { throw new Error(`夹具课程在"${step}"失败：${r.message ?? ''}`) }
  const approved = await facade.updatePlan(courseId, { action: 'approve', updates: [] }, imagesOff)
  if (!approved.ok) fail('确认计划', approved)
  for (let i = 0; i < 40; i += 1) {
    const r = await facade.generateNextPage(courseId, runtime, imagesOff)
    if (!r.ok) { if (r.reason === 'session-not-ready') break; fail('逐页生成', r) }
  }
  const render = createCourseGenerationServices(createMainlineCourseStore(documents), {
    render: {
      capture: async (_url, pageNumber) => ({ screenshot: Buffer.from([pageNumber]), metrics: GOOD_METRICS }),
      writeEvidence: async (_courseId, pageId, evidenceId) => `/api/prep/artifacts/ev_${pageId}_${evidenceId.slice(0, 8)}`,
      pageUrl: (origin, id, pageNumber) => `${origin}/prep/render/?course=${id}&page=${pageNumber}`,
    },
  }).render!
  for (let i = 0; i < 40; i += 1) if ((await render.runNext(courseId, 'http://web.test')).done) break
  const audit = await facade.auditCourse(courseId, runtime)
  if (!audit.ok) fail('整课审查', audit)
  const summary = await facade.readCourse(courseId)
  if (!summary.ok) fail('读课程', summary)
  for (const page of (summary as unknown as { course: { pages: Array<{ pageId: string }> } }).course.pages) {
    const accepted = await facade.acceptPage(courseId, page.pageId)
    if (!accepted.ok) fail('逐页验收', accepted)
  }
  const done = await facade.acceptCourse(courseId)
  if (!done.ok) fail('整课验收', done)
}
