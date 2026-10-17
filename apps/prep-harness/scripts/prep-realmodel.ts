// 3c 真实模型验收：真实 dsh 宿主 + prep preset + glm-5.3（云一网关缺省地址）。脚本扮演老师，按课程状态说下一句话，
// 走"选知识点 → 计划 → 确认 → 逐页生成 → 截图 → 整课审查 → 验收 → 导出 → 试学"，记录每步的模型调用、时长、失败、自动修复（repairs，只计闸门修复）
// 与重排（requeues，超时、网络、中止等传输失败，3c 裁决 F8 / I2）次数。
// 没有 3d 的 api：脚本扮演 api，直接对 harness 网关建会话，把 .env 的 LEARNING_LLM_API_KEY 作为本会话的 credential 交给网关登记
// （与 api 解析出老师的云一凭证后的做法相同）；密钥只在本进程内存里：dotenv.parse 读文件、不并进 process.env，宿主子进程的环境里没有它；
// 不打印、不写文件，产出前做密钥值匹配扫描。.env 的 LEARNING_LLM_BASE_URL 已知配错（2e/2f 实测 401）：不设 YUNYI_LLM_BASE_URL，用适配器缺省地址。
// 老师按工具结果行事（同 prep skill）：整课审查 audit-blocked 时按 details.advice / findings / factIssues 说下一句；
// 整课验收 session-conflict 时按"页有改动先 render_page、再 audit_course、再验收"说。截图与导出用 workers/render 的排空脚本（缺省真实浏览器），
// 每次排空后核对跑到 idle 且本课没有排队或运行中的任务。
// 只动 course_test_prep_real* schema 与 course_test_prep_real_teacher 账号行，结束时清理。没有密钥时跳过并退出 0。
// 用法：corepack pnpm -C apps/prep-harness realmodel:prep [--fake-capture] [--image-model <id>] [--max-turns 60]
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { parse } from 'dotenv'
import pg from 'pg'
import { PgCourseDocuments } from '@maolab/domain'
import { startHost, type EventFrame } from '../tests/helpers/host.ts'
import { drainRenderQueue, dropPrepSchemas, loadCourseForTests, prepPgUrl, resetPrepSchemas, toolResultsOf } from '../tests/helpers/prep.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const OUT = join(ROOT, 'docs', 'real-check', '2026-10-14-phase3c-prep', 'realmodel')
const HOST_LOG = join(ROOT, 'apps', 'harness', 'host-test.log')
const { values } = parseArgs({ options: { 'fake-capture': { type: 'boolean', default: false }, 'image-model': { type: 'string', default: '' }, 'max-turns': { type: 'string', default: '60' } } })
const maxTurns = Number(values['max-turns'])
const fakeCapture = values['fake-capture'] === true
/** 单回合等待上限：老师一句"逐页生成到底"可能让 agent 在一个回合里连调十几次 generate_page */
const TURN_TIMEOUT_MS = 90 * 60_000

const envFile = join(ROOT, '.env')
const fileEnv = existsSync(envFile) ? parse(readFileSync(envFile)) : {}
const key = fileEnv.LEARNING_LLM_API_KEY?.trim()
if (!key) {
  process.stdout.write('跳过：.env 没有 LEARNING_LLM_API_KEY\n')
  process.exit(0)
}
const pgUrl = prepPgUrl()
// helpers/prep.ts 用 dotenv.parse（不并进 process.env，裁决 F21）；保险起见仍把 .env 里出现的变量名从本进程环境删掉（测试库地址除外），
// 并去掉网关地址覆盖、测试回退密钥与 prep 预算覆盖（用 profile 缺省：reasoning_effort low、max_tokens 适配器缺省 8192）
for (const name of Object.keys(fileEnv)) if (name !== 'TEST_PG_DATABASE_URL') delete process.env[name]
for (const name of ['YUNYI_LLM_BASE_URL', 'YUNYI_TURN_FALLBACK_KEY', 'YUNYI_LLM_MAX_TOKENS_PREP', 'YUNYI_LLM_REASONING_EFFORT_PREP']) delete process.env[name]
const redact = (text: string): string => text.split(key).join('[REDACTED]')
const clip = (text: unknown, max = 600): string | null => (typeof text === 'string' ? redact(text.length > max ? `${text.slice(0, max)}…` : text) : null)

