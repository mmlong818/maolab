/**
 * POST /api/v2/mainline/refresh-misconceptions/[courseId]
 *
 * 教师主动把已绑定教材误区的课堂错误说法校准回可追溯内容。
 * 没有绑定来源的页保持不变，必须回到备课页逐页确认。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { refreshCourseMisconceptions } from '../../../../../lib/mainline/edit/misconception-refresh.js'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const result = refreshCourseMisconceptions(course)
  if (result.refreshedSceneIds.length === 0) {
    return NextResponse.json({
      error: result.teacherReviewSceneIds.length > 0
        ? '剩余误区页缺少教材绑定，需要教师逐页确认。'
        : '当前课程没有需要校准的误区说法。',
      teacherReviewSceneIds: result.teacherReviewSceneIds,
    }, { status: 409 })
  }

  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    refreshedSceneIds: result.refreshedSceneIds,
    teacherReviewSceneIds: result.teacherReviewSceneIds,
    qualityStatus: result.course.qualityStatus,
    summary: summarizeQuality(result.issues),
  })
}
