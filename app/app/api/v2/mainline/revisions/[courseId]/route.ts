import { randomUUID } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { forkCourseForReplanning } from '../../../../../lib/mainline/planning/revision-lifecycle.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  try {
    const next = forkCourseForReplanning(course, randomUUID())
    await saveMainlineCourse(next)
    return NextResponse.json({
      ok: true,
      courseId: next.id,
      basedOnCourseId: course.id,
      revisionNo: next.revision?.revisionNo,
      planStatus: next.planning?.status,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
  }
}