const COURSE_SCHEMA = 'course_test_prep_real'
const KNOWLEDGE_SCHEMA = 'course_test_prep_real_kp'
const TEACHER = 'course_test_prep_real_teacher'
const MODEL = 'glm-5.3'
const hostLogStart = existsSync(HOST_LOG) ? statSync(HOST_LOG).size : 0
const course = await loadCourseForTests()
await resetPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners: [TEACHER], fixtures: course })
const host = await startHost({
  YUNYI_PREP_PG_URL: pgUrl, YUNYI_COURSE_SCHEMA: COURSE_SCHEMA, YUNYI_PREP_KNOWLEDGE_SCHEMA: KNOWLEDGE_SCHEMA,
  YUNYI_PREP_MODEL: MODEL, YUNYI_PREP_IMAGE_MODEL: values['image-model'] ?? '', YUNYI_DIAGNOSTIC_TOOLS: '', YUNYI_TEST_PRESETS: '',
}, { readyTimeoutMs: 180_000 })
const pool = new pg.Pool({ connectionString: pgUrl, max: 2 })
const documents = new PgCourseDocuments(pool, { schema: COURSE_SCHEMA }).forOwner(TEACHER)

interface CourseState {
  courseId?: string
  planStatus?: string
  sessionStatus?: string
  qualityStatus?: string
  teaching?: string
  pages: Array<{ pageId: string; order: number; status: string }>
  blockedShots: Array<{ order: number; pageId: string; issues: string }>
  activeRenderJobs: number
  exportJob?: { status: string }
}

async function readState(): Promise<CourseState> {
  const record = (await documents.list('course'))[0]
  if (!record) return { pages: [], blockedShots: [], activeRenderJobs: 0 }
  const c = record.payload as Record<string, any>
  const jobs = (await pool.query(`select kind, status from ${COURSE_SCHEMA}.render_jobs where owner = $1 and course_id = $2 order by created_at, id`, [TEACHER, c.id])).rows as Array<{ kind: string; status: string }>
  const sessionJobs = (c.generationSession?.jobs ?? []) as Array<{ pageId: string; order: number; status: string; checkpoint?: { renderEvidenceId?: string } }>
  const pages = sessionJobs.map(({ pageId, order, status }) => ({ pageId, order, status }))
  const evidence = (c.pageRenderEvidence ?? []) as Array<{ id: string; pageId: string; issues: Array<{ severity: string; message: string }> }>
  const blockedShots = sessionJobs
    .filter((page) => page.status === 'content-ready')
    .flatMap((page) => {
      // 本页最新的截图证据（检查点指向的优先）
      const shot = evidence.find((item) => item.id === page.checkpoint?.renderEvidenceId) ?? evidence.filter((item) => item.pageId === page.pageId).at(-1)
      const blocking = shot?.issues.filter((issue) => issue.severity === 'blocking') ?? []
      return blocking.length > 0 ? [{ order: page.order, pageId: page.pageId, issues: blocking.map((issue) => issue.message).join('；') }] : []
    })
  const exportJob = [...jobs].reverse().find((job) => job.kind === 'export-pptx')
  return {
    courseId: c.id, planStatus: c.planning?.status, sessionStatus: c.generationSession?.status, qualityStatus: c.qualityStatus, teaching: c.teachingQualityAudit?.status,
    pages, blockedShots, activeRenderJobs: jobs.filter((job) => job.kind === 'render-page' && (job.status === 'queued' || job.status === 'running')).length,
    ...(exportJob ? { exportJob: { status: exportJob.status } } : {}),
  }
}

/** 老师看到的上一次整课审查与整课验收结果（老师按工具结果说话，同 prep skill） */
let lastAudit: { ok: boolean; reason: string | null; details: Record<string, any> | null } | undefined
/** 截图排空后、下一次 audit_course 之前为真：这时该做整课审查，而不是按旧的 blocked 结论修页 */
let auditDue = false
let acceptConflict = false
let rehearsed = false
const auditObservations: Array<{ turn: number; ok: boolean; reason: string | null; perPage: boolean; findings: number; factIssues: number; unverified: number; pending: number; advice: string | null }> = []

