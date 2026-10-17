// S4：课程包里每页的文字与上课大纲（拆分 spec 4.1）。从包草稿的快照按孩子看到的页序取：
// 页标题、学习动作、检查问题与大纲同源（lessonOutlineOf），页文字是这一页上看得到的全部文字（visiblePageText），不含讲稿与教师备注。
// 页面图不在这里：由 render worker 按 PPTX 导出同一套截图生成。
import type { MainlineCourse } from '../mainline/domain.js'
import { visiblePageText } from '../mainline/planning/page-content-audit.js'
import { pageContentFromScene } from '../mainline/presentation/page-content-presentation.js'
import { lessonPresentationPages, presentationScene } from '../mainline/presentation/presentation-pages.js'
import { lessonOutlineOf } from './lesson-outline.js'

/** 与 @maolab-core/course-package 的 LIMITS.pageText 相同 */
export const PACKAGE_PAGE_TEXT_MAX = 4000

export interface PackagePageContent { title: string; text: string; action?: string; question?: string }
export interface PackageContent { pages: PackagePageContent[]; outline: string }

const clip = (s: string): string => (s.length > PACKAGE_PAGE_TEXT_MAX ? `${s.slice(0, PACKAGE_PAGE_TEXT_MAX - 1)}…` : s)

export function packageContentOf(snapshot: unknown): PackageContent {
  const outline = lessonOutlineOf(snapshot)
  const pages = lessonPresentationPages(snapshot as MainlineCourse).map((page, index): PackagePageContent => {
    const content = pageContentFromScene(presentationScene(page))
    const entry = outline.pages[index]
    return {
      title: entry?.title ?? `第 ${index + 1} 页`,
      text: clip(content ? visiblePageText(content).trim() : ''),
      ...(entry?.action ? { action: entry.action } : {}),
      ...(entry?.question ? { question: entry.question } : {}),
    }
  })
  return { pages, outline: outline.text }
}
