import { z } from 'zod'
import { NextResponse } from 'next/server'
import { markCourseSuperseded } from '../../../../../../lib/mainline/planning/revision-lifecycle.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../lib/mainline/store.js'
import { TeacherAcceptanceError, teacherAcceptanceService } from '../../../../../../lib/mainline/teacher-acceptance.js'

export const runtime = 'nodejs'

const CommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reopen'), expectedUpdatedAt: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal('accept-page'), pageId: z.string().trim().min(1).max(160), expectedUpdatedAt: z.string().trim().min(1).max(80) }).strict(),
  z.object({ action: z.literal('publish'), expectedUpdatedAt: z.string().trim().min(1).max(80) }).strict(),
])

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  try {
    const command = CommandSchema.parse(await req.json())
    if (command.action === 'reopen') {
      const course = await teacherAcceptanceService.reopen(courseId, command.expectedUpdatedAt)
      return NextResponse.json({ ok: true, courseId, planStatus: course.planning?.status, session: course.generationSession, teacherAcceptance: course.teacherAcceptance })
    }
    if (command.action === 'accept-page') {
      const course = await teacherAcceptanceService.acceptPage(courseId, command.pageId, command.expectedUpdatedAt)
      return NextResponse.json({ ok: true, teacherAcceptance: course.teacherAcceptance })
    }

    const ready = await teacherAcceptanceService.publish(courseId, command.expectedUpdatedAt)
    const previousCourseId = ready.revision?.basedOnCourseId
    if (previousCourseId) {
      const previous = await findMainlineCourse(previousCourseId)
      if (previous) await saveMainlineCourse(markCourseSuperseded(previous, ready.id))
    }
    return NextResponse.json({ ok: true, courseId, planStatus: ready.planning?.status, signature: ready.teacherAcceptance?.finalSignature })
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: '教师验收命令格式不正确。', issues: error.issues }, { status: 400 })
    if (error instanceof TeacherAcceptanceError) {
      const status = error.code === 'COURSE_NOT_FOUND' || error.code === 'PAGE_NOT_FOUND' ? 404 : 409
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
