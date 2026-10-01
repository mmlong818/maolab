import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { approveDraftPlan, saveDraftPlan } from '../../../../../lib/mainline/planning/revision-lifecycle.js'
import { editDraftPlanStructure } from '../../../../../lib/mainline/planning/plan-structure-editor.js'
import { attachGenerationSession, createGenerationSession } from '../../../../../lib/mainline/generation-session.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

const UpdateSchema = z.object({
  pageId: z.string().min(1),
  learningAction: z.string().trim().min(1).max(240),
  newInformation: z.string().trim().min(1).max(360),
  visualReason: z.string().trim().max(360).optional(),
  teachingMove: z.string().trim().min(1).max(360).optional(),
})

const RequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.enum(['save', 'approve']), updates: z.array(UpdateSchema).max(120) }),
  z.object({
    action: z.literal('structure'),
    operation: z.discriminatedUnion('type', [
      z.object({ type: z.literal('move'), pageId: z.string().min(1), direction: z.enum(['up', 'down']) }),
      z.object({ type: z.literal('delete'), pageId: z.string().min(1) }),
      z.object({
        type: z.literal('insert-explanation'), afterPageId: z.string().min(1),
        learningAction: z.string().trim().min(1).max(240), newInformation: z.string().trim().min(1).max(360),
      }),
      z.object({
        type: z.literal('split-explanation'), pageId: z.string().min(1),
        firstLearningAction: z.string().trim().min(1).max(240), firstNewInformation: z.string().trim().min(1).max(360),
        secondLearningAction: z.string().trim().min(1).max(240), secondNewInformation: z.string().trim().min(1).max(360),
      }),
    ]),
  }),
])

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
    const saved = body.action === 'structure'
      ? editDraftPlanStructure(course, body.operation)
      : saveDraftPlan(course, body.updates)
    let next = body.action === 'approve' ? approveDraftPlan(saved) : saved
    if (body.action === 'approve') {
      next = attachGenerationSession(next, createGenerationSession(next, crypto.randomUUID()))
    }
    await saveMainlineCourse(next)
    return NextResponse.json({
      ok: true,
      courseId,
      planStatus: next.planning?.status,
      plannedPages: next.planning?.pages.length,
      generationSessionId: next.generationSession?.id,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
  }
}
