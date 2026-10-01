import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import {
  GenerationSessionCommandError,
  generationSessionService,
  type GenerationSessionCommand,
} from '../../../../../lib/mainline/generation-session-service.js'

export const runtime = 'nodejs'

const ExpectedVersionSchema = z.string().trim().min(1).max(80)
const PageIdSchema = z.string().trim().min(1).max(160)
const HashSchema = z.string().regex(/^[a-f0-9]{64}$/)
const CommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start-page'), expectedUpdatedAt: ExpectedVersionSchema, pageId: PageIdSchema, inputHash: HashSchema }).strict(),
  z.object({
    action: z.literal('fail-page'),
    expectedUpdatedAt: ExpectedVersionSchema,
    pageId: PageIdSchema,
    kind: z.enum(['validation_error', 'source_error', 'model_error', 'render_error', 'transient_error', 'conflict_error']),
    message: z.string().trim().min(1).max(1200),
  }).strict(),
  z.object({ action: z.literal('resume-page'), expectedUpdatedAt: ExpectedVersionSchema, pageId: PageIdSchema }).strict(),
  z.object({ action: z.literal('recover'), expectedUpdatedAt: ExpectedVersionSchema }).strict(),
  z.object({ action: z.literal('cancel'), expectedUpdatedAt: ExpectedVersionSchema }).strict(),
  z.object({ action: z.literal('course-audit-passed'), expectedUpdatedAt: ExpectedVersionSchema }).strict(),
  z.object({ action: z.literal('teacher-accepted'), expectedUpdatedAt: ExpectedVersionSchema }).strict(),
])

const CreateSchema = z.object({ sessionId: z.string().trim().min(1).max(160) }).strict()

export async function GET(_req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  const session = await generationSessionService.find(courseId)
  if (!session) return NextResponse.json({ error: 'generation session not found' }, { status: 404 })
  return NextResponse.json({ session })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  try {
    const body = CreateSchema.parse(await req.json())
    const session = await generationSessionService.execute(courseId, { action: 'create', ...body })
    return NextResponse.json({ ok: true, session }, { status: 201 })
  } catch (error) {
    return commandErrorResponse(error)
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await ctx.params
  try {
    const command = CommandSchema.parse(await req.json()) as GenerationSessionCommand
    const session = await generationSessionService.execute(courseId, command)
    return NextResponse.json({ ok: true, session })
  } catch (error) {
    return commandErrorResponse(error)
  }
}

function commandErrorResponse(error: unknown): NextResponse {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ error: '生成会话命令格式不正确。', issues: error.issues }, { status: 400 })
  }
  if (error instanceof GenerationSessionCommandError) {
    const status = error.code === 'COURSE_NOT_FOUND' || error.code === 'SESSION_NOT_FOUND' ? 404 : 409
    return NextResponse.json({ error: error.message, code: error.code }, { status })
  }
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 409 })
}
