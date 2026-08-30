import { type NextRequest, NextResponse } from 'next/server'
import {
  markCourseSuperseded,
  markPageContentReady,
} from '../../../../../../lib/mainline/planning/revision-lifecycle.js'
import { auditCourseReleaseReadiness } from '../../../../../../lib/mainline/readiness.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  try {
    const ready = markPageContentReady(course)
    const readiness = auditCourseReleaseReadiness(ready)
    if (!readiness.ready) {
      throw new Error(readiness.blockers.slice(0, 3).map(blocker => blocker.message).join('；') || '课程尚未通过投影片检查。')
    }
    await saveMainlineCourse(ready)

    const previousCourseId = ready.revision?.basedOnCourseId
    if (previousCourseId) {
      const previous = await findMainlineCourse(previousCourseId)
      if (previous) await saveMainlineCourse(markCourseSuperseded(previous, ready.id))
    }

    return NextResponse.json({ ok: true, courseId, planStatus: ready.planning?.status })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
  }
}
