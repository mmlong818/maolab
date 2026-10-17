// 3d：备课对话。会话行在 course.prep_sessions（owner = 账号用户名），回合在 course.prep_runs（id = harness messageId）。
// 发消息前先判凭证（用户裁决 D7：没有云一凭证不建会话、不发消息，harness 收不到任何请求）；只认本人凭证，不回退站点密钥
// （Ruling [T4] I1：与 /api/prep/status 的 hasCredential 共用 resolvePrepCredential）；courseId 必须是本人的课程。
// 判定顺序：render 404 → 401 → 闸门 403（prep.ts 的 onRequest，先于请求体）→ 本插件（会话不是本人的与不存在一样 404）。
// 发给 harness 的文字 = 老师原话 + 一行面板当前课程；对话记录只存原话。
import type { FastifyPluginAsync } from 'fastify'
import { PrepRequestConflictError, PrepSessionNotFoundError, type PrepRunRow } from '@maolab/domain'
import { resolvePrepCredential } from '../harness/credential.ts'
import { pipeNdjson } from '../harness/ndjson.ts'
import { sessionDto } from '../prep/frames.ts'
import { startPrepTurn, PREP_TURN_TEXT } from '../prep/turn.ts'
import { prepStaleMs } from '../prep/config.ts'
import { PREP_ERRORS } from '../prep/errors.ts'
import { sendFailure, validId } from './prep-courses.ts'

export interface PrepTranscriptItem { id: string; runId: string; requestId: string; role: 'teacher' | 'assistant' | 'error'; content: string; createdAt: number; tools?: unknown; code?: string }

const TITLE_MAX = 60
/** 请求编号：8–120 个 [A-Za-z0-9_-]（Ruling [T9]，与 T7 面板写操作同一口径） */
const REQUEST_ID_RE = /^[A-Za-z0-9_-]{8,120}$/
const NOT_FOUND_COURSE = { ok: false, reason: 'not-found', message: '课程不存在。' } as const

export function parsePrepMessage(raw: unknown): { content: string; requestId: string; courseId?: string } | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const b = raw as Record<string, unknown>
  const content = typeof b.content === 'string' ? b.content.trim() : ''
  const requestId = typeof b.requestId === 'string' ? b.requestId.trim() : ''
  if (content.length < 1 || content.length > 4000 || !REQUEST_ID_RE.test(requestId)) return undefined
  if (b.courseId !== undefined && !validId(b.courseId)) return undefined
  return { content, requestId, ...(typeof b.courseId === 'string' ? { courseId: b.courseId } : {}) }
}

/** 每项带 requestId（终审 M1/M4）：面板据此保留本页在途的草稿，并用同一个 requestId 重试 */
export function transcriptOf(runs: PrepRunRow[]): PrepTranscriptItem[] {
  return runs.flatMap((run) => {
    const teacher: PrepTranscriptItem = { id: `${run.id}:teacher`, runId: run.id, requestId: run.requestId, role: 'teacher', content: run.content, createdAt: run.createdAt }
    if (run.status === 'completed' && run.reply) return [teacher, { id: run.reply.messageId, runId: run.id, requestId: run.requestId, role: 'assistant', content: run.reply.content, createdAt: run.updatedAt, tools: run.reply.tools }]
    if (run.status === 'failed') return [teacher, { id: `${run.id}:error`, runId: run.id, requestId: run.requestId, role: 'error', content: run.errorCode === 'cancelled' ? PREP_TURN_TEXT.cancelled : run.errorCode === 'timeout' ? PREP_TURN_TEXT.timeout : PREP_TURN_TEXT.failed, createdAt: run.updatedAt, code: run.errorCode ?? 'failed' }]
    return [teacher]
  })
}

/** 标题：空白折叠、去首尾、按码点截到 60（不把 emoji 截成两半，T7 I1 同类问题） */
const titleOf = (raw: unknown): string => (typeof raw === 'string' ? [...raw.replace(/\s+/g, ' ').trim()].slice(0, TITLE_MAX).join('').trim() : '') || '新的备课'

