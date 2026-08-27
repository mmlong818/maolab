/**
 * POST /api/v2/mainline/refresh-runtime-contract/[courseId]
 *
 * 教师主动把存量课程中过时的课堂交互说明同步为当前真实页面能力。该操作不调用
 * 模型，也不改板书、讲稿、任务、配图或事实核查；保存前会重跑统一发布就绪判定。
 */
import { type NextRequest, NextResponse } from 'next/server'
import {
  refreshCourseRuntimeContracts,
  refreshableRuntimeContractIssues,
} from '../../../../../lib/mainline/edit/runtime-contract-refresh.js'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  if (course.qualityStatus === 'draft') {
    return NextResponse.json({ error: '请先完成课程内容填充，再同步课堂交互。' }, { status: 400 })
  }

  const before = refreshableRuntimeContractIssues(course)
  if (before.length === 0) {
    return NextResponse.json({ error: '当前课程没有需要同步的课堂交互说明。' }, { status: 409 })
  }

  const result = refreshCourseRuntimeContracts(course)
  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    resolvedWarningCount: Math.max(0, before.length - refreshableRuntimeContractIssues(result.course).length),
    refreshedSceneIds: result.refreshedSceneIds,
    qualityStatus: result.course.qualityStatus,
    summary: summarizeQuality(result.issues),
  })
}
