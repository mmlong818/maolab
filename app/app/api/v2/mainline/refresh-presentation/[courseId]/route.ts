/**
 * POST /api/v2/mainline/refresh-presentation/[courseId] · 旧课呈现契约翻新
 *
 * 把编译期落库、已随呈现规则演进而过时的版式字段按现行规则归一
 * (当前:contrast/ai-verify 大立绘 → corner-avatar,见 edit/presentation-refresh.ts),
 * 重跑确定性质量闸门并落库。draft 课内容未填,无呈现契约可翻新,拒绝。
 * 配图不在此处重生成——图是 LLM/图 API 步骤,走既有 fill-images?force=1。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { summarizeQuality } from '../../../../../lib/mainline/quality-gates.js'
import { refreshPresentationContract } from '../../../../../lib/mainline/edit/presentation-refresh.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params

  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  if (course.qualityStatus === 'draft') {
    return NextResponse.json({ error: 'draft course has no filled presentation to refresh' }, { status: 400 })
  }

  const { course: refreshed, issues, normalizedSceneIds } = refreshPresentationContract(course)
  await saveMainlineCourse(refreshed)
  return NextResponse.json({
    ok: true,
    courseId,
    normalizedSceneIds,
    qualityStatus: refreshed.qualityStatus,
    summary: summarizeQuality(issues),
  })
}
