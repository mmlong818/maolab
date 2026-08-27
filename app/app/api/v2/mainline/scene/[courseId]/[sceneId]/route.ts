/**
 * PATCH /api/v2/mainline/scene/[courseId]/[sceneId] · v5 M1 单页改讲稿
 * DELETE /api/v2/mainline/scene/[courseId]/[sceneId] · v5 M1 删页
 *
 * 修复"看得见、改不动"断点:教师可以直接改一页的内容,不必整课 fill?force=1
 * 重填。业务逻辑在 lib/mainline/edit/{scene-patch,scene-delete}.ts 里的纯函数,
 * 本文件只做请求校验、落库和响应整形。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { summarizeQuality } from '../../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../lib/mainline/store.js'
import { applyScenePatch, type ScenePatch } from '../../../../../../lib/mainline/edit/scene-patch.js'
import { deleteSceneFromCourse } from '../../../../../../lib/mainline/edit/scene-delete.js'
import { fetchKpMetadata } from '../../../../../../lib/mainline/kp-metadata.js'

export const runtime = 'nodejs'

// 与 domain.ts EDITABLE_SCENE_FIELDS 一一对应;结构字段(sceneType/kpId/characterLayer 等)
// 不在此白名单里,教师不能通过本端点改动课程结构。
const ScenePatchSchema = z.object({
  contentSlots: z.record(z.string().min(1)).optional(),
  visualFocus: z.string().min(1).optional(),
  narrationAnchor: z.string().min(1).optional(),
  boardText: z.array(z.string().min(1)).min(1).optional(),
  teacherScript: z.string().min(1).optional(),
  studentAction: z.string().min(1).optional(),
  evidenceOnScreen: z.array(z.string().min(1)).min(1).optional(),
  misconceptionSources: z.array(z.string().min(1)).min(1).optional(),
  voiceCue: z.object({
    castId: z.string().min(1).optional(),
    emotion: z.string().min(1),
    pace: z.enum(['slow', 'medium', 'fast']),
    pauseRule: z.string().min(1),
  }).optional(),
  executor: z.enum(['teacher', 'ai', 'co']).optional(),
}).refine(patch => Object.keys(patch).length > 0, { message: 'empty patch: at least one editable field required' })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ courseId: string; sceneId: string }> }) {
  const { courseId, sceneId } = await ctx.params

  let patch: ScenePatch
  try { patch = ScenePatchSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: `Invalid request body: ${String(err)}` }, { status: 400 }) }

  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  let allowedMisconceptions: readonly string[] | undefined
  if (patch.misconceptionSources !== undefined) {
    const scene = course.scenes.find(candidate => candidate.id === sceneId)
    if (!scene) return NextResponse.json({ error: `scene not found: ${sceneId}` }, { status: 404 })
    if (!scene.kpId) return NextResponse.json({ error: '本页没有关联知识点，无法绑定教材误区。' }, { status: 400 })
    try {
      const metadata = await fetchKpMetadata([scene.kpId])
      allowedMisconceptions = metadata.get(scene.kpId)?.misconceptions ?? []
    } catch {
      return NextResponse.json(
        { error: '暂时无法读取教材误区元数据，已拒绝保存以避免写入无依据内容。' },
        { status: 503 },
      )
    }
  }

  const result = applyScenePatch(
    course,
    sceneId,
    patch,
    allowedMisconceptions !== undefined ? { allowedMisconceptions } : {},
  )
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.code === 'not_found' ? 404 : 400 })
  }

  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    sceneId,
    qualityStatus: result.course.qualityStatus,
    factAudit: result.course.factAudit,
    summary: summarizeQuality(result.issues),
    issues: result.issues,
  })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ courseId: string; sceneId: string }> }) {
  const { courseId, sceneId } = await ctx.params

  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const result = deleteSceneFromCourse(course, sceneId)
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.code === 'not_found' ? 404 : 400 })

  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    sceneId,
    qualityStatus: result.course.qualityStatus,
    summary: summarizeQuality(result.issues),
    issues: result.issues,
  })
}
