/**
 * POST /api/v2/mainline/refresh-learning-activities/[courseId]
 *
 * 教师显式触发的存量学习活动深化。不调用模型；只迁移未被教师手改的目标页，
 * 并在保存前重跑统一发布判定与并发检查。
 */
import { type NextRequest, NextResponse } from 'next/server'
import {
  LearningActivityRefreshIncompleteError,
  learningActivityRepairPlan,
  refreshCourseLearningActivities,
} from '../../../../../lib/mainline/edit/learning-activity-refresh.js'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  if (course.qualityStatus === 'draft') {
    return NextResponse.json({ error: '请先完成课程内容填充，再深化学习活动。' }, { status: 400 })
  }

  const plan = learningActivityRepairPlan(course)
  if (plan.total === 0) {
    return NextResponse.json({
      error: plan.teacherEditedSceneIds.length > 0
        ? '需要深化的页面都已由教师手工修改，请逐页确认后再保存。'
        : '当前课程没有需要深化的学习活动。',
      teacherEditedSceneIds: plan.teacherEditedSceneIds,
    }, { status: 409 })
  }

  try {
    const result = refreshCourseLearningActivities(course)
    const latestCourse = await findMainlineCourse(courseId)
    if (!latestCourse || JSON.stringify(latestCourse) !== JSON.stringify(course)) {
      return NextResponse.json({
        error: '深化期间课程已被修改，整批未保存。请刷新备课页后重试。',
        code: 'COURSE_CHANGED_DURING_ACTIVITY_REFRESH',
        retryable: true,
      }, { status: 409 })
    }

    await saveMainlineCourse(result.course)
    return NextResponse.json({
      ok: true,
      courseId,
      refreshedSceneIds: result.refreshedSceneIds,
      teacherEditedSceneIds: plan.teacherEditedSceneIds,
      qualityStatus: result.course.qualityStatus,
      summary: summarizeQuality(result.issues),
    })
  } catch (error) {
    if (error instanceof LearningActivityRefreshIncompleteError) {
      return NextResponse.json({
        error: '仍有学习活动未通过检查，整批未保存。',
        code: error.code,
        targetIds: error.sceneIds,
      }, { status: 422 })
    }
    return NextResponse.json({ error: `learning activity refresh failed: ${String(error)}` }, { status: 500 })
  }
}
