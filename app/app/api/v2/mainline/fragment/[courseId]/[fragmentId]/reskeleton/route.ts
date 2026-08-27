/**
 * POST /api/v2/mainline/fragment/[courseId]/[fragmentId]/reskeleton · v5 M1 换骨架
 *
 * 按新的 knowledgeType 对一个知识点片段重新展开幕序列(lib/mainline/edit/
 * fragment-reskeleton.ts)。这是一次不烧 LLM 的同步结构操作(与 compile-lesson
 * 同类):新幕是空槽 draft,课程 qualityStatus 回 draft。
 *
 * 取舍:本端点不自动触发 fill(理由见 fragment-reskeleton.ts 头注)——响应里
 * 用 newSceneIds + nextStep 提示前端引导教师对新幕逐一调用单页 regen。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../../lib/mainline/store.js'
import { reskeletonFragment } from '../../../../../../../lib/mainline/edit/fragment-reskeleton.js'

export const runtime = 'nodejs'

const KNOWLEDGE_TYPES = ['factual', 'conceptual', 'procedural', 'metacognitive'] as const

const RequestSchema = z.object({
  knowledgeType: z.enum(KNOWLEDGE_TYPES),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string; fragmentId: string }> }) {
  const { courseId, fragmentId } = await ctx.params

  let body: z.infer<typeof RequestSchema>
  try { body = RequestSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: `Invalid request body: ${String(err)}` }, { status: 400 }) }

  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const result = reskeletonFragment(course, fragmentId, body.knowledgeType)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.code === 'not_found' ? 404 : 400 })

  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    fragmentId,
    knowledgeType: body.knowledgeType,
    qualityStatus: result.course.qualityStatus,
    newSceneIds: result.newSceneIds,
    nextStep: '新幕是空槽草稿,尚未填内容——请对 newSceneIds 逐一调用 POST /api/v2/mainline/scene/[courseId]/[sceneId]/regen 让 AI 填槽。',
  })
}
