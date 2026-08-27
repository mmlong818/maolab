/**
 * POST /api/v2/mainline/tryout/[courseId]
 *
 * AI 试学:LLM 扮演目标学段学生把整课上一遍,返回卡壳点报告(票4,DeepTutor 借鉴)。
 * 只读课程、不落库、不改变 qualityStatus;报告是备课排查线索,不是评分。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { findMainlineCourse } from '../../../../../lib/mainline/store.js'
import { tryoutCourse } from '../../../../../lib/mainline/tryout.js'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  try {
    const report = await tryoutCourse(course)
    return NextResponse.json({ ok: true, courseId, report })
  } catch (err) {
    return NextResponse.json({ error: `tryout failed: ${String(err)}` }, { status: 500 })
  }
}
