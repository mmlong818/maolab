import { expect, test } from 'vitest'
import { forkCourseForReplanning } from '../src/mainline/planning/revision-lifecycle.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { createPrepFacade } from '../src/services/prep-facade.js'
import { buildReadyFixtureCourse } from '../src/testing/ready-course.js'
import { prepFixtureKnowledge, PREP_FIXTURE_KP_IDS } from '../src/testing/prep-fixtures.js'

test('publicationDraft refuses drafts, not-ready and edited-after-acceptance courses; never writes the course', async () => {
  const documents = createMemoryCourseDocuments()
  const facade = createPrepFacade({ documents, knowledge: prepFixtureKnowledge(), newId: () => 'draft-only' })
  const planned = await facade.planCourse({ kpIds: PREP_FIXTURE_KP_IDS })
  expect(planned.ok).toBe(true)
  expect(await facade.publicationDraft('draft-only')).toMatchObject({ ok: false, reason: 'not-ready', details: { blockers: expect.any(Array) } })
  expect(await facade.publicationDraft('no-such-course')).toMatchObject({ ok: false, reason: 'not-found' })
  const { courseId } = await buildReadyFixtureCourse(documents)
  const store = createMainlineCourseStore(documents)
  const before = await store.findMainlineCourseSnapshot(courseId)
  const ok = await facade.publicationDraft(courseId)
  expect(ok).toMatchObject({ ok: true, draft: { sourceCourseId: courseId, sourceUpdatedAt: before!.updatedAt, kpIds: [...PREP_FIXTURE_KP_IDS] } })
  expect((await store.findMainlineCourseSnapshot(courseId))!.updatedAt).toBe(before!.updatedAt)
  // 整课验收之后改了一页正文（模拟修页后还没重新验收）：不能发布
  const course = before!.course
  await store.saveMainlineCourse({ ...course, pageContent: { ...course.pageContent!, contentRevisionId: `${course.pageContent!.contentRevisionId}-x` } })
  expect(await facade.publicationDraft(courseId)).toMatchObject({ ok: false, reason: 'not-ready' })
})

test('the draft snapshot is plain JSON (PrepJson) with no process fields', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const out = await facade.publicationDraft(courseId)
  if (!out.ok) throw new Error(out.message)
  expect(JSON.parse(JSON.stringify(out.draft.snapshot))).toEqual(out.draft.snapshot)
  expect(out.draft.snapshot).not.toHaveProperty('generationSession')
  expect(out.draft.snapshot).not.toHaveProperty('teacherAcceptance')
})

test('another owner sees not-found for a ready course', async () => {
  const mine = createMemoryCourseDocuments()
  const { courseId } = await buildReadyFixtureCourse(mine)
  const theirs = createPrepFacade({ documents: createMemoryCourseDocuments(), knowledge: prepFixtureKnowledge() })
  expect(await theirs.publicationDraft(courseId)).toMatchObject({ ok: false, reason: 'not-found' })
})

test('knowledge-point ids that the knowledge base cannot find give no-knowledge-point', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId } = await buildReadyFixtureCourse(documents)
  const empty = createPrepFacade({ documents, knowledge: { knowledgePoints: async () => [], knowledgePointSources: async () => [] } })
  const out = await empty.publicationDraft(courseId)
  expect(out).toMatchObject({ ok: false, reason: 'no-knowledge-point', details: { kpIds: [...PREP_FIXTURE_KP_IDS] } })
})

test('final M4: a newer course in the same family makes the older one not-ready even when the superseded mark is missing; other families do not', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const store = createMainlineCourseStore(documents)
  const course = (await store.findMainlineCourse(courseId))!
  // 另一族的课（revisionNo 更大）不影响
  await store.saveMainlineCourse({ ...course, id: 'other-family', revision: { familyId: 'other-family', revisionNo: 5 } })
  expect(await facade.publicationDraft(courseId)).toMatchObject({ ok: true })
  // 同族的修订版：旧课没有 supersededByCourseId（模拟验收时没能标记被替代），仍然不能发布
  await store.saveMainlineCourse(forkCourseForReplanning(course, 'newer-revision'))
  expect((await store.findMainlineCourse(courseId))!.revision?.supersededByCourseId).toBeUndefined()
  const out = await facade.publicationDraft(courseId)
  expect(out).toMatchObject({ ok: false, reason: 'not-ready' })
  expect(!out.ok && out.message).toContain('newer-revision')
})
