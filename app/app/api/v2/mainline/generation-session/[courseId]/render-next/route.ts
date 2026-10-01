import { NextResponse } from 'next/server'
import { GenerationRenderRunError, generationRenderRunner } from '../../../../../../lib/mainline/generation-render-runner.js'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  try {
    const result = await generationRenderRunner.runNext(courseId, new URL(req.url).origin)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof GenerationRenderRunError) {
      const status = error.code === 'COURSE_NOT_FOUND' || error.code === 'SESSION_NOT_FOUND'
        ? 404
        : error.code === 'RENDER_BLOCKED' ? 422 : 409
      return NextResponse.json({ error: error.message, code: error.code, evidence: error.evidence }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
  }
}
