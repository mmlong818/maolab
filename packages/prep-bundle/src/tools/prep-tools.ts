// 插件 yunyi-tools-prep：prep preset 的 15 个备课工具（3c 14 个，4b 加 revise_course；发布与撤回随公共库留在自习室，S4 改为课程包导出），都是备课门面（@maolab/course 的 createPrepFacade）与渲染队列的薄壳。
// 身份只从 exec.agent 经 yunyiPrep 取（owner = yunyiSessions.ownerOf(agent)，账号用户名）；参数里没有 owner、sessionId、凭证（spec 11 第 3 条），
//   参数里多出来的这类字段一律忽略，别的 owner 的课程 id、任务 id 一律是 not-found。
// 需要模型的工具（generate_page、repair_page、audit_course、rehearse）先确认会话有云一凭证，没有就直接拒绝，一个请求都不发（D7）；
//   exec.signal 既交给本次调用的通道（runtime），也作为 options.signal 交给门面（Note for T6）。
// render_page、export_pptx 只投 course.render_jobs 并立即返回句柄，从不等待（spec 4.2）；进度与结果用 read_course 查。
//   requestKey = 会话 id + 调用 id（3c 裁决 F2）；截图任务再加页 id 与页的正文修订 id（终审 M4）：只去重同一次调用、同一正文的重放；
//   网关缺 tool_call id 时调用 id 会重复（适配器回退为 call_<序号>），修页后正文修订变了，仍投新任务，不会静默拿回旧任务。
// 结果只给结构化字段（2f 裁决 C）：{ ok: true, … } / { ok: false, reason, message, details? }。
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { RenderJob } from '@maolab/domain'
import type { PrepFailureReason, PrepJson, PrepPlanCommand, PrepRuntime } from '@maolab/course/services/prep-facade-types'
import type { ModelMeter } from '../prep/model.ts'
import type { PrepRefusalReason, PrepScope, YunyiPrep } from '../prep/service.ts'

export const name = 'yunyi-tools-prep'
export const inject = ['tools', 'yunyiPrep']

export const PREP_TOOL_NAMES = ['accept_course', 'accept_page', 'approve_plan', 'audit_course', 'audit_page', 'export_pptx', 'generate_page', 'list_courses', 'plan_course', 'prep_brief', 'read_course', 'rehearse', 'render_page', 'repair_page', 'revise_course'] as const

/** 工具层自己的失败原因（门面原因之外） */
export type PrepToolOwnReason = 'missing-credential' | 'render-queue-unavailable' | 'invalid-input' | 'failed'
export type PrepToolReason = PrepFailureReason | PrepToolOwnReason | PrepRefusalReason

/**
 * 原因表：工具结果 { ok:false, reason } 的全部取值与模型该怎么做。Record 的键类型锁住"门面新增原因时这里必须补"。
 * 门面的原因由 @maolab/course 的 prep-facade-types.ts 定义；本表与各工具描述要同步。
 */
