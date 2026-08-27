/** POST 单页事实核查：保留教师手改内容，只更新该页核查结论。 */
import { type NextRequest, NextResponse } from 'next/server'
import { auditSceneFacts } from '../../../../../../../lib/mainline/edit/scene-fact-audit.js'
import { summarizeQuality } from '../../../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ courseId: string; sceneId: string }> },
) {
  const { courseId, sceneId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  try {
    const result = await auditSceneFacts(course, sceneId)
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: 404 })

    await saveMainlineCourse(result.course)
    return NextResponse.json({
      ok: true,
      courseId,
      sceneId,
      qualityStatus: result.course.qualityStatus,
      summary: summarizeQuality(result.issues),
      issues: result.issues,
      factAudit: result.course.factAudit,
    })
  } catch (error) {
    return NextResponse.json({ error: `fact audit failed: ${String(error)}` }, { status: 500 })
  }
}