export const prepChatRoutes: FastifyPluginAsync = async (app) => {
  const { config, store } = app.deps
  const owner = (req: { user_id?: string }) => req.user_id!
  const credentialOf = (name: string) => resolvePrepCredential(store, name)
  const courseVisible = async (name: string, courseId: string) => (await (await app.prep.courses.facade(name)).readCourse(courseId)).ok

  app.post('/api/prep/sessions', async (req, reply) => {
    const b = (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {}) as Record<string, unknown>
    if (!(await credentialOf(owner(req)))) return reply.code(403).send(PREP_ERRORS.credential)
    if (b.courseId !== undefined && (!validId(b.courseId) || !(await courseVisible(owner(req), b.courseId)))) return sendFailure(reply, NOT_FOUND_COURSE)
    const session = await app.prep.conversations.forOwner(owner(req)).createSession({ title: titleOf(b.title), courseId: typeof b.courseId === 'string' ? b.courseId : null })
    return reply.code(201).send({ session: sessionDto(session) })
  })

  app.get('/api/prep/sessions', async (req) => ({ sessions: (await app.prep.conversations.forOwner(owner(req)).listSessions(50)).map(sessionDto) }))

  app.get<{ Params: { id: string } }>('/api/prep/sessions/:id', async (req, reply) => {
    const conversations = app.prep.conversations.forOwner(owner(req))
    const session = validId(req.params.id) ? await conversations.getSession(req.params.id) : undefined
    if (!session) return reply.code(404).send(PREP_ERRORS.notFound)
    const runs = await conversations.runs(session.id)
    const running = (await conversations.activeRuns({ sessionId: session.id, staleAfterMs: prepStaleMs(config.prep) })).map((r) => r.id)
    return { session: sessionDto(session), messages: transcriptOf(runs), running }
  })

  app.post<{ Params: { id: string } }>('/api/prep/sessions/:id/messages', async (req, reply) => {
    const name = owner(req)
    const conversations = app.prep.conversations.forOwner(name)
    const session = validId(req.params.id) ? await conversations.getSession(req.params.id) : undefined
    if (!session) return reply.code(404).send(PREP_ERRORS.notFound)
    const body = parsePrepMessage(req.body)
    if (!body) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
    const credential = await credentialOf(name)
    if (!credential) return reply.code(403).send(PREP_ERRORS.credential)
    if (body.courseId && !(await courseVisible(name, body.courseId))) return sendFailure(reply, NOT_FOUND_COURSE)
    const harnessText = body.courseId ? `${body.content}\n\n〔面板当前课程：${body.courseId}〕` : body.content
    let outcome
    try {
      outcome = await startPrepTurn(
        { harness: app.deps.harness, prep: config.prep, provider: config.prep.provider, model: config.prep.model, dispatch: app.prep.dispatch, log: (m) => app.log.warn(m) },
        { owner: name, credential, conversations, session, content: body.content, harnessText, requestId: body.requestId },
      )
    } catch (e) {
      if (e instanceof PrepRequestConflictError) return reply.code(409).send({ error: '同一个 requestId 已用于不同的内容。', code: 'REQUEST_KEY_CONFLICT' })
      if (e instanceof PrepSessionNotFoundError) return reply.code(404).send(PREP_ERRORS.notFound)
      throw e
    }
    if (outcome.kind === 'replayed') return reply.send(outcome.body)
    // 同 requestId 进行中：不重复派发
    if (outcome.kind === 'running') return reply.code(202).send({ ...PREP_ERRORS.busy, runId: outcome.runId, status: 'running' })
    if ((req.headers.accept ?? '').includes('application/x-ndjson')) {
      reply.hijack()
      await pipeNdjson(reply.raw, outcome.frames, config.prep.heartbeatMs)
      return
    }
    let failure: { error: string; code: string } | undefined
    for await (const f of outcome.frames) if (f.type === 'error') failure = { error: f.error, code: f.code }
    const done = await outcome.done
    if (done) return reply.send(done)
    // PREP_FAILED（含被别的 claim 接管，Note for T9）→ 500
    const status = failure?.code === 'PREP_QUEUE_FULL' ? 429 : failure?.code === 'PREP_TIMEOUT' ? 504 : failure?.code === 'PREP_CANCELLED' ? 409 : 500
    return reply.code(status).send(failure ?? PREP_ERRORS.failed)
  })

  app.post<{ Params: { id: string } }>('/api/prep/sessions/:id/cancel', async (req, reply) => {
    const session = validId(req.params.id) ? await app.prep.conversations.forOwner(owner(req)).getSession(req.params.id) : undefined
    if (!session) return reply.code(404).send(PREP_ERRORS.notFound)
    // 无凭证不碰 harness（D7；fix round 1 M2）：取消本身不调模型，但与建会话、发消息同一口径
    if (!(await credentialOf(owner(req)))) return reply.code(403).send(PREP_ERRORS.credential)
    // 网关语义：中止当前回合并丢弃本会话排队的消息；各回合由自己的收尾帧（cancelled）落库。
    // 放进会话派发互斥（fix round 1 M1）：已领取、正在 ensure/openEvents/prompt 的回合先派发完，取消排在它之后才丢得掉它
    await app.prep.dispatch.exclusive(session.id, () => app.deps.harness.cancel(session.id))
    return reply.code(202).send({ cancelled: true })
  })
}
