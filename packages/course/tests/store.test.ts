import { expect, test } from 'vitest'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { GOLDEN_MAINLINE_COURSES } from '../src/mainline/samples.js'
import { createSeason } from '../src/mainline/season.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'

test('courses round-trip through the document port with a monotonic CAS version', async () => {
  let clock = 5_000
  const store = createMainlineCourseStore(createMemoryCourseDocuments({ now: () => clock }))
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  await store.saveMainlineCourse(course)
  expect(JSON.stringify(await store.findMainlineCourse(course.id))).toBe(JSON.stringify(course))
  const first = (await store.findMainlineCourseSnapshot(course.id))!
  expect(first.updatedAt).toBe(5_000)
  expect(await store.saveMainlineCourseIfUnchanged({ ...course, topic: '改过的标题' }, first.updatedAt)).toBe(true)
  expect(await store.saveMainlineCourseIfUnchanged({ ...course, topic: '过期版本的覆盖' }, first.updatedAt)).toBe(false)
  const second = (await store.findMainlineCourseSnapshot(course.id))!
  expect(second.course.topic).toBe('改过的标题')
  expect(second.updatedAt).toBe(5_001)
  clock = 9_000
  await store.saveMainlineCourse(second.course)
  expect((await store.findMainlineCourseSnapshot(course.id))!.updatedAt).toBe(9_000)
})

test('seasons and courses are separate kinds; list is newest first; delete removes', async () => {
  let clock = 1
  const documents = createMemoryCourseDocuments({ now: () => clock++ })
  const store = createMainlineCourseStore(documents)
  const [a, b] = [structuredClone(GOLDEN_MAINLINE_COURSES[0]!), structuredClone(GOLDEN_MAINLINE_COURSES[1]!)]
  await store.saveMainlineCourse(a)
  await store.saveMainlineCourse(b)
  const season = createSeason({ id: 'season-1', title: '数学季', subject: 'math', gradeBand: 'middle-school', seasonTheme: '看见数量关系', createdAt: '2026-10-13T00:00:00.000Z' })
  await store.saveSeason(season)
  expect((await store.listMainlineCourses()).map((item) => item.course.id)).toEqual([b.id, a.id])
  expect((await store.listMainlineCourses())[0]!.createdAt).toBe(2)
  expect(await store.listSeasons()).toEqual([season])
  expect(await store.findMainlineCourse('season-1')).toBeUndefined()
  expect(await store.findSeason(a.id)).toBeUndefined()
  await store.deleteMainlineCourse(a.id)
  expect(await store.findMainlineCourse(a.id)).toBeUndefined()
  expect(documents.size()).toBe(2)
})

test('a CAS save never inserts: missing or deleted courses return false and stay gone', async () => {
  const documents = createMemoryCourseDocuments({ now: () => 7_000 })
  const store = createMainlineCourseStore(documents)
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  expect(await store.saveMainlineCourseIfUnchanged(course, 0)).toBe(false)
  expect(await store.findMainlineCourse(course.id)).toBeUndefined()
  await store.saveMainlineCourse(course)
  const snapshot = (await store.findMainlineCourseSnapshot(course.id))!
  await store.deleteMainlineCourse(course.id)
  expect(await store.saveMainlineCourseIfUnchanged({ ...course, topic: '复活' }, snapshot.updatedAt)).toBe(false)
  expect(await store.findMainlineCourse(course.id)).toBeUndefined()
  expect(documents.size()).toBe(0)
})