export const PREP_TOOL_REASONS: Readonly<Record<PrepToolReason, string>> = {
  'not-found': '课程或页不存在（或不属于当前账号）：用 list_courses、read_course 确认 id。',
  'invalid-input': '参数不对：按 message 改参数再调用。',
  'unknown-kp': '有知识点 id 查不到：换成存在的知识点 id。',
  'plan-conflict': '计划改动被拒：结构规则不允许（计划确认后不能再改结构）、页 id 不对，或课程刚被别的操作改过，先 read_course 重读课程再按当前计划重试；repair_page 返回它表示更早的页还没完成，先修 message 点名的页。',
  'write-conflict': '课程刚被别的操作改过：read_course 重读后再试。',
  'session-conflict': '生成会话状态已变：read_course 重读后再试。',
  'session-not-ready': '课程还没到这一步：按 message 先做前一步（read_course 可看当前状态）。',
  'page-blocked': '这一页自动修复后仍没通过：按 details 与老师商量后用 repair_page 带 feedback 重做。',
  'images-unavailable': '本宿主没有图像通道：用 approve_plan 去掉需要教学图像的页或改成不需要图的讲解。',
  'render-evidence-missing': '这一页还没有通过的截图：先 render_page，用 read_course 看到截图通过后再验收。',
  'pages-not-accepted': '还有页没逐页验收：按 details.pageIds 逐页 accept_page。',
  'audit-blocked': '整课审查没通过：按 details.advice 处理，findings（教学审查）与 factIssues（事实核查）每条以自带的 fix 与 action 为准——repair-page 用 repair_page 修对应页、重新截图后再 audit_course，add-source 是缺权威来源、告诉老师，rerun-audit 直接重跑 audit_course；unverifiedPageIds、pendingPageIds 不为空时直接重跑 audit_course（auditError 是审查输出没通过校验的原因）。不要反复重试验收。',
  'not-ready': '课程还不能导出：没验收的先完成整课验收（accept_course）。已验收的课改过之后（包括只改标题）不能原地再审查与验收：告诉老师要用 revise_course 建修订版（整课重新生成、截图、审查、验收），不要去重跑 audit_course 或 accept_course；message 说同一修订族里有更新的版本时，在那门课上继续。',
  'no-knowledge-point': '课程没有关联任何知识点：告诉老师，课程需要基于知识点建课。',
  'model-channel-missing': '模型通道不可用或云一凭证无效（认证失败）：不要重试，告诉老师重新登录。',
  'model-unavailable': '模型通道暂时不可用（超时、网络、网关）：页已放回队列，稍后再调用同一工具。',
  cancelled: '工具调用被取消：没有完成的页已放回队列，需要时再调用。',
  failed: '意外失败：按 message 告诉老师，稍后再试；message 说明重试不会改变结果时不要重试，直接告诉老师。',
  'missing-credential': '当前账号没有云一模型凭证：生成、修复、整课审查与试讲不能执行，告诉老师重新登录；其余工具不受影响。',
  'render-queue-unavailable': '渲染队列未配置：不能截图或导出，告诉老师。',
  'no-session': '没有会话或会话没有归属账号：不能备课。',
  'private-session': '私密会话不能备课。',
  'prep-unavailable': '备课服务暂不可用：稍后再试。',
}

type ToolResult = { [key: string]: PrepJson }
interface Exec { agent?: { id: unknown }; signal: AbortSignal; callId: unknown }
interface PrepToolsCtx { tools: { register(tool: unknown): unknown }; yunyiPrep: YunyiPrep }

const json = {
  schema: { type: 'object', additionalProperties: true },
  render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }],
} as const

const MISSING_CREDENTIAL: ToolResult = { ok: false, reason: 'missing-credential', message: '当前账号没有可用的云一模型凭证：生成、修复、整课审查与试讲都需要模型，不能执行；读课程、建课、改计划、截图、验收与导出不受影响。' }
const NO_QUEUE: ToolResult = { ok: false, reason: 'render-queue-unavailable', message: '渲染队列未配置（宿主没有连接数据库），不能截图或导出。' }
const NOT_FOUND: ToolResult = { ok: false, reason: 'not-found', message: '课程不存在。' }
const LESSON_PHASES = ['new', 'review', 'exam-prep'] as const
const PLAN_ACTIONS = ['save', 'approve', 'structure'] as const
/** 需要模型的工具描述共同的结尾 */
const MODEL_REASONS = '失败时：missing-credential 没有云一凭证、model-channel-missing 凭证无效（认证失败），都不要重试，告诉老师重新登录；model-unavailable 模型暂时不可用，稍后重试；cancelled 调用被取消。'

const asExec = (exec: unknown): Exec => exec as Exec
const asResult = (value: unknown): ToolResult => value as ToolResult
const badInput = (message: string): ToolResult => ({ ok: false, reason: 'invalid-input', message })

function text(value: unknown, max = 200): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max ? value.trim() : undefined
}

/** 字符串数组：缺省为空；类型、条数或长度不对返回 undefined */
function strings(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.length > maxItems) return undefined
  const out = value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter((item) => item.length > 0 && item.length <= maxLength)
  return out.length === value.length ? out : undefined
}