function auditRepairText(details: Record<string, any> | null): string {
  const advice = typeof details?.advice === 'string' ? details.advice : ''
  const unverified = (details?.unverifiedPageIds ?? []).length
  const pending = (details?.pendingPageIds ?? []).length
  const pageIssues = [...(details?.findings ?? []), ...(details?.factIssues ?? [])].filter((item: Record<string, unknown>) => typeof item.pageId === 'string' && item.pageId)
  if ((unverified > 0 || pending > 0) && pageIssues.length === 0) return `整课审查说还有页没核实完（${advice}）。请直接重跑整课审查 audit_course，然后告诉我结论。`
  if (pageIssues.length > 0) return `整课审查没通过。请按审查给的 findings 和 factIssues，用 repair_page 把点名的页逐一修好（把审查意见写进 feedback），修完把改过的页重新 render_page 送截图。${unverified + pending > 0 ? '没核实完的页修完后会随整课审查重跑。' : ''}`
  // 3c T3 延后项：没有逐页信息的 audit-blocked（正文闸门、页序不一致、factAudit 缺失等）
  return `整课审查没通过，但没有点名具体的页。审查给的建议是：${advice || '（无）'}。请按这条建议处理；如果需要我补充材料（比如来源原文），直接告诉我缺什么。`
}

/** 老师的下一句话（脚本化的老师）；drain 为真时这回合之后跑一次排空 */
function nextMove(s: CourseState): { stage: string; text?: string; drain?: boolean } | undefined {
  if (!s.courseId) return { stage: 'plan', text: `我想用这两个知识点备一节初中语文课，知识点 id 是 ${course.PREP_FIXTURE_KP_IDS.join('、')}。先把课程计划做出来讲给我听。` }
  if (!s.sessionStatus) return { stage: 'approve', text: '计划可以。请确认计划，然后开始逐页生成。' }
  if (s.sessionStatus === 'generating') {
    const blocked = s.pages.find((page) => page.status === 'blocked')
    if (blocked) return { stage: 'repair', text: `第 ${blocked.order} 页没通过，请按问题修好这一页，再接着生成。` }
    return { stage: 'generate', text: '请继续逐页生成，直到全部页面生成完；每生成一页简单告诉我结果。' }
  }
  if (s.sessionStatus === 'rendering') {
    const shot = s.blockedShots[0]
    if (shot) return { stage: 'repair', text: `第 ${shot.order} 页截图没通过（${shot.issues}），请重做这一页，再送截图。` }
    if (s.activeRenderJobs > 0) return { stage: 'render', drain: true }
    return { stage: 'render', text: '页面都生成好了，请把还没截图的页送去截图检查。', drain: true }
  }
  if (s.sessionStatus === 'course-audit') {
    if (auditDue || !lastAudit) return { stage: 'audit', text: '截图都通过了，请做整课审查，然后告诉我结论。' }
    if (!lastAudit.ok && lastAudit.reason === 'audit-blocked') return { stage: 'audit-repair', text: auditRepairText(lastAudit.details) }
    return { stage: 'audit', text: '请做整课审查，然后告诉我结论。' }
  }
  if (s.sessionStatus === 'awaiting-teacher-acceptance') {
    if (acceptConflict) return { stage: 'accept', text: '刚才整课验收说状态变了。按规矩来：页有改动的话先 render_page，再 audit_course，然后逐页验收、再整课验收。' }
    return { stage: 'accept', text: '我逐页看过了，都可以。请把每一页都验收，然后做整课验收。' }
  }
  if (s.sessionStatus === 'ready') {
    if (!s.exportJob) return { stage: 'export', text: '请导出 PPTX。', drain: true }
    if (s.exportJob.status === 'queued' || s.exportJob.status === 'running') return { stage: 'export', drain: true }
    if (!rehearsed) return { stage: 'rehearse', text: '最后请试讲一遍，告诉我学生可能会卡在哪里。' }
  }
  return undefined
}

/** 本课排空并核对：排空脚本跑满 --max-jobs 时也以 0 退出（T10 备注），所以要看到 idle，且本课没有排队或运行中的任务 */
async function drainAndVerify(courseId: string | undefined): Promise<Record<string, unknown>> {
  const t = Date.now()
  try {
    const drained = await drainRenderQueue(COURSE_SCHEMA, { fakeCapture, timeoutMs: 1_200_000 })
    const left = courseId
      ? ((await pool.query(`select count(*)::int as n from ${COURSE_SCHEMA}.render_jobs where course_id = $1 and status in ('queued', 'running')`, [courseId])).rows[0] as { n: number }).n
      : 0
    const counts = (drained.counts ?? {}) as Record<string, number>
    return { ...drained, ms: Date.now() - t, leftActive: left, drained: counts.idle === 1 && left === 0 }
  } catch (error) {
    return { error: clip(error instanceof Error ? error.message : String(error), 1200), ms: Date.now() - t, drained: false }
  }
}

