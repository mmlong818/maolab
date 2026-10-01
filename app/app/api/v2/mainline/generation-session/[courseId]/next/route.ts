import { NextResponse } from 'next/server'
import {
  GenerationPageRunError,
  generationPageRunner,
} from '../../../../../../lib/mainline/generation-page-runner.js'

export const runtime = 'nodejs'

export async function POST(_req: Request, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  try {
    const result = await generationPageRunner.runNext(courseId)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof GenerationPageRunError) {
      const status = error.code === 'COURSE_NOT_FOUND' || error.code === 'SESSION_NOT_FOUND' ? 404 : 409
      return NextResponse.json({ error: error.message, code: error.code }, { status })
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 422 })
  }
}
