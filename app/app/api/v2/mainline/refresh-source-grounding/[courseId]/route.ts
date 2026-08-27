/**
 * POST /api/v2/mainline/refresh-source-grounding/[courseId]
 *
 * 教师主动把存量课程的知识点名称/占位摘录升级为当前教材索引中的可核查定位。
 * 不调用模型，不改教学内容；保存前重跑统一发布判定。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { resolveCurrentCourseGroundings } from '../../../../../lib/mainline/edit/source-grounding-loader.js'
import {
  refreshCourseSourceGroundings,
  sourceMaterialNeedsGroundingRefresh,
} from '../../../../../lib/mainline/edit/source-grounding-refresh.js'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  if (!course.sourceMaterial.some(sourceMaterialNeedsGroundingRefresh)) {
    return NextResponse.json({ error: '当前课程没有需要刷新的教材依据。' }, { status: 409 })
  }

  const grounding = await resolveCurrentCourseGroundings(course)
  const result = refreshCourseSourceGroundings(course, grounding.byKp)
  if (result.refreshedKpIds.length === 0) {
    return NextResponse.json({
      error: '当前知识点索引还没有可核查的来源节点，课程未修改。',
      sourceCoverage: grounding.coverage,
    }, { status: 409 })
  }

  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    refreshedKpIds: result.refreshedKpIds,
    clearedPlaceholderCount: result.clearedPlaceholderKpIds.length,
    sourceCoverage: grounding.coverage,
    qualityStatus: result.course.qualityStatus,
    summary: summarizeQuality(result.issues),
  })
}