type ResultRow = {
  tool: string | null; ok: boolean; reason: string | null; message: string | null
  modelCalls: { calls: number; failures: number; ms: number; inputTokens: number; outputTokens: number; imageCalls: number } | null
  repairs: number; requeues: number; rounds: number | null; pageOrder: number | null; details?: unknown
}
type Turn = {
  turn: number; stage: string; text: string | null; ms: number; results: ResultRow[]; frameTypes: Record<string, number>
  agentSteps: number; llmRetries: number; turnEnd: unknown; reply: string | null; drain?: unknown
}

/** 从回合帧里按 callId 取工具名（tool/call 帧：{ callId, name }；tool/result 帧：message.toolCallId） */
function toolNamesOf(frames: EventFrame[]): Array<string | null> {
  const names = new Map<string, string>()
  for (const frame of frames) {
    if (frame.type !== 'tool/call') continue
    const data = frame.data as { callId?: string; name?: string }
    if (data?.callId && data.name) names.set(data.callId, data.name)
  }
  return frames.filter((frame) => frame.type === 'tool/result').map((frame) => {
    const id = (frame.data as { message?: { toolCallId?: string } }).message?.toolCallId
    return id ? names.get(id) ?? null : null
  })
}

/** agent 本回合说给老师的最后一段话（assistant 消息帧里的文本），只截前 400 字，看它有没有照工具结果讲 */
function replyOf(frames: EventFrame[]): string | null {
  let last: string | null = null
  for (const frame of frames) {
    const message = (frame.data as { message?: { role?: string; content?: Array<{ type?: string; text?: string }> } } | undefined)?.message
    if (message?.role !== 'assistant') continue
    const text = (message.content ?? []).filter((block) => block.type === 'text' && block.text).map((block) => block.text).join('')
    if (text.trim()) last = text
  }
  return clip(last, 400)
}

