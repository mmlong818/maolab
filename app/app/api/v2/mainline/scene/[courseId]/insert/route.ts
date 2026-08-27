/**
 * POST /api/v2/mainline/scene/[courseId]/insert · v5 M2 插页(工作台手动添加,与删页对称)
 *
 * 业务逻辑在 lib/mainline/edit/scene-insert.ts 的纯函数里,本文件只做请求校验、
 * 落库和响应整形(同 PATCH/DELETE 端点的既有分层,见 ../[sceneId]/route.ts)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { summarizeQuality } from '../../../../../../lib/mainline/quality-gates.js'
import { findMainlineCourse, saveMainlineCourse } from '../../../../../../lib/mainline/store.js'
import { insertSceneAfter, INSERTABLE_SCENE_TYPES } from '../../../../../../lib/mainline/edit/scene-insert.js'
import type { SceneType } from '../../../../../../lib/mainline/domain.js'

export const runtime = 'nodejs'

// sceneType 用 string 松校验(合法性判断交给 insertSceneAfter 的 INSERTABLE_SCENE_TYPES 单一事实源,
// 避免这里和业务层维护两份枚举清单)。
const InsertSceneSchema = z.object({
  afterSceneId: z.string().min(1),
  sceneType: z.string().min(1),
})

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params

  let body: z.infer<typeof InsertSceneSchema>
  try { body = InsertSceneSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: `Invalid request body: ${String(err)}` }, { status: 400 }) }

  const course = await findMainlineCourse(courseId)
  if (!course) return NextResponse.json({ error: 'course not found' }, { status: 404 })

  const result = insertSceneAfter(course, body.afterSceneId, body.sceneType as SceneType)
  if ('error' in result) {
    return NextResponse.json(
      { error: result.error, insertableSceneTypes: INSERTABLE_SCENE_TYPES },
      { status: result.code === 'not_found' ? 404 : 400 },
    )
  }

  await saveMainlineCourse(result.course)
  return NextResponse.json({
    ok: true,
    courseId,
    sceneId: result.sceneId,
    qualityStatus: result.course.qualityStatus,
    summary: summarizeQuality(result.issues),
    issues: result.issues,
  })
}
