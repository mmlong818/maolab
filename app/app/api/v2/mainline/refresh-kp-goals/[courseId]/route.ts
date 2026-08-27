/**
 * POST /api/v2/mainline/refresh-kp-goals/[courseId]
 *
 * 教师显式触发存量课程的逐知识点目标重建。只使用当前索引中的可检核目标，
 * 保留原总目标和全部页面内容；任何歧义或并发修改都会拒绝保存。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { loadCurrentKpGoalMetadata } from '../../../../../lib/mainline/edit/kp-goal-loader.js'
import {
  courseNeedsKpGoalRefresh,
  KpGoalRefreshError,
  refreshCourseKpGoals,
} from '../../../../../lib/mainline/edit/kp-goal-refresh.js'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  if (!courseNeedsKpGoalRefresh(course)) {
    return NextResponse.json({ error: '当前课程没有可安全重建的旧版整课目标。' }, { status: 409 })
  }

  try {
    const metadataByKp = loadCurrentKpGoalMetadata(course)
    const result = refreshCourseKpGoals(course, metadataByKp)

    const latestCourse = await findMainlineCourse(courseId)
    if (!latestCourse || JSON.stringify(latestCourse) !== JSON.stringify(course)) {
      return NextResponse.json({
        error: '重建期间课程已被修改，本次未保存。请刷新备课页后重试。',
        code: 'COURSE_CHANGED_DURING_REFRESH',
        retryable: true,
      }, { status: 409 })
    }

    await saveMainlineCourse(result.course)
    return NextResponse.json({
      ok: true,
      courseId,
      createdGoalCount: result.createdGoals.length,
      reboundFragmentIds: result.reboundFragmentIds,
      qualityStatus: result.course.qualityStatus,
      summary: summarizeQuality(result.issues),
    })
  } catch (error) {
    if (error instanceof KpGoalRefreshError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        reasons: error.reasons,
      }, { status: 409 })
    }
    return NextResponse.json({ error: `kp goal refresh failed: ${String(error)}` }, { status: 500 })
  }
}