const sessionId = `s-prep-real-${Date.now().toString(36)}`
let events: ReturnType<typeof host.events> | undefined
const turns: Turn[] = []
const drains: unknown[] = []
const started = Date.now()
let outcome: 'completed' | 'stalled' | 'max-turns' | 'error' = 'max-turns'
let lastSignature = ''
let repeats = 0
try {
  const created = await host.api('POST', '/sessions', { sessionId, owner: TEACHER, credential: key, preset: 'prep', provider: 'yunyi', model: MODEL })
  if (created.status !== 201) throw new Error(`建会话失败 ${created.status}`)
  const ev = host.events(sessionId)
  events = ev
  for (let turn = 1; turn <= maxTurns; turn += 1) {
    const state = await readState()
    const move = nextMove(state)
    if (!move) { outcome = 'completed'; break }
    const signature = JSON.stringify({ move: move.stage, text: move.text, session: state.sessionStatus, pages: state.pages.map((page) => page.status), shots: state.blockedShots.length, quality: state.qualityStatus, teaching: state.teaching, exportJob: state.exportJob?.status })
    repeats = signature === lastSignature ? repeats + 1 : 0
    lastSignature = signature
    if (repeats >= 4) { outcome = 'stalled'; break }
    const t = Date.now()
    const record: Turn = { turn, stage: move.stage, text: move.text ?? null, ms: 0, results: [], frameTypes: {}, agentSteps: 0, llmRetries: 0, turnEnd: null, reply: null }
    process.stdout.write(`[${new Date().toISOString()}] 第 ${turn} 回合 ${move.stage} 开始（会话 ${state.sessionStatus ?? '-'}）\n`)
    if (move.text) {
      const start = ev.received.length
      const sent = await host.api('POST', `/sessions/${sessionId}/prompt`, { text: move.text })
      if (sent.status >= 300) throw new Error(`prompt ${sent.status}`)
      const end = await ev.waitFor((frame) => frame.type === 'turn/end' && ev.received.indexOf(frame) >= start, TURN_TIMEOUT_MS)
      const frames = ev.received.slice(start)
      for (const frame of frames) record.frameTypes[frame.type] = (record.frameTypes[frame.type] ?? 0) + 1
      record.agentSteps = record.frameTypes['step/start'] ?? 0
      record.llmRetries = record.frameTypes['llm/retry'] ?? 0
      record.turnEnd = JSON.parse(redact(JSON.stringify((end.data as { reason?: unknown } | undefined)?.reason ?? null)))
      record.reply = replyOf(frames)
      const names = toolNamesOf(frames)
      record.results = toolResultsOf(frames).map((result, index) => {
        const page = (result.page ?? result.details ?? {}) as Record<string, unknown>
        const tool = names[index] ?? null
        const row: ResultRow = {
          tool,
          ok: result.ok === true,
          reason: typeof result.reason === 'string' ? result.reason : null,
          message: result.ok === true ? null : clip(result.message, 400),
          modelCalls: result.modelCalls
            ? { calls: result.modelCalls.calls, failures: result.modelCalls.failures, ms: result.modelCalls.ms, inputTokens: result.modelCalls.inputTokens ?? 0, outputTokens: result.modelCalls.outputTokens ?? 0, imageCalls: result.modelCalls.imageCalls ?? 0 }
            : null,
          repairs: Number(page.repairs ?? 0),
          requeues: Number(page.requeues ?? 0),
          rounds: typeof page.rounds === 'number' ? page.rounds : null,
          pageOrder: typeof page.order === 'number' ? page.order : null,
        }
        if (tool === 'audit_course') {
          const details = result.ok === true ? (result.audit ?? null) : (result.details ?? null)
          row.details = JSON.parse(redact(JSON.stringify(details)))
          lastAudit = { ok: result.ok === true, reason: row.reason, details: details as Record<string, any> | null }
          auditDue = false
          const d = (details ?? {}) as Record<string, any>
          const perPage = [...(d.findings ?? []), ...(d.factIssues ?? [])].some((item: Record<string, unknown>) => typeof item.pageId === 'string' && item.pageId)
          auditObservations.push({ turn, ok: row.ok, reason: row.reason, perPage, findings: (d.findings ?? []).length, factIssues: (d.factIssues ?? []).length, unverified: (d.unverifiedPageIds ?? []).length, pending: (d.pendingPageIds ?? []).length, advice: clip(d.advice ?? d.note, 400) })
        }
        if (tool === 'accept_course') {
          acceptConflict = !row.ok && row.reason === 'session-conflict'
          if (!row.ok) row.details = JSON.parse(redact(JSON.stringify(result.details ?? null)))
        }
        if (tool === 'rehearse' && result.ok === true) { rehearsed = true; row.details = JSON.parse(redact(JSON.stringify(result.report ?? null))) }
        if (tool === 'export_pptx' || tool === 'render_page') row.details = JSON.parse(redact(JSON.stringify(result.ok ? { queued: Array.isArray(result.queued) ? result.queued.length : undefined, alreadyQueued: result.alreadyQueued, job: result.job } : result.details ?? null)))
        if (!row.ok && row.details === undefined && result.details !== undefined) row.details = JSON.parse(redact(JSON.stringify(result.details)))
        return row
      })
    }
    if (move.drain) {
      record.drain = await drainAndVerify(state.courseId)
      drains.push({ turn, stage: move.stage, ...(record.drain as object) })
      if (move.stage === 'render') auditDue = true
    }
    record.ms = Date.now() - t
    turns.push(record)
    const toolsLine = record.results.map((result) => `${result.tool ?? '?'}:${result.ok ? 'ok' : result.reason}`).join(' ')
    process.stdout.write(`[${new Date().toISOString()}] 第 ${turn} 回合 ${move.stage}：${record.ms} ms，agent 步 ${record.agentSteps}，工具 ${record.results.length} 次 ${toolsLine}${record.drain ? ` 排空 ${JSON.stringify(record.drain)}` : ''}\n`)
  }
} catch (error) {
  outcome = 'error'
  turns.push({ turn: turns.length + 1, stage: 'error', text: clip(error instanceof Error ? error.message : String(error), 1200), ms: 0, results: [], frameTypes: {}, agentSteps: 0, llmRetries: 0, turnEnd: null, reply: null })
}

