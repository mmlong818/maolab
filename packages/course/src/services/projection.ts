/**
 * PPTX 导出规划（3b，沿用 maolab api/v2/mainline/export 与 2026-08-25 用户裁决：逐页截图型导出，讲稿进备注）。
 * 只导出通过发布判定的课程；呈现页与讲稿取自库里的课程（与 maolab 相同），截图供数用"上课时卡司"版本
 * （maolab 课堂页在判定通过时套用并写回库，这里只在内存里套用，不写回）。
 */
import { withClassTimeMainlineCastAssets } from '../mainline/cast-asset-runtime.js'
import type { MainlineCourse } from '../mainline/domain.js'
import { lessonPresentationPages, presentationScene } from '../mainline/presentation/presentation-pages.js'
import { auditCourseReleaseReadiness, courseReleaseReason } from '../mainline/readiness.js'

export interface ProjectionExportPlan {
  title: string
  filename: string
  pageCount: number
  /** 第 i 项是第 i+1 页的讲稿（已 trim，可能为空） */
  notes: string[]
  /** 交给渲染页的课程：上课时卡司版本 */
  renderCourse: MainlineCourse
}

export class ProjectionExportNotReadyError extends Error {
  readonly code = 'NOT_READY'
  readonly reason: string | undefined
  readonly blockers: Array<{ source: string; targetId: string; message: string }>
  constructor(reason: string | undefined, blockers: Array<{ source: string; targetId: string; message: string }>) {
    super(reason ?? '课程未通过发布判定，不能导出。')
    this.name = 'ProjectionExportNotReadyError'
    this.reason = reason
    this.blockers = blockers
  }
}

/** 去掉文件名中 Windows 与浏览器不允许的字符（maolab export 路由原文） */
export function sanitizeExportFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'course'
}

export function planProjectionExport(course: MainlineCourse, teachingTime: Date | number = Date.now()): ProjectionExportPlan {
  const readiness = auditCourseReleaseReadiness(course)
  if (!readiness.ready) {
    throw new ProjectionExportNotReadyError(
      courseReleaseReason(readiness),
      readiness.blockers.map((blocker) => ({ source: blocker.source, targetId: blocker.targetId, message: blocker.message })),
    )
  }
  const pages = lessonPresentationPages(course)
  return {
    title: course.topic,
    filename: `${sanitizeExportFilename(course.topic)}.pptx`,
    pageCount: pages.length,
    notes: pages.map((page) => presentationScene(page).teacherScript.trim()),
    renderCourse: withClassTimeMainlineCastAssets(course, teachingTime),
  }
}