/** 队列的 requestKey 上限（packages/domain/src/render-jobs.ts） */
const REQUEST_KEY_MAX = 200

/** 截图任务的 requestKey：调用前缀 + 页 id + 页的正文修订 id（终审 M4）；超长时截短修订 id（sha256 十六进制，前缀足以区分） */
function renderKey(key: string, pageId: string, revision: string): string {
  const prefix = `${key}:${pageId}:`
  return `${prefix}${revision.slice(0, Math.max(16, REQUEST_KEY_MAX - prefix.length))}`
}

/** 本次调用的幂等键前缀：会话 id + 调用 id（3c 裁决 F2）；没有调用 id 时返回 undefined，调用方拒绝投递 */
function callKey(scope: PrepScope, exec: Exec): string | undefined {
  const callId = typeof exec.callId === 'string' ? exec.callId.trim() : ''
  return callId ? `${scope.sessionId}:${callId}` : undefined
}

function jobView(job: RenderJob): PrepJson {
  const result = (job.result ?? null) as { blocked?: unknown; skipped?: unknown; url?: unknown; filename?: unknown; expiresAt?: unknown } | null
  return {
    jobId: job.id,
    kind: job.kind,
    pageId: typeof job.payload.pageId === 'string' ? job.payload.pageId : null,
    status: job.status,
    attempts: job.attempts,
    error: job.error ? { code: job.error.code, message: job.error.message } : null,
    result: result
      ? JSON.parse(JSON.stringify({ blocked: result.blocked ?? null, skipped: result.skipped ?? null, url: result.url ?? null, filename: result.filename ?? null, expiresAt: result.expiresAt ?? null })) as PrepJson
      : null,
  }
}

function isCourseNotFound(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === 'COURSE_NOT_FOUND'
}

async function inScope(ctx: PrepToolsCtx, exec: Exec, fn: (scope: PrepScope) => Promise<ToolResult>): Promise<ToolResult> {
  const scope = await ctx.yunyiPrep.scope(exec.agent)
  if ('ok' in scope) return asResult(scope)
  try {
    return await fn(scope)
  } catch (error) {
    if (isCourseNotFound(error)) return NOT_FOUND
    // 门面已把业务错误转成结构化失败；到这里的是意外（数据库、队列）。日志与结果都只带错误类型，不带原文——
    // JSON.parse 等错误的文案会夹带一段课程原文（审查 T6 M4）
    const kind = error instanceof Error ? error.name : typeof error
    process.stderr.write(`yunyi-tools-prep: unexpected ${kind}\n`)
    return { ok: false, reason: 'failed', message: `备课服务出现意外错误（${kind}），这次操作没有完成；稍后再试，仍失败时告诉老师。` }
  }
}

async function withModel(scope: PrepScope, exec: Exec, courseId: string, fn: (runtime: PrepRuntime) => Promise<unknown>): Promise<ToolResult> {
  const prepared = scope.runtime(courseId, exec.signal)
  if (!prepared) return MISSING_CREDENTIAL
  const result = await fn(prepared.runtime)
  const meter: ModelMeter = prepared.meter
  return { ...asResult(result), modelCalls: { ...meter } }
}

