import { type NextRequest, NextResponse } from 'next/server'
import { factAuditPageContentCourse } from '../../../../../../lib/mainline/planning/page-content-fact-audit.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  try {
    const reviewed = await factAuditPageContentCourse(course)
    await saveMainlineCourse(reviewed.course)
    return NextResponse.json({
      ok: true,
      courseId,
      contentRevisionId: reviewed.record.contentRevisionId,
      auditedPageCount: reviewed.record.auditedSceneCount,
      blockingCount: reviewed.record.fatalCount,
      warningCount: reviewed.record.issues.filter(issue => issue.severity === 'warning').length,
      unverifiedCount: reviewed.record.unverifiedSceneIds?.length ?? 0,
      issues: reviewed.record.issues,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
  }
}
