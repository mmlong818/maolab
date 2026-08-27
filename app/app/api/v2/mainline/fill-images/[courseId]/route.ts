/**
 * POST /api/v2/mainline/fill-images/[courseId]?force=1
 *
 * 对一门 mainline 课程跑 fill-images(为 visual-observation / contrast / recap
 * scene 生成配图),完成后落库。同步返回,时长 30-90 秒(3 张并行)。
 * `?force=1` 强制重生所有目标 scene 的图(默认跳过已 imageUrl 的 scene)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'
import { fillImages } from '../../../../../lib/mainline/generation/fill-images.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const force = req.nextUrl.searchParams.get('force') === '1'

  try {
    const { course: filled, filledSceneIds, failedSceneIds } = await fillImages(course, { force })
    await saveMainlineCourse(filled)
    return NextResponse.json({
      ok: true,
      courseId,
      filledSceneIds,
      failedSceneIds,
    })
  } catch (err) {
    return NextResponse.json({ error: `fill-images failed: ${String(err)}` }, { status: 500 })
  }
}
