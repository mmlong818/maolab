// 4b：上课会话的课程大纲（导师开课简报用）。从发布快照（剥离过的课程 JSON）按孩子看到的页序取：页号、页标题、学生要做的事、检查问题。
// 不含讲稿（teacherScript）与任何备课过程数据。每项不超过 FIELD_MAX 字，全文不超过 LESSON_OUTLINE_MAX_CHARS 字（超出按整页截断，注明省略的页数）。
// 这是另一个用户（老师）写的文字：中和与"不是指令"的框定由简报（packages/bundle 的 session-brief）负责，这里只取材、裁长度。
// 快照不是课程形状时返回空大纲，不抛错——上课照常，只是简报没有大纲段。
import type { LessonScene, MainlineCourse } from '../mainline/domain.js'
import { courseDisplayScene, sceneDisplayTitle } from '../mainline/presentation/course-display-title.js'
import { pageContentFromScene } from '../mainline/presentation/page-content-presentation.js'
import { lessonPresentationPages, presentationScene } from '../mainline/presentation/presentation-pages.js'

export const LESSON_OUTLINE_MAX_CHARS = 4000
const FIELD_MAX = 120
/** 旧形状课程检查问题可能所在的内容槽（当前课程走 pageContentFromScene，控制器裁决 T3） */
const QUESTION_SLOTS = ['question', 'prompt', 'task'] as const

export interface LessonOutlinePage { number: number; title: string; action?: string; question?: string }
export interface LessonOutline { title: string; pageCount: number; pages: LessonOutlinePage[]; text: string }

const one = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  const s = value.replace(/\s+/g, ' ').trim()
  if (!s) return undefined
  return s.length > FIELD_MAX ? `${s.slice(0, FIELD_MAX - 1)}…` : s
}

export function lessonOutlineOf(snapshot: unknown): LessonOutline {
  const title = one((snapshot as { topic?: unknown } | null | undefined)?.topic) ?? '这节课'
  let pages: LessonOutlinePage[] = []
  try {
    const course = snapshot as MainlineCourse
    pages = lessonPresentationPages(course).map((page, index) => {
      const scene: LessonScene = presentationScene(page)
      let pageTitle: string | undefined
      try { pageTitle = one(sceneDisplayTitle(course, courseDisplayScene(course, scene))) } catch { pageTitle = undefined }
      const slots = (scene.contentSlots ?? {}) as Record<string, unknown>
      // 当前课程的检查题在 page content 数据里（kind 为 question/practice/transfer 取 prompt，observation 取 prompt）；旧形状课程才在内容槽里
      const content = pageContentFromScene(scene) as { kind?: string; title?: string; prompt?: unknown } | undefined
      const contentQuestion = content && ['question', 'practice', 'transfer', 'observation'].includes(content.kind ?? '') ? one(content.prompt) : undefined
      const question = contentQuestion ?? QUESTION_SLOTS.map((key) => one(slots[key])).find((v): v is string => Boolean(v))
      const action = one(scene.studentAction)
      return { number: index + 1, title: pageTitle ?? one(content?.title) ?? one(scene.visualFocus) ?? `第 ${index + 1} 页`, ...(action ? { action } : {}), ...(question ? { question } : {}) }
    })
  } catch {
    pages = []
  }
  return { title, pageCount: pages.length, pages, text: lessonOutlineText(title, pages) }
}

export function lessonOutlineText(title: string, pages: readonly LessonOutlinePage[]): string {
  const head = `课程：${title}（共 ${pages.length} 页）`
  const lines = [head]
  let used = head.length
  for (let i = 0; i < pages.length; i += 1) {
    const p = pages[i]!
    const line = [`${p.number}. ${p.title}`, p.action ? `学生要做：${p.action}` : '', p.question ? `检查问题：${p.question}` : ''].filter(Boolean).join('；')
    const tail = `……（后面还有 ${pages.length - i} 页，按课程页面继续）`
    if (used + 1 + line.length + 1 + tail.length > LESSON_OUTLINE_MAX_CHARS) { lines.push(tail); break }
    lines.push(line)
    used += 1 + line.length
  }
  return lines.join('\n')
}
