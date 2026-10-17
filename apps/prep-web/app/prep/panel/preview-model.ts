// 预览的页目录分组（终审修复，T15 走查第 2 条）。迁入的 StructureTree 按 course.learningFragments 的顺序、按"幕"筛页：
// 页优先课程里几张页共用同一幕（sourceSceneId），同一片段的页也不总是连续——实测 05 页被归进 02、03 一组，04 单独一组；
// 组名缺省全叫"课级片段"。迁入文件不改，备课预览改用自己的页目录：按展示页顺序，连续属于同一片段的页成一组，
// 组名 = 知识点标题（没有知识点的课级片段叫"开场与收束"，不属于任何片段的叫"其他页"）+ 页码范围；页号与预览、胶片条一致。
import { lessonPresentationPages, presentationScene } from '@/lib/mainline/presentation/presentation-pages'
import { courseDisplayScene, sceneDisplayTitle } from '@/lib/mainline/presentation/course-display-title'
import type { MainlineCourse } from '@/lib/mainline/domain'

export const COURSE_LEVEL_LABEL = '开场与收束'
export const UNGROUPED_LABEL = '其他页'

export interface PageGroupPage { id: string; number: number; title: string; stageLabel?: string }
export interface PageGroup { key: string; label: string; pages: PageGroupPage[] }

export function pageGroups(course: MainlineCourse): PageGroup[] {
  const pages = lessonPresentationPages(course)
  const titleOfFragment = (fragmentId: string | null): string => {
    if (!fragmentId) return UNGROUPED_LABEL
    const fragment = course.learningFragments.find((f) => f.id === fragmentId)
    return (fragment?.kpId ? course.sourceMaterial.find((s) => s.kpId === fragment.kpId)?.title.trim() : '') || COURSE_LEVEL_LABEL
  }
  const runs: Array<{ fragmentId: string | null; pages: PageGroupPage[] }> = []
  pages.forEach((page, index) => {
    const fragmentId = course.learningFragments.find((f) => f.sceneIds.includes(page.sourceSceneId))?.id ?? null
    const scene = presentationScene(page)
    let title = ''
    try { title = sceneDisplayTitle(course, courseDisplayScene(course, scene)) } catch { title = '' }
    title = title || scene.visualFocus || `第 ${index + 1} 页`
    const entry: PageGroupPage = { id: page.id, number: index + 1, title, ...(page.stageLabel && page.stageLabel !== title ? { stageLabel: page.stageLabel } : {}) }
    const run = runs.at(-1)
    if (run && run.fragmentId === fragmentId) run.pages.push(entry)
    else runs.push({ fragmentId, pages: [entry] })
  })
  return runs.map((run, n) => {
    const first = run.pages[0]!.number
    const last = run.pages.at(-1)!.number
    return { key: `${run.fragmentId ?? 'none'}#${n}`, label: `${titleOfFragment(run.fragmentId)} · ${first === last ? `第 ${first} 页` : `第 ${first}–${last} 页`}`, pages: run.pages }
  })
}
