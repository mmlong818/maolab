import { expect, test } from 'vitest'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { createPrepFacade } from '../src/services/prep-facade.js'
import { buildReadyFixtureCourse, completeFixtureCourse } from '../src/testing/ready-course.js'
import { prepFixtureKnowledge, PREP_FIXTURE_KP_IDS } from '../src/testing/prep-fixtures.js'
import type { CourseDocumentStore } from '../src/ports.js'

test('reviseCourse forks an accepted course into a new planning revision of the same family, leaves the original untouched and is idempotent', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const store = createMainlineCourseStore(documents)
  const before = (await store.findMainlineCourseSnapshot(courseId))!
  // 实测为准：整课验收后 planning.status 是 ready（reviseCourse 的前置条件按它写）
  expect(before.course.planning?.status).toBe('ready')
  const out = await facade.reviseCourse(courseId)
  if (!out.ok) throw new Error(out.message)
  const revision = out.revision as { courseId: string; familyId: string; revisionNo: number; basedOnCourseId: string; existing: boolean }
  expect(revision).toMatchObject({ familyId: before.course.revision?.familyId ?? courseId, revisionNo: 2, basedOnCourseId: courseId, existing: false })
  const forked = (await store.findMainlineCourse(revision.courseId))!
  expect(forked.planning?.status).toBe('planning')
  for (const field of ['pageContent', 'generationSession', 'teacherAcceptance', 'teachingQualityAudit', 'pageRenderEvidence']) expect(forked).not.toHaveProperty(field)
  expect((await store.findMainlineCourseSnapshot(courseId))!.updatedAt).toBe(before.updatedAt)
  // 再点一次：族里已有更新的课，不再建
  expect(await facade.reviseCourse(courseId)).toMatchObject({ ok: true, revision: { courseId: revision.courseId, existing: true } })
  // 在修订版自己身上点：它还没验收
  expect(await facade.reviseCourse(revision.courseId)).toMatchObject({ ok: false, reason: 'session-not-ready' })
})

test('a draft course and someone else\'s course cannot be revised', async () => {
  const documents = createMemoryCourseDocuments()
  const facade = createPrepFacade({ documents, knowledge: prepFixtureKnowledge(), newId: () => 'draft-revise' })
  expect((await facade.planCourse({ kpIds: PREP_FIXTURE_KP_IDS })).ok).toBe(true)
  expect(await facade.reviseCourse('draft-revise')).toMatchObject({ ok: false, reason: 'session-not-ready' })
  const theirs = createPrepFacade({ documents: createMemoryCourseDocuments(), knowledge: prepFixtureKnowledge() })
  expect(await theirs.reviseCourse('draft-revise')).toMatchObject({ ok: false, reason: 'not-found' })
})

test('after the revision is accepted it is publishable with a new signature and the original is not-ready', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const first = await facade.publicationDraft(courseId)
  if (!first.ok) throw new Error(first.message)
  const out = await facade.reviseCourse(courseId)
  if (!out.ok) throw new Error(out.message)
  const revisionId = (out.revision as { courseId: string }).courseId
  // 实测为准：夹具模型通道能把修订版再走完一遍
  await completeFixtureCourse(documents, revisionId)
  const second = await facade.publicationDraft(revisionId)
  if (!second.ok) throw new Error(second.message)
  expect(second.draft.familyId).toBe(first.draft.familyId)
  expect(second.draft.signature).not.toBe(first.draft.signature)
  expect(await facade.publicationDraft(courseId)).toMatchObject({ ok: false, reason: 'not-ready' })
})

