/**
 * GET /api/v2/mainline/prep-brief/[courseId] · v5 M1「Prep Brief 教研简报」v0
 *
 * 把生成管线里教师看不见的教研资产(误概念库/事实核查/学情/骨架依据)组装成结构化
 * 简报返回。纯读:不跑 fill-scenes/fill-images,不烧 LLM,只读 store + mastery-store +
 * knowledge_points 已落库数据(见 lib/mainline/prep-brief.ts)。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { buildPrepBriefForCourse } from '../../../../../lib/mainline/prep-brief.js'

export const runtime = 'nodejs'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const brief = await buildPrepBriefForCourse(courseId)
  if (!brief) return NextResponse.json({ error: 'course not found' }, { status: 404 })
  return NextResponse.json(brief)
}