type StageRow = { turns: number; ms: number; toolCalls: number; toolModelCalls: number; toolModelMs: number; toolModelFailures: number; toolInputTokens: number; toolOutputTokens: number; imageCalls: number; toolFailures: number; repairs: number; requeues: number; agentModelRequests: number; llmRetries: number }
const stages: Record<string, StageRow> = {}
const toolsByName: Record<string, { calls: number; failures: Record<string, number>; modelCalls: number; modelMs: number }> = {}
for (const turn of turns) {
  const row = (stages[turn.stage] ??= { turns: 0, ms: 0, toolCalls: 0, toolModelCalls: 0, toolModelMs: 0, toolModelFailures: 0, toolInputTokens: 0, toolOutputTokens: 0, imageCalls: 0, toolFailures: 0, repairs: 0, requeues: 0, agentModelRequests: 0, llmRetries: 0 })
  row.turns += 1
  row.ms += turn.ms
  row.toolCalls += turn.results.length
  for (const result of turn.results) {
    row.toolModelCalls += result.modelCalls?.calls ?? 0
    row.toolModelMs += result.modelCalls?.ms ?? 0
    row.toolModelFailures += result.modelCalls?.failures ?? 0
    row.toolInputTokens += result.modelCalls?.inputTokens ?? 0
    row.toolOutputTokens += result.modelCalls?.outputTokens ?? 0
    row.imageCalls += result.modelCalls?.imageCalls ?? 0
    if (!result.ok) row.toolFailures += 1
    row.repairs += result.repairs
    row.requeues += result.requeues
    const byName = (toolsByName[result.tool ?? '?'] ??= { calls: 0, failures: {}, modelCalls: 0, modelMs: 0 })
    byName.calls += 1
    byName.modelCalls += result.modelCalls?.calls ?? 0
    byName.modelMs += result.modelCalls?.ms ?? 0
    if (!result.ok) byName.failures[result.reason ?? 'unknown'] = (byName.failures[result.reason ?? 'unknown'] ?? 0) + 1
  }
  // agent 自己的模型请求：按 step/start 帧计（dsh agent loop 每次模型请求开一步，计划 Step 3 的精确口径）
  row.agentModelRequests += turn.agentSteps
  row.llmRetries += turn.llmRetries
}
// 逐页生成：每次成功的 generate_page / repair_page 的工具内模型调用与耗时（长正文页的时长与重试，3a 交接项）
const pageRuns = turns.flatMap((turn) => turn.results.filter((result) => (result.tool === 'generate_page' || result.tool === 'repair_page')).map((result) => ({
  turn: turn.turn, tool: result.tool, ok: result.ok, reason: result.reason, order: result.pageOrder, rounds: result.rounds, repairs: result.repairs, requeues: result.requeues,
  calls: result.modelCalls?.calls ?? 0, failures: result.modelCalls?.failures ?? 0, ms: result.modelCalls?.ms ?? 0, outputTokens: result.modelCalls?.outputTokens ?? 0, imageCalls: result.modelCalls?.imageCalls ?? 0,
})))
const finalState = await readState().catch(() => undefined)
await events?.close().catch(() => undefined)
await host.stop()
await pool.end()
await dropPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners: [TEACHER] })

// 宿主日志：本次运行追加的部分里找凭证类错误（只计数）；整份日志做密钥扫描（只比对、不打印），命中则脱敏回写
let hostLogHits = 0
const hostLogFindings: Record<string, number> = {}
if (existsSync(HOST_LOG)) {
  const log = readFileSync(HOST_LOG, 'utf8')
  const ours = readFileSync(HOST_LOG).subarray(hostLogStart).toString('utf8')
  for (const marker of ['MISSING_CREDENTIAL', 'IDENTITY_MISMATCH', '401', 'prep-transport', 'yunyi-tools-prep: unexpected']) hostLogFindings[marker] = ours.split(marker).length - 1
  hostLogHits = log.split(key).length - 1
  if (hostLogHits > 0) writeFileSync(HOST_LOG, redact(log))
}
const summary = {
  outcome, model: MODEL, imageModel: values['image-model'] || null, gateway: 'llm-yunyi.ts 缺省地址', capture: fakeCapture ? 'fake-capture' : 'real-browser',
  budgets: { reasoningEffort: 'low（profile 缺省，未设 YUNYI_LLM_REASONING_EFFORT_PREP）', maxTokens: '8192（适配器缺省，未设 YUNYI_LLM_MAX_TOKENS_PREP；T8 实测对工具内调用同样生效）' },
  kpIds: [...course.PREP_FIXTURE_KP_IDS],
  elapsedMs: Date.now() - started, turns: turns.length, stages, toolsByName, pageRuns, audits: auditObservations, drains, finalState,
  hostLog: hostLogFindings,
  secretScan: { hostLogHitsRedacted: hostLogHits },
}
const summaryText = `${JSON.stringify(summary, null, 2)}\n`
const turnsText = `${JSON.stringify(turns, null, 2)}\n`
if (summaryText.includes(key) || turnsText.includes(key)) throw new Error('产出里出现了密钥，拒绝写文件')
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'summary.json'), summaryText)
writeFileSync(join(OUT, 'turns.json'), turnsText)
process.stdout.write(`${JSON.stringify({ outcome, elapsedMs: summary.elapsedMs, turns: turns.length }, null, 2)}\n`)
process.exit(outcome === 'completed' ? 0 : 1)
