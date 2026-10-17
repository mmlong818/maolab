/** 计划编辑与确认（3a，搬自 maolab app/app/api/v2/mainline/plan/[courseId]/route.ts）。确认时挂上新的逐页生成会话。 */
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { attachGenerationSession, createGenerationSession } from '../mainline/generation-session.js'
import { editDraftPlanStructure } from '../mainline/planning/plan-structure-editor.js'
import { approveDraftPlan, saveDraftPlan } from '../mainline/planning/revision-lifecycle.js'
import type { MainlineCourseStore } from '../mainline/store.js'
import { CourseServiceError } from './errors.js'

const UpdateSchema = z.object({
  pageId: z.string().min(1),
  learningAction: z.string().trim().min(1).max(240),
  newInformation: z.string().trim().min(1).max(360),
  visualReason: z.string().trim().max(360).optional(),
  teachingMove: z.string().trim().min(1).max(360).optional(),
})

export const CoursePlanCommandSchema = z.discriminatedUnion('action', [
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

export interface CoursePlanResult {
  ok: true
  courseId: string
  planStatus?: string
  plannedPages?: number
  generationSessionId?: string
}

export async function updateCoursePlan(
  courseId: string,
  input: unknown,
  deps: { store: MainlineCourseStore; newId?: () => string },
): Promise<CoursePlanResult> {
  const snapshot = await deps.store.findMainlineCourseSnapshot(courseId)
  if (!snapshot) throw new CourseServiceError('COURSE_NOT_FOUND', 'course not found')
  const course = snapshot.course

  const parsed = CoursePlanCommandSchema.safeParse(input)
  if (!parsed.success) throw new CourseServiceError('INVALID_INPUT', `课程结构修改格式不正确：${String(parsed.error)}`)
  const body = parsed.data

  let next
  try {
    const saved = body.action === 'structure'
      ? editDraftPlanStructure(course, body.operation)
      : saveDraftPlan(course, body.updates)
    next = body.action === 'approve' ? approveDraftPlan(saved) : saved
    if (body.action === 'approve') {
      next = attachGenerationSession(next, createGenerationSession(next, (deps.newId ?? randomUUID)()))
    }
  } catch (error) {
    throw new CourseServiceError('PLAN_CONFLICT', error instanceof Error ? error.message : String(error))
  }
  // 3a 终审：按读到的版本 CAS，读后被其他写者（生成、渲染、工具）改过就拒绝，不覆盖
  if (!(await deps.store.saveMainlineCourseIfUnchanged(next, snapshot.updatedAt))) {
    throw new CourseServiceError('PLAN_CONFLICT', '课程在读取后已被其他操作更新，请重新读取后再修改计划。')
  }
  return {
    ok: true,
    courseId,
    ...(next.planning ? { planStatus: next.planning.status, plannedPages: next.planning.pages.length } : {}),
    ...(next.generationSession ? { generationSessionId: next.generationSession.id } : {}),
  }
}
