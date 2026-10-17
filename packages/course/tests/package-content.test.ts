import { expect, test } from 'vitest'
import { lessonPresentationPages } from '../src/mainline/presentation/presentation-pages.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { lessonOutlineOf } from '../src/services/lesson-outline.js'
import { PACKAGE_PAGE_TEXT_MAX, packageContentOf } from '../src/services/package-content.js'
import { buildReadyFixtureCourse } from '../src/testing/ready-course.js'

async function readySnapshot() {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const draft = await facade.packageDraft(courseId)
  if (!draft.ok) throw new Error(draft.message)
  const course = (await createMainlineCourseStore(documents).findMainlineCourse(courseId))!
  return { snapshot: draft.draft.snapshot, course }
}

test('one package page per page the child sees, titled and ordered like the class outline', async () => {
  const { snapshot, course } = await readySnapshot()
  const content = packageContentOf(snapshot)
  const outline = lessonOutlineOf(snapshot)
  expect(content.pages).toHaveLength(lessonPresentationPages(course).length)
  expect(content.pages.map((p) => p.title)).toEqual(outline.pages.map((p) => p.title))
  expect(content.pages.map((p) => p.action)).toEqual(outline.pages.map((p) => p.action))
  expect(content.pages.map((p) => p.question)).toEqual(outline.pages.map((p) => p.question))
  expect(content.outline).toBe(outline.text)
  expect(content.outline.startsWith('课程：')).toBe(true)
})

test('page text is what the child sees: never the teacher script, and within the package limit', async () => {
  const { snapshot, course } = await readySnapshot()
  const content = packageContentOf(snapshot)
  expect(content.pages.some((p) => p.text.length > 0)).toBe(true)
  const all = content.pages.map((p) => p.text).join('\n')
  for (const page of course.pageContent?.pages ?? []) {
    const script = page.teacherCompanion?.script?.trim()
    if (script && script.length > 20) expect(all).not.toContain(script)
    for (const note of page.teacherCompanion?.notes ?? []) if (note.trim().length > 10) expect(all).not.toContain(note.trim())
  }
  expect(content.pages.every((p) => p.text.length <= PACKAGE_PAGE_TEXT_MAX)).toBe(true)
})

test('fields absent on a page are left out rather than empty', async () => {
  const { snapshot } = await readySnapshot()
  for (const page of packageContentOf(snapshot).pages) {
    if ('action' in page) expect(page.action).toBeTruthy()
    if ('question' in page) expect(page.question).toBeTruthy()
  }
})
