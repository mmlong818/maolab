/**
 * PATCH /api/v2/mainline/style/[courseId] · 模板替换(2026-07-22)
 *
 * 教师在备课工作台手动指定课程风格包(覆盖 stylePackFor 的哈希分流),
 * body: { stylePackId: string | null }——null 恢复自动分配。
 * id 必须能被 resolveStylePackById 解析(三档任一),否则 400,不落坏数据。
 * 纯呈现层字段:不动内容、不重跑事实核查;配图 DNA 随新皮生效,若需图与
 * 新模板一致,换皮后再跑 fill-images?force=1。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { resolveStylePackById } from '../../../../../lib/mainline/presentation/style-packs.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../lib/mainline/store.js'
import type { MainlineCourse } from '../../../../../lib/mainline/domain.js'

export const runtime = 'nodejs'

const StylePatchSchema = z.object({ stylePackId: z.string().min(1).nullable() })

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params

  let body: z.infer<typeof StylePatchSchema>
  try { body = StylePatchSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: `Invalid request body: ${String(err)}` }, { status: 400 }) }

  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  if (body.stylePackId !== null && !resolveStylePackById(body.stylePackId)) {
    return NextResponse.json({ error: `unknown stylePackId: ${body.stylePackId}` }, { status: 400 })
  }

  const { stylePackId: _dropped, ...rest } = course
  const next: MainlineCourse = body.stylePackId === null
    ? rest
    : { ...rest, stylePackId: body.stylePackId }

  await saveMainlineCourse(next)
  return NextResponse.json({ ok: true, courseId, stylePackId: body.stylePackId })
}
