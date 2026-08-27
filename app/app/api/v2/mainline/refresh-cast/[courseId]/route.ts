/**
 * POST /api/v2/mainline/refresh-cast/[courseId] · 刷新存量课程角色
 *
 * 不调用模型，不改教学内容。按课程当前学段与学科重建老师、同学、声线和必要的
 * 场景角色引用，然后重跑统一发布就绪判定。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { refreshCourseCast, refreshableCastIssues } from '../../../../../lib/mainline/edit/cast-refresh.js'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  if (course.qualityStatus === 'draft') {
    return NextResponse.json({ error: '请先完成课程内容填充，再刷新课程角色。' }, { status: 400 })
  }

  const before = refreshableCastIssues(course)
  if (before.length === 0) {
    return NextResponse.json({ error: '当前课程没有需要刷新处理的角色阻断。' }, { status: 409 })
  }

  const result = refreshCourseCast(course)
  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    matched: result.matched,
    resolvedBlockingCount: Math.max(0, before.length - refreshableCastIssues(result.course).length),
    remappedSceneIds: result.remappedSceneIds,
    replacedCastIds: result.replacedCastIds,
    qualityStatus: result.course.qualityStatus,
    summary: summarizeQuality(result.issues),
  })
}