export function apply(ctx: PrepToolsCtx): void {
  const register = (definition: unknown): void => { ctx.tools.register(definition) }
  const courseIdParam = { type: 'string', required: true, description: '课程 id（list_courses、plan_course 的结果里有）' } as const
  const pageIdParam = { type: 'string', required: true, description: '页 id（read_course 的 pages 里有）' } as const
  const feedbackParam = { type: 'array', description: '可选：老师的具体修改意见，每条一句，最多 8 条', items: { type: 'string' } } as const
  const courseIdOf = (args: Record<string, unknown>): string | undefined => text(args.courseId)

  register(defineTool({
    name: 'list_courses',
    description: '列出当前老师的全部课程（id、课题、计划与生成状态）。',
    parameters: {},
    output: json,
    async execute(_args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => asResult(await scope.facade.listCourses()))
    },
  }))

  register(defineTool({
    name: 'read_course',
    description: '读一门课：不给 pageId 时返回全课概况（每页状态、截图结论、是否已验收、整课审查结论）和最近 10 个截图、导出任务（jobs）；给 pageId 时返回这一页的计划与正文。截图与导出的进度都用它查，不要等待。',
    parameters: { courseId: courseIdParam, pageId: { type: 'string', description: '可选：只看这一页' } },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const courseId = courseIdOf(args)
        if (!courseId) return badInput('courseId 必填')
        const pageId = args.pageId === undefined ? undefined : text(args.pageId)
        if (args.pageId !== undefined && !pageId) return badInput('pageId 格式不对')
        const result = await scope.facade.readCourse(courseId, pageId)
        if (!result.ok || pageId !== undefined || !scope.jobs) return asResult(result)
        const jobs = await scope.jobs.listForCourse(courseId, 10)
        return { ...asResult(result), jobs: jobs.map(jobView) }
      })
    },
  }))

  register(defineTool({
    name: 'prep_brief',
    description: '备课简报：知识点、误区、事实核查与质量提示、课堂应变建议（不含任何学生学情）。',
    parameters: { courseId: courseIdParam },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const courseId = courseIdOf(args)
        return courseId ? asResult(await scope.facade.brief(courseId)) : badInput('courseId 必填')
      })
    },
  }))

  register(defineTool({
    name: 'plan_course',
    description: '用老师选定的知识点 id（1 到 6 个）建一门新课并编出逐页计划（不调用模型）。结果里 imagePages 是需要教学图像的页。把计划讲给老师听，老师同意后再用 approve_plan 确认。unknown-kp 表示有知识点 id 查不到。',
    parameters: {
      kpIds: { type: 'array', required: true, description: '知识点 id，1 到 6 个', items: { type: 'string' } },
      lessonPhase: { type: 'string', enum: [...LESSON_PHASES], description: '可选：new 新授（缺省）/ review 复习 / exam-prep 考前' },
    },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const kpIds = strings(args.kpIds, 6, 200)
        if (!kpIds || kpIds.length === 0) return badInput('kpIds 是 1 到 6 个知识点 id')
        const phase = args.lessonPhase
        if (phase !== undefined && !(LESSON_PHASES as readonly unknown[]).includes(phase)) return badInput('lessonPhase 只能是 new、review、exam-prep')
        return asResult(await scope.facade.planCourse({ kpIds, ...(phase ? { lessonPhase: phase as (typeof LESSON_PHASES)[number] } : {}) }))
      })
    },
  }))

  register(defineTool({
    name: 'approve_plan',
    description: '修改或确认课程计划。action=save 只保存逐页修改；action=approve 保存修改并确认计划（确认后才能 generate_page）；action=structure 调整页结构（移动、删除、插入讲解页、拆分讲解页）。只在老师明确同意后用 approve。返回 plan-conflict（结构规则不允许、页 id 不对，或课程刚被别的操作改过）时先用 read_course 重读课程，再按当前计划重试；images-unavailable 表示有需要图像的页而本宿主不能生成图像。',
    parameters: {
      courseId: courseIdParam,
      action: { type: 'string', required: true, enum: [...PLAN_ACTIONS], description: 'save / approve / structure' },
      updates: {
        type: 'array',
        description: 'save、approve 时的逐页修改',
        items: {
          type: 'object', additionalProperties: false,
          properties: {
            pageId: { type: 'string', required: true, description: '页 id' },
            learningAction: { type: 'string', required: true, description: '学生在这一页做什么，不超过 240 字' },
            newInformation: { type: 'string', required: true, description: '这一页新出现的信息，不超过 360 字' },
            visualReason: { type: 'string', description: '可选：为什么需要这张图' },
            teachingMove: { type: 'string', description: '可选：老师怎么推进' },
          },
        },
      },
      operation: { type: 'json', description: 'structure 时必填，四种之一：{"type":"move","pageId","direction":"up"|"down"}、{"type":"delete","pageId"}、{"type":"insert-explanation","afterPageId","learningAction","newInformation"}、{"type":"split-explanation","pageId","firstLearningAction","firstNewInformation","secondLearningAction","secondNewInformation"}' },
    },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const courseId = courseIdOf(args)
        if (!courseId) return badInput('courseId 必填')
        const action = args.action
        if (!(PLAN_ACTIONS as readonly unknown[]).includes(action)) return badInput('action 只能是 save、approve、structure')
        if (action === 'structure' && (typeof args.operation !== 'object' || args.operation === null)) return badInput('structure 需要 operation')
        const command: PrepPlanCommand = action === 'structure'
          ? { action, operation: args.operation as PrepJson }
          : { action: action as 'save' | 'approve', updates: (args.updates ?? []) as PrepJson }
        return asResult(await scope.facade.updatePlan(courseId, command, { imagesAvailable: scope.imagesAvailable }))
      })
    },
  }))

  register(defineTool({
    name: 'generate_page',
    description: `按已确认的计划生成下一页的正文（含质量闸门与单页事实核查，不过时自动修有限次）。每次只生成一页，结果里 remaining 是还剩几页、modelCalls 是本次的模型用量；全部生成后用 render_page 送截图。page-blocked 表示这一页自动修复后仍没通过。${MODEL_REASONS}`,
    parameters: { courseId: courseIdParam, feedback: feedbackParam },
    output: json,
    async execute(args, exec) {
      const call = asExec(exec)
      return inScope(ctx, call, async (scope) => {
        const courseId = courseIdOf(args)
        const feedback = strings(args.feedback, 8, 400)
        if (!courseId || !feedback) return badInput('courseId 必填，feedback 最多 8 条、每条不超过 400 字')
        return withModel(scope, call, courseId, (runtime) => scope.facade.generateNextPage(courseId, runtime, { imagesAvailable: scope.imagesAvailable, feedback, signal: call.signal }))
      })
    },
  }))

  register(defineTool({
    name: 'audit_page',
    description: '查看一页的检查结果：计划、生成诊断、确定性内容检查、截图结论、是否已验收。不调用模型。',
    parameters: { courseId: courseIdParam, pageId: pageIdParam },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const courseId = courseIdOf(args)
        const pageId = text(args.pageId)
        return courseId && pageId ? asResult(await scope.facade.auditPage(courseId, pageId)) : badInput('courseId、pageId 必填')
      })
    },
  }))

  register(defineTool({
    name: 'repair_page',
    description: `修一页：没通过的页按老师意见重新生成；已生成的页按老师意见重做（重做后这一页要重新 render_page，整课审查与验收作废）。feedback 写老师的具体修改意见（整课审查没通过时写 findings、factIssues 里对应这一页的问题）。plan-conflict 时按 message 先修它点名的页。${MODEL_REASONS}`,
    parameters: { courseId: courseIdParam, pageId: pageIdParam, feedback: feedbackParam },
    output: json,
    async execute(args, exec) {
      const call = asExec(exec)
      return inScope(ctx, call, async (scope) => {
        const courseId = courseIdOf(args)
        const pageId = text(args.pageId)
        const feedback = strings(args.feedback, 8, 400)
        if (!courseId || !pageId || !feedback) return badInput('courseId、pageId 必填，feedback 最多 8 条、每条不超过 400 字')
        return withModel(scope, call, courseId, (runtime) => scope.facade.repairPage(courseId, pageId, runtime, { imagesAvailable: scope.imagesAvailable, feedback, signal: call.signal }))
      })
    },
  }))

  register(defineTool({
    name: 'render_page',
    description: '把已生成的页送去截图检查（后台任务，立即返回，不要等待）。不给 pageId 时按页序送所有待截图的页；已在队列里的页列在 alreadyQueued，不重复送。之后用 read_course 看每页的截图结论与 jobs。render-queue-unavailable 表示本宿主不能截图。',
    parameters: { courseId: courseIdParam, pageId: { type: 'string', description: '可选：只送这一页' } },
    output: json,
    async execute(args, exec) {
      const call = asExec(exec)
      return inScope(ctx, call, async (scope) => {
        const courseId = courseIdOf(args)
        if (!courseId) return badInput('courseId 必填')
        const only = args.pageId === undefined ? undefined : text(args.pageId)
        if (args.pageId !== undefined && !only) return badInput('pageId 格式不对')
        const renderable = await scope.facade.renderablePages(courseId)
        if (!renderable.ok) return asResult(renderable)
        if (!scope.jobs) return NO_QUEUE
        const key = callKey(scope, call)
        if (!key) return { ok: false, reason: 'failed', message: '缺少工具调用 id，不能投递截图任务。' }
        // 没有待截图的页时说明当前阶段（审查 T6 M2）：截图都通过、待验收、已验收的下一步各不相同，门面按会话状态给出
        if (renderable.pageIds.length === 0) return { ok: true, queued: [], alreadyQueued: [], note: renderable.note ?? '没有需要截图的页：用 read_course 查看当前阶段。' }
        const wanted = only === undefined ? renderable.pageIds : renderable.pageIds.filter((pageId) => pageId === only)
        if (wanted.length === 0) return { ok: false, reason: 'session-not-ready', message: '这一页现在不需要截图（还没生成，或截图已通过）。' }
        // 别的调用投的、还在排队或运行的同页任务：不再投。本次调用自己投的（重放）照常走 enqueue，按 requestKey 拿回同一任务。
        // 不同调用之间是先查后投、尽力去重（审查 T6 M1）：两次调用并发时同一页可能各投一次，worker 对已截过的页返回 skipped、
        // 没轮到的页报可重试的 PAGE_NOT_NEXT（workers/render/src/jobs.ts），只是多领几次任务，不会截错页或重复写证据，所以不加锁
        const active = new Set((await scope.jobs.listForCourse(courseId, 100))
          .filter((job) => job.kind === 'render-page' && (job.status === 'queued' || job.status === 'running') && !job.requestKey.startsWith(`${key}:`))
          .map((job) => String(job.payload.pageId)))
        const queued: PrepJson[] = []
        const alreadyQueued: string[] = []
        // 逐个 await 投递：任务 id 以事务号开头，领取顺序即投递顺序（render-jobs.ts 文件头），worker 按页序截图
        for (const pageId of wanted) {
          if (active.has(pageId)) { alreadyQueued.push(pageId); continue }
          const { job, created } = await scope.jobs.enqueue({ courseId, kind: 'render-page', requestKey: renderKey(key, pageId, renderable.revisions[pageId] ?? ''), payload: { pageId } })
          queued.push({ jobId: job.id, pageId, status: job.status, created })
        }
        return { ok: true, queued, alreadyQueued, note: '截图在后台进行，不要等待；稍后用 read_course 查看每页的截图结论。' }
      })
    },
  }))

  register(defineTool({
    name: 'audit_course',
    description: `截图全部通过后做整课审查（整课事实核查 + AI 教学审查，最多 1 次模型请求）。通过时 acceptable 为 true，可以逐页 accept_page。没通过返回 audit-blocked，details 里：findings 是本次教学审查的问题，factIssues 是事实核查的问题（目标页、影响、修法），每条的 action 说怎么处理（repair-page 修页，add-source 缺权威来源、告诉老师，rerun-audit 直接重跑）；unverifiedPageIds、pendingPageIds 是没核实完的页，auditError 是审查输出没通过校验的原因，advice 是下一步。按 advice 与每条的 fix 做：要修的页用 repair_page 修、重新 render_page 后再 audit_course；只有 unverifiedPageIds、pendingPageIds 时直接重跑 audit_course。不要反复重试 accept_page 或 accept_course。审查途中模型通道失败时不返回 audit-blocked，按下面的通道原因处理。${MODEL_REASONS}`,
    parameters: { courseId: courseIdParam },
    output: json,
    async execute(args, exec) {
      const call = asExec(exec)
      return inScope(ctx, call, async (scope) => {
        const courseId = courseIdOf(args)
        if (!courseId) return badInput('courseId 必填')
        return withModel(scope, call, courseId, (runtime) => scope.facade.auditCourse(courseId, runtime))
      })
    },
  }))

  register(defineTool({
    name: 'accept_page',
    description: '老师确认这一页可以上课后逐页验收。要求这一页已有通过的截图（否则 render-evidence-missing），且整课审查已通过。',
    parameters: { courseId: courseIdParam, pageId: pageIdParam },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const courseId = courseIdOf(args)
        const pageId = text(args.pageId)
        return courseId && pageId ? asResult(await scope.facade.acceptPage(courseId, pageId)) : badInput('courseId、pageId 必填')
      })
    },
  }))

  register(defineTool({
    name: 'accept_course',
    description: '每一页都验收后做整课验收，课程成为可上课的版本。pages-not-accepted 时按 details.pageIds 逐页 accept_page。',
    parameters: { courseId: courseIdParam },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const courseId = courseIdOf(args)
        return courseId ? asResult(await scope.facade.acceptCourse(courseId)) : badInput('courseId 必填')
      })
    },
  }))

  register(defineTool({
    name: 'export_pptx',
    description: '导出 PPTX（后台任务，立即返回，不要等待）。只有整课验收后的课程能导出（否则 not-ready，不投任务）；之后用 read_course 查看导出任务，成功后有下载地址与文件名（7 天内有效）。render-queue-unavailable 表示本宿主不能导出。',
    parameters: { courseId: courseIdParam },
    output: json,
    async execute(args, exec) {
      const call = asExec(exec)
      return inScope(ctx, call, async (scope) => {
        const courseId = courseIdOf(args)
        if (!courseId) return badInput('courseId 必填')
        const ready = await scope.facade.exportReadiness(courseId)
        if (!ready.ok) return asResult(ready)
        if (!scope.jobs) return NO_QUEUE
        const key = callKey(scope, call)
        if (!key) return { ok: false, reason: 'failed', message: '缺少工具调用 id，不能投递导出任务。' }
        const { job, created } = await scope.jobs.enqueue({ courseId, kind: 'export-pptx', requestKey: key })
        return { ok: true, job: { jobId: job.id, status: job.status, created }, export: ready.export, note: '导出在后台进行，不要等待；稍后用 read_course 查看导出任务。' }
      })
    },
  }))

  register(defineTool({
    name: 'revise_course',
    description: '给已整课验收的课程建修订版（要改已验收的课时用）。修订版是同一修订族里的一门新课程，退回规划阶段：正文、截图、整课审查与验收都要重新做，模型输出会和原课不同。调用前先把这个代价告诉老师，只在老师明确要改已验收的课时调用。结果里的 courseId 是修订版，之后的工具都用它；existing 为 true 表示族里已经有更新的版本，直接在那门课上继续。失败：session-not-ready 这门课还没整课验收（直接改它即可）；not-found 课程不存在。',
    parameters: { courseId: courseIdParam },
    output: json,
    async execute(args, exec) {
      return inScope(ctx, asExec(exec), async (scope) => {
        const courseId = courseIdOf(args)
        return courseId ? asResult(await scope.facade.reviseCourse(courseId)) : badInput('courseId 必填')
      })
    },
  }))

  register(defineTool({
    name: 'rehearse',
    description: `让 AI 扮演目标学段的学生把整课上一遍，报告学生可能卡住的页（只读，不改课程；一次试学，模型输出不合格时最多 2 次尝试）。全部页面生成后可用。${MODEL_REASONS}`,
    parameters: { courseId: courseIdParam },
    output: json,
    async execute(args, exec) {
      const call = asExec(exec)
      return inScope(ctx, call, async (scope) => {
        const courseId = courseIdOf(args)
        if (!courseId) return badInput('courseId 必填')
        return withModel(scope, call, courseId, (runtime) => scope.facade.rehearse(courseId, runtime))
      })
    },
  }))
}
