import { expect, test } from 'vitest'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { createPrepFacade } from '../src/services/prep-facade.js'
import { PREP_FIXTURE_KP_IDS, PREP_FIXTURE_TOPIC, prepFixtureKnowledge } from '../src/testing/prep-fixtures.js'

let seq = 0
const newId = () => `prep-${++seq}`
// 一份内存仓储 = 一个 owner（与 PgCourseDocuments.forOwner 同语义）；跨 owner 的 PG 证明在 harness 的 Task 9
function owner() {
  const documents = createMemoryCourseDocuments()
  return { documents, store: createMainlineCourseStore(documents), prep: createPrepFacade({ documents, knowledge: prepFixtureKnowledge(), newId }) }
}
async function planned(prep: ReturnType<typeof owner>['prep']): Promise<string> {
  const result = await prep.planCourse({ kpIds: [...PREP_FIXTURE_KP_IDS] })
  if (!result.ok) throw new Error(`建课失败：${result.message}`)
  return (result.course as { courseId: string }).courseId
}

test('plan_course builds the two-point fixture course and reports the pages that need images', async () => {
  const { prep } = owner()
  const result = await prep.planCourse({ kpIds: [...PREP_FIXTURE_KP_IDS] })
  expect(result.ok).toBe(true)
  const course = (result as unknown as { course: { topic: string; subject: string; gradeBand: string; imagePages: string[]; pages: unknown[]; sourceCoverage: { authoritativeExcerptKps: number } } }).course
  expect(course).toMatchObject({ topic: PREP_FIXTURE_TOPIC, subject: 'chinese', gradeBand: 'middle-school', sourceCoverage: { authoritativeExcerptKps: 2 } })
  expect(course.pages.length).toBeGreaterThan(3)
  // 实测为准：语文概念课夹具不应有需要教学图像的页（否则端到端会被 D3 挡住，见 Step 4）
  expect(course.imagePages).toEqual([])
})

test('bad input and unknown knowledge points come back as failures, never as exceptions', async () => {
  const { prep } = owner()
  expect(await prep.planCourse({ kpIds: [] })).toMatchObject({ ok: false, reason: 'invalid-input' })
  expect(await prep.planCourse({ kpIds: ['kp-missing'] })).toMatchObject({ ok: false, reason: 'unknown-kp', details: { missing: ['kp-missing'] } })
})

test('an owner only sees its own courses; another owner gets not-found for the same id', async () => {
  const a = owner()
  const b = owner()
  const id = await planned(a.prep)
  const listed = await a.prep.listCourses()
  expect(listed).toMatchObject({ ok: true, courses: [{ courseId: id, topic: PREP_FIXTURE_TOPIC }] })
  expect(await b.prep.listCourses()).toEqual({ ok: true, courses: [] })
  const notFound = { ok: false, reason: 'not-found', message: '课程不存在。' }
  expect(await b.prep.readCourse(id)).toEqual(notFound)
  expect(await b.prep.brief(id)).toEqual(notFound)
  expect(await b.prep.updatePlan(id, { action: 'approve', updates: [] }, { imagesAvailable: true })).toEqual(notFound)
  const summary = await a.prep.readCourse(id)
  const firstPage = ((summary as unknown as { course: { pages: Array<{ pageId: string }> } }).course.pages[0])!.pageId
  expect(await a.prep.readCourse(id, firstPage)).toMatchObject({ ok: true, course: { courseId: id, page: { plan: { id: firstPage } } } })
  expect(await a.prep.readCourse(id, 'no-such-page')).toMatchObject({ ok: false, reason: 'not-found' })
  expect(await a.prep.brief(id)).toMatchObject({ ok: true })
})

test('approve attaches a generation session; with images unavailable a plan needing images is refused with guidance', async () => {
  const { prep, store } = owner()
  const id = await planned(prep)
  // 让第 2 页需要教学图像（模拟真实知识点编出图像页）
  const course = (await store.findMainlineCourse(id))!
  const target = course.planning!.pages[1]!
  await store.saveMainlineCourse({
    ...course,
    planning: { ...course.planning!, pages: course.planning!.pages.map((page) => page.id === target.id ? { ...page, visualSpec: { ...page.visualSpec, required: true, form: 'instructional-image' } } : page) },
  })
  const refused = await prep.updatePlan(id, { action: 'approve', updates: [] }, { imagesAvailable: false })
  expect(refused).toMatchObject({ ok: false, reason: 'images-unavailable', details: { pageIds: [target.id] } })
  expect((refused as { message: string }).message).toContain('insert-explanation')
  // 按提示改计划：在原位置插入讲解页、删除图像页，再确认（实测为准：若 delete 触发计划结构规则，见 Step 4）
  expect(await prep.updatePlan(id, { action: 'structure', operation: { type: 'insert-explanation', afterPageId: target.id, learningAction: '说出叠词在诗句里的作用。', newInformation: '叠词让动作反复出现，节奏更鲜明。' } }, { imagesAvailable: false })).toMatchObject({ ok: true })
  expect(await prep.updatePlan(id, { action: 'structure', operation: { type: 'delete', pageId: target.id } }, { imagesAvailable: false })).toMatchObject({ ok: true })
  const approved = await prep.updatePlan(id, { action: 'approve', updates: [] }, { imagesAvailable: false })
  expect(approved).toMatchObject({ ok: true, plan: { courseId: id, planStatus: 'plan-approved' } })
  expect((approved as { plan: { generationSessionId?: string } }).plan.generationSessionId).toBeTruthy()
})
