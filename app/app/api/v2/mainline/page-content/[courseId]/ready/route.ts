import { type NextRequest, NextResponse } from 'next/server'
import {
  markCourseSuperseded,
  markPageContentReady,
} from '../../../../../../lib/mainline/planning/revision-lifecycle.js'
import { auditCourseReleaseReadiness } from '../../../../../../lib/mainline/readiness.js'
import {
  findMainlineCourse,
  findMainlineCourseSnapshot,
  saveMainlineCourse,
  saveMainlineCourseIfUnchanged,
} from '../../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const snapshot = await findMainlineCourseSnapshot(courseId)
  if (!snapshot) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  const { course, updatedAt } = snapshot

  try {
    const ready = markPageContentReady(course)
    const readiness = auditCourseReleaseReadiness(ready)
    if (!readiness.ready) {
      throw new Error(readiness.blockers.slice(0, 3).map(blocker => blocker.message).join('；') || '课程尚未通过投影片检查。')
    }
    if (!await saveMainlineCourseIfUnchanged(ready, updatedAt)) {
      throw new Error('发布期间课程已经变化，请刷新后重新检查。')
    }

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
