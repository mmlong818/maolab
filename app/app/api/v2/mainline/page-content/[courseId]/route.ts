import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  fillPlannedPages,
  PageContentGenerationQualityError,
  regeneratePlannedPage,
} from '../../../../../lib/mainline/planning/page-content-generator.js'
import { factAuditPageContentCourse } from '../../../../../lib/mainline/planning/page-content-fact-audit.js'
import {
  markPageGenerationStarted,
  restoreApprovedPlanAfterGenerationFailure,
} from '../../../../../lib/mainline/planning/revision-lifecycle.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'
export const maxDuration = 300

const ReviewFeedbackSchema = z.array(z.string().trim().min(2).max(800)).max(8)

const RegeneratePageBodySchema = z.union([
  z.object({
    pageId: z.string().trim().min(1),
    reviewFeedback: ReviewFeedbackSchema.optional(),
  }).strict(),
  z.object({
    pageIds: z.array(z.string().trim().min(1)).min(1).max(24),
    reviewFeedbackByPage: z.record(z.string().trim().min(1), ReviewFeedbackSchema).optional(),
  }).strict(),
])

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  let generating
  try {
    generating = markPageGenerationStarted(course)
    await saveMainlineCourse(generating)
    const result = await fillPlannedPages(course)
    const reviewed = await factAuditPageContentCourse(result.course)
    await saveMainlineCourse(reviewed.course)
    return NextResponse.json({
      ok: true,
      courseId,
      planStatus: reviewed.course.planning?.status,
      contentRevisionId: result.pageContent.contentRevisionId,
      pages: result.pageContent.pages.length,
      warningCount: result.audit.filter(issue => issue.severity === 'warning').length,
      factBlockingCount: reviewed.record.fatalCount,
      factUnverifiedCount: reviewed.record.unverifiedSceneIds?.length ?? 0,
    })
  } catch (error) {
    if (generating) await saveMainlineCourse(restoreApprovedPlanAfterGenerationFailure(generating))
    if (error instanceof PageContentGenerationQualityError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        pageId: error.pageId,
        pageOrder: error.pageOrder,
        reasons: error.reasons,
        retryable: true,
      }, { status: 422 })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : `生成投影片失败：${String(error)}`,
    }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  try {
    const body = RegeneratePageBodySchema.parse(await req.json())
    const pageIds = 'pageIds' in body ? [...new Set(body.pageIds)] : [body.pageId]
    let currentCourse = course.planning?.status === 'ready' && course.qualityStatus === 'blocked'
      ? { ...course, planning: { ...course.planning, status: 'review' as const }, qualityStatus: 'draft' as const }
      : course
    let lastResult
    for (const pageId of pageIds) {
      const feedback = 'pageIds' in body
        ? body.reviewFeedbackByPage?.[pageId]
        : body.reviewFeedback
      lastResult = await regeneratePlannedPage(currentCourse, pageId, {
        ...(feedback ? { qualityFeedback: feedback } : {}),
      })
      currentCourse = lastResult.course
    }
    if (!lastResult) throw new Error('没有需要重生成的页面。')
    const reviewed = await factAuditPageContentCourse(currentCourse)
    await saveMainlineCourse(reviewed.course)
    return NextResponse.json({
      ok: true,
      courseId,
      pageIds,
      contentRevisionId: lastResult.pageContent.contentRevisionId,
      warningCount: lastResult.audit.filter(issue => issue.severity === 'warning').length,
      factBlockingCount: reviewed.record.fatalCount,
      factUnverifiedCount: reviewed.record.unverifiedSceneIds?.length ?? 0,
    })
  } catch (error) {
    if (error instanceof PageContentGenerationQualityError) {
      return NextResponse.json({
        error: error.message,
        code: error.code,
        pageId: error.pageId,
        pageOrder: error.pageOrder,
        reasons: error.reasons,
        retryable: true,
      }, { status: 422 })
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'pageId 或 pageIds 必须提供一个' }, { status: 400 })
    }
    return NextResponse.json({
      error: error instanceof Error ? error.message : String(error),
    }, { status: 409 })
  }
}
