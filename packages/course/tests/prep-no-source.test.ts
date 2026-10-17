// S3（用户裁决 2026-10-17：先降级，后补数据）：k12 知识点数据集没有课标与教材原文。没有任何权威原文的课，
// 整课审查照常通过并在结果里注明"未核对课标与教材"，可以逐页、整课验收并导出；工作台上同样带这条提示。
import { expect, test } from 'vitest'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createCourseGenerationServices } from '../src/services/generation.js'
import { createPrepFacade } from '../src/services/prep-facade.js'
import type { PrepLlmRequest, PrepRuntime } from '../src/services/prep-facade-types.js'
import { fixtureLlmReply, PREP_FIXTURE_KP_IDS, prepFixtureKnowledge } from '../src/testing/prep-fixtures.js'

const GOOD = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 1, occupiedAreaRatio: 0.35 }
const imagesOff = { imagesAvailable: false } as const

test('a course whose knowledge points carry no source evidence is audited, accepted and export-ready, with the unverified sources stated', async () => {
  const knowledge = { ...prepFixtureKnowledge(), knowledgePointSources: async () => [] }
  const documents = createMemoryCourseDocuments()
  const facade = createPrepFacade({ documents, knowledge, newId: () => 'no-source-course' })
  const runtime: PrepRuntime = { sleep: async () => {}, llm: { async completeJson(request: PrepLlmRequest) { return fixtureLlmReply(request) } } }
  const planned = await facade.planCourse({ kpIds: PREP_FIXTURE_KP_IDS })
  expect(planned.ok).toBe(true)
  const courseId = 'no-source-course'
  expect((await facade.updatePlan(courseId, { action: 'approve', updates: [] }, imagesOff)).ok).toBe(true)
  for (let i = 0; i < 40; i += 1) if (!(await facade.generateNextPage(courseId, runtime, imagesOff)).ok) break
  const render = createCourseGenerationServices(createMainlineCourseStore(documents), {
    render: {
      capture: async (_url, pageNumber) => ({ screenshot: Buffer.from([pageNumber]), metrics: GOOD }),
      writeEvidence: async (_c, pageId, evidenceId) => `/api/prep/artifacts/ev_${pageId}_${evidenceId.slice(0, 8)}`,
      pageUrl: (origin, id, pageNumber) => `${origin}/prep/render/?course=${id}&page=${pageNumber}`,
    },
  }).render!
  for (let i = 0; i < 40; i += 1) if ((await render.runNext(courseId, 'http://web.test')).done) break

  const audit = await facade.auditCourse(courseId, runtime)
  expect(audit).toMatchObject({ ok: true, audit: { teachingQuality: 'passed', acceptable: true, unverifiedSources: ['curriculum-standard', 'textbook'] } })
  expect(JSON.stringify(audit)).toContain('未核对课标与教材原文')

  const summary = await facade.readCourse(courseId) as unknown as { ok: true; course: { pages: Array<{ pageId: string }> } }
  for (const page of summary.course.pages) expect((await facade.acceptPage(courseId, page.pageId)).ok).toBe(true)
  expect((await facade.acceptCourse(courseId)).ok).toBe(true)
  expect((await facade.exportReadiness(courseId)).ok).toBe(true)
  const workbench = await facade.workbench(courseId) as unknown as { ok: true; workbench: { teachingAudit: { status: string; unverifiedSources?: string[] } } }
  expect(workbench.workbench.teachingAudit).toMatchObject({ status: 'passed', unverifiedSources: ['curriculum-standard', 'textbook'] })
}, 120_000)