test('M4: two courses of one family with the same revisionNo created in the same millisecond have exactly one latest (course id breaks the tie)', async () => {
  const documents = createMemoryCourseDocuments({ now: () => 1 })
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const store = createMainlineCourseStore(documents)
  const course = (await store.findMainlineCourse(courseId))!
  const family = course.revision?.familyId ?? courseId
  // id 比原课小的同族同号副本：原课仍是最新
  await store.saveMainlineCourse({ ...course, id: '0-tie-smaller', revision: { familyId: family, revisionNo: course.revision?.revisionNo ?? 1 } })
  expect(await facade.publicationDraft(courseId)).toMatchObject({ ok: true })
  // id 比原课大的：原课不再是最新，message 点名它
  await store.saveMainlineCourse({ ...course, id: 'zzzz-tie-larger', revision: { familyId: family, revisionNo: course.revision?.revisionNo ?? 1 } })
  expect(await facade.publicationDraft(courseId)).toMatchObject({ ok: false, reason: 'not-ready', message: expect.stringContaining('zzzz-tie-larger') })
  expect(await facade.reviseCourse(courseId)).toMatchObject({ ok: true, revision: { courseId: 'zzzz-tie-larger', existing: true } })
})

/** 同族（含原课）的课程 id */
async function familyIds(documents: CourseDocumentStore, courseId: string): Promise<string[]> {
  const listed = await createMainlineCourseStore(documents).listMainlineCourses()
  const family = listed.find((row) => row.course.id === courseId)!.course.revision?.familyId ?? courseId
  return listed.filter((row) => (row.course.revision?.familyId ?? row.course.id) === family).map((row) => row.course.id).sort()
}

test('revising the same course twice at once through one facade yields one revision', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const [a, b] = await Promise.all([facade.reviseCourse(courseId), facade.reviseCourse(courseId)])
  if (!a.ok || !b.ok) throw new Error('revise failed')
  const ra = a.revision as { courseId: string; existing: boolean }
  const rb = b.revision as { courseId: string; existing: boolean }
  expect(rb.courseId).toBe(ra.courseId)
  expect([ra.existing, rb.existing].sort()).toEqual([false, true])
  expect(await familyIds(documents, courseId)).toEqual([courseId, ra.courseId].sort())
})

test('two facades (separate processes) revising the same course at once leave exactly one live revision, both callers get it', async () => {
  const base = createMemoryCourseDocuments()
  const { courseId } = await buildReadyFixtureCourse(base)
  // 两边都先读完"族里没有更新的课"才各自写：强制出跨进程竞态（不加闸门时两边会先后跑完，测不到）
  let waiting: Array<() => void> = []
  let gated = 0
  let forkSaves = 0
  const documents: CourseDocumentStore = {
    ...base,
    async list(kind) {
      if (kind === 'course' && gated < 2) {
        gated += 1
        await new Promise<void>((resolve) => { waiting.push(resolve); if (waiting.length === 2) { waiting.forEach((r) => r()); waiting = [] } })
      }
      return base.list(kind)
    },
    async save(kind, doc) {
      if (kind === 'course' && doc.id !== courseId) forkSaves += 1
      return base.save(kind, doc)
    },
  }
  const knowledge = prepFixtureKnowledge()
  const one = createPrepFacade({ documents, knowledge, newId: () => 'rev-a' })
  const two = createPrepFacade({ documents, knowledge, newId: () => 'rev-b' })
  const [a, b] = await Promise.all([one.reviseCourse(courseId), two.reviseCourse(courseId)])
  if (!a.ok || !b.ok) throw new Error('revise failed')
  expect(forkSaves).toBe(2)
  const ra = a.revision as { courseId: string; existing: boolean }
  const rb = b.revision as { courseId: string; existing: boolean }
  expect(rb.courseId).toBe(ra.courseId)
  expect([ra.existing, rb.existing].sort()).toEqual([false, true])
  expect(await familyIds(base, courseId)).toEqual([courseId, ra.courseId].sort())
  // 留下的就是族里最新的：能被点名为"更新的版本"，原课不能再发布
  expect(await one.publicationDraft(courseId)).toMatchObject({ ok: false, reason: 'not-ready', message: expect.stringContaining(ra.courseId) })
})
