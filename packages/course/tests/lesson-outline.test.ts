import { expect, test } from 'vitest'
import { lessonPresentationPages } from '../src/mainline/presentation/presentation-pages.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { LESSON_OUTLINE_MAX_CHARS, lessonOutlineOf, lessonOutlineText } from '../src/services/lesson-outline.js'
import { buildReadyFixtureCourse } from '../src/testing/ready-course.js'

test('the outline of a published snapshot has one entry per page the child sees, no teacher script, and fits the limit', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const draft = await facade.packageDraft(courseId)
  if (!draft.ok) throw new Error(draft.message)
  const outline = lessonOutlineOf(draft.draft.snapshot)
  const course = (await createMainlineCourseStore(documents).findMainlineCourse(courseId))!
  expect(outline.pageCount).toBe(lessonPresentationPages(course).length)
  expect(outline.pages.every((p) => p.title.length > 0 && p.title.length <= 120)).toBe(true)
  expect(outline.text.length).toBeLessThanOrEqual(LESSON_OUTLINE_MAX_CHARS)
  expect(outline.text).toContain(`共 ${outline.pageCount} 页`)
  for (const page of course.pageContent?.pages ?? []) {
    const script = page.teacherCompanion?.script?.trim()
    if (script && script.length > 20) expect(outline.text).not.toContain(script)
  }
  // 实测为准：记录有多少页取到了学习动作与检查问题（写进报告），这里只要求至少一页有学习动作
  expect(outline.pages.some((p) => p.action)).toBe(true)
})

test('non-course input gives an empty outline instead of throwing', () => {
  for (const input of [null, {}, { topic: 42 }, 'x', { scenes: 'bad' }]) {
    const outline = lessonOutlineOf(input)
    expect(outline.pageCount).toBe(0)
    expect(outline.text).toContain('共 0 页')
  }
})

test('the text form truncates at whole pages and says how many were left out', () => {
  const pages = Array.from({ length: 200 }, (_, i) => ({ number: i + 1, title: `第${i + 1}页标题`.padEnd(60, '标'), action: '写下一个预测和理由'.padEnd(60, '写') }))
  const text = lessonOutlineText('很长的课', pages)
  expect(text.length).toBeLessThanOrEqual(LESSON_OUTLINE_MAX_CHARS)
  expect(text).toMatch(/后面还有 \d+ 页/)
  expect(text.split('\n')[1]).toMatch(/^1\. /)
})

test('measured: where actions and questions come from, and blanking textbook image urls keeps the page count', async () => {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const draft = await facade.packageDraft(courseId)
  if (!draft.ok) throw new Error(draft.message)
  const snapshot = draft.draft.snapshot
  const outline = lessonOutlineOf(snapshot)
  const course = snapshot as unknown as { pageContent?: { pages: Array<{ content: { kind: string }, teacherCompanion?: { notes?: string[] } }> } }
  // 没有教师数据：备课过程字段与讲稿备注都不出现
  for (const page of course.pageContent?.pages ?? []) for (const note of page.teacherCompanion?.notes ?? []) if (note.trim().length > 10) expect(outline.text).not.toContain(note.trim())
  expect(outline.text).not.toMatch(/generationSession|teacherAcceptance|pageRenderEvidence/)
  // 清空教材图片地址后页数不变
  const blanked = structuredClone(snapshot) as unknown as { sourceMaterial?: Array<{ candidateResources?: Array<{ assetUrl: string }> }>, pageContent?: { pages: Array<{ imageUrl?: string }> } }
  for (const s of blanked.sourceMaterial ?? []) for (const r of s.candidateResources ?? []) r.assetUrl = ''
  for (const p of blanked.pageContent?.pages ?? []) if (p.imageUrl) p.imageUrl = ''
  expect(lessonOutlineOf(blanked).pageCount).toBe(outline.pageCount)
})
