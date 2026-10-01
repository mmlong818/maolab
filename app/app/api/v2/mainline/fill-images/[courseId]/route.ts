/**
 * POST /api/v2/mainline/fill-images/[courseId]?force=1
 *
 * 对一门 mainline 课程跑 fill-images(为 visual-observation / contrast / recap
 * scene 生成配图),完成后落库。同步返回,时长 30-90 秒(3 张并行)。
 * `?force=1` 强制重生所有目标 scene 的图(默认跳过已 imageUrl 的 scene)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { findMainlineCourseSnapshot, saveMainlineCourseIfUnchanged } from '../../../../../lib/mainline/store.js'
import { fillImages } from '../../../../../lib/mainline/generation/fill-images.js'
import { applyGeneratedPageImageRevision, retainCurrentPageFactAudit } from '../../../../../lib/mainline/page-image-revision.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const snapshot = await findMainlineCourseSnapshot(courseId)
  if (!snapshot) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  const { course, updatedAt } = snapshot

  const force = req.nextUrl.searchParams.get('force') === '1'

  try {
    const { course: filled, filledSceneIds, failedSceneIds, changedPageIds } = await fillImages(course, { force })
    let revised = filled
    if (course.planning && course.pageContent && filled.pageContent) {
      revised = course
      for (const pageId of changedPageIds) {
        const page = filled.pageContent.pages.find(candidate => candidate.pageId === pageId)
        if (!page?.imageUrl) continue
        revised = await applyGeneratedPageImageRevision(revised, pageId, {
          imageUrl: page.imageUrl,
          ...(page.imagePrompt ? { imagePrompt: page.imagePrompt } : {}),
          ...(page.imageAspect ? { imageAspect: page.imageAspect } : {}),
        }, retainCurrentPageFactAudit)
      }
    }
    if (!await saveMainlineCourseIfUnchanged(revised, updatedAt)) {
      return NextResponse.json({ error: 'course changed while images were being generated; no changes were saved', code: 'COURSE_CONFLICT' }, { status: 409 })
    }
    return NextResponse.json({
      ok: true,
      courseId,
      filledSceneIds,
      failedSceneIds,
      changedPageIds,
      reviewRequired: changedPageIds.length > 0,
    })
  } catch (err) {
    return NextResponse.json({ error: `fill-images failed: ${String(err)}` }, { status: 500 })
  }
}
