import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { approveDraftPlan, saveDraftPlan } from '../../../../../lib/mainline/planning/revision-lifecycle.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

const UpdateSchema = z.object({
  pageId: z.string().min(1),
  learningAction: z.string().trim().min(1).max(240),
  newInformation: z.string().trim().min(1).max(360),
})

const RequestSchema = z.object({
  action: z.enum(['save', 'approve']),
  updates: z.array(UpdateSchema).max(120),
})

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  let body: z.infer<typeof RequestSchema>
  try {
    body = RequestSchema.parse(await req.json())
  } catch (error) {
    return NextResponse.json({ error: `课程结构修改格式不正确：${String(error)}` }, { status: 400 })
  }

  try {
    const saved = saveDraftPlan(course, body.updates)
    const next = body.action === 'approve' ? approveDraftPlan(saved) : saved
    await saveMainlineCourse(next)
    return NextResponse.json({
      ok: true,
      courseId,
      planStatus: next.planning?.status,
      plannedPages: next.planning?.pages.length,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
  }
}
