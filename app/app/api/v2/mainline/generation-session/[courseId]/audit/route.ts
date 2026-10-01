import { NextResponse } from 'next/server'
import { GenerationCourseAuditError, generationCourseAuditor } from '../../../../../../lib/mainline/generation-course-audit.js'
import { findMainlineCourse } from '../../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  try {
    const result = await generationCourseAuditor.run(courseId)
    return NextResponse.json({ ok: true, session: result.session, audit: result.audit, teachingQualityAudit: result.course.teachingQualityAudit })
  } catch (error) {
    if (error instanceof GenerationCourseAuditError) {
      const status = error.code === 'COURSE_NOT_FOUND' || error.code === 'SESSION_NOT_FOUND' ? 404 : error.code === 'AUDIT_BLOCKED' ? 422 : 409
      const course = error.code === 'AUDIT_BLOCKED' ? await findMainlineCourse(courseId) : undefined
      return NextResponse.json({ error: error.message, code: error.code, teachingQualityAudit: course?.teachingQualityAudit }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
