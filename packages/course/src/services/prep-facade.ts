/**
 * 备课门面（3c）：把 3a 的课程服务按 owner 绑成一个对象，供 packages/bundle 的 prep 工具调用。
 * - 宿主按 owner 缓存本对象：生成、审计、验收服务的按课程串行队列在实例内（3a 裁决）；跨实例、跨进程写者靠 CAS（3a 终审）。
 * - 结果一律是可直接交给模型的 JSON：成功 { ok: true, … }，失败 { ok: false, reason, message, details? }。
 * - 模型与图像只经调用方给的 runtime（runWithCourseRuntime），本文件不读环境变量、不出网、不碰文件系统。
 * - 别人的课程：仓储是本 owner 的，查不到即 not-found，不区分"不存在"与"属于别人"。
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import { randomUUID } from 'node:crypto'
import type { FactAuditRecord, MainlineCourse } from '../mainline/domain.js'
import { defaultGenerationPageRunnerDependencies, GenerationPageRunError } from '../mainline/generation-page-runner.js'
import { evidenceBlocksPage } from '../mainline/generation-render-evidence.js'
import { MAX_AUTOMATIC_PAGE_ATTEMPTS } from '../mainline/generation-session.js'
import { teachingQualityInputHash } from '../mainline/teaching-quality-audit.js'
import { applyGeneratedPageContentRevision } from '../mainline/page-content-revision.js'
import { auditGeneratedLessonPage } from '../mainline/planning/page-content-audit.js'
import { regeneratePlannedPage } from '../mainline/planning/page-content-generator.js'
import { auditGeneratedPageFacts } from '../mainline/planning/page-content-page-audit.js'
import type { LessonPagePlan } from '../mainline/planning/page-contract.js'
import { forkCourseForReplanning, markCourseSuperseded, revisionOf } from '../mainline/planning/revision-lifecycle.js'
import { buildPrepBriefForCourse } from '../mainline/prep-brief.js'
import { createMainlineCourseStore, MainlineCourseWriteConflictError, type ListedMainlineCourse } from '../mainline/store.js'
import { tryoutCourse } from '../mainline/tryout.js'
import type { CourseDocumentStore, CourseKnowledgePort } from '../ports.js'
import { CourseRuntimeMissingError, runWithCourseRuntime, type CourseRuntime } from '../runtime.js'
import { createCourseFromKps } from './course-from-kps.js'
import { CourseServiceError } from './errors.js'
import { createCourseGenerationServices, type CourseGenerationOptions } from './generation.js'
import { updateCoursePlan } from './plan.js'
import { planProjectionExport } from './projection.js'
import { publicationDraftOf } from './publication.js'
import type { PrepDocumentStore, PrepFacade, PrepFacadeDeps, PrepFailure, PrepFailureReason, PrepGenerateOptions, PrepJson, PrepKnowledgePort, PrepRuntime } from './prep-facade-types.js'

// 编译期断言：类型文件里的结构副本与 ports.ts、runtime.ts 互相可赋值
type Mutual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const STRUCTURES_MATCH: [Mutual<PrepDocumentStore, CourseDocumentStore>, Mutual<PrepKnowledgePort, CourseKnowledgePort>, Mutual<PrepRuntime, CourseRuntime>] = [true, true, true]
void STRUCTURES_MATCH

/** 老师修改意见最多并入几条（与 runner 自带的两条闸门诊断一起交给生成器） */
export const PREP_MAX_FEEDBACK = 8
const NOT_FOUND = '课程不存在。'
const PAGE_NOT_FOUND = '这门课没有这一页。'

export interface PrepFacadeInternals {
  /** 测试用：替换生成器、核查与渲染（同 createCourseGenerationServices 的 options）；托管形态不传 */
  generation?: CourseGenerationOptions
}

export function prepFailure(reason: PrepFailureReason, message: string, details?: PrepJson): PrepFailure {
  return details === undefined ? { ok: false, reason, message } : { ok: false, reason, message, details }
}

export function toPrepJson(value: unknown): PrepJson {
  return JSON.parse(JSON.stringify(value ?? null)) as PrepJson
}

// 迁入服务的错误码（各 *Error.code）→ 门面原因。PAGE_NOT_FOUND 来自验收服务（会话里没有这页）
const CODE_REASONS: Record<string, PrepFailureReason> = {
  COURSE_NOT_FOUND: 'not-found',
  PAGE_NOT_FOUND: 'not-found',
  SESSION_NOT_FOUND: 'session-not-ready',
  SESSION_NOT_GENERATING: 'session-not-ready',
  SESSION_NOT_RENDERING: 'session-not-ready',
  SESSION_NOT_READY: 'session-not-ready',
  NOT_AWAITING_ACCEPTANCE: 'session-not-ready',
  NOT_PUBLISHED: 'session-not-ready',
  SESSION_CONFLICT: 'session-conflict',
  VERSION_CONFLICT: 'session-conflict',
  AUDIT_BLOCKED: 'audit-blocked',
  PAGES_NOT_ACCEPTED: 'pages-not-accepted',
  NOT_READY: 'not-ready',
  WRITE_CONFLICT: 'write-conflict',
}

/**
 * 传输失败的标记（审查 I2 与修复轮）：bundle 的工具内模型通道（packages/bundle/src/prep/model.ts 的 PrepTransportError）
 * 抛的错误消息以 "[prep-transport:<kind>] " 开头。迁入的生成器（fillOnePlannedPage）把模型异常吞成闸门理由、
 * callLLMJson 再把最后一次错误拼进文案，诊断里只剩文字，所以按这个前缀识别；两边的字面量要一起改。
 * auth（401/403、凭证缺失、身份不一致）是通道问题，按 model-channel-missing 报
 */
const TRANSPORT_MARKER = /\[prep-transport:(timeout|abort|network|auth)\]/
const TRANSPORT_TEXT: Record<string, string> = { timeout: '超时', abort: '已取消', network: '网络或网关不可用', auth: '认证失败' }

function transportKind(message: string | undefined): string | undefined {
  return message ? TRANSPORT_MARKER.exec(message)?.[1] : undefined
}

function transportReason(kind: string): PrepFailureReason {
  return kind === 'auth' ? 'model-channel-missing' : kind === 'abort' ? 'cancelled' : 'model-unavailable'
}

/** 迁入服务抛出的错误 → 门面失败。未知错误（多半是模型输出不合格或网络）给 failed 并带原文案，不吞原因 */
export function prepFailureOf(error: unknown): PrepFailure {
  if (error instanceof CourseRuntimeMissingError) return prepFailure('model-channel-missing', error.message)
  if (error instanceof MainlineCourseWriteConflictError) return prepFailure('write-conflict', '课程刚被其他操作更新，本次结果没有写入；请重新读取后再试。')
  if (error instanceof CourseServiceError) {
    const reason: PrepFailureReason = error.code === 'COURSE_NOT_FOUND' ? 'not-found'
      : error.code === 'UNKNOWN_KP' ? 'unknown-kp'
        : error.code === 'PLAN_CONFLICT' ? 'plan-conflict'
          : 'invalid-input'
    return prepFailure(reason, reason === 'not-found' ? NOT_FOUND : error.message, error.details ? toPrepJson(error.details) : undefined)
  }
  const code = typeof (error as { code?: unknown } | null)?.code === 'string' ? (error as { code: string }).code : ''
  if (code && Object.hasOwn(CODE_REASONS, code)) {
    const reason = CODE_REASONS[code]!
    const blockers = (error as { blockers?: unknown }).blockers
    // details 与渲染 worker 的 NOT_READY 同形：{ blockers }（workers/render/src/errors.ts）
    return prepFailure(reason, reason === 'not-found' && code === 'COURSE_NOT_FOUND' ? NOT_FOUND : (error as Error).message, blockers === undefined ? undefined : toPrepJson({ blockers }))
  }
  const message = error instanceof Error ? error.message : String(error)
  // 整课审查、试学等不经逐页生成的模型调用：传输失败同样按通道原因报，不当成内容失败
  const transport = transportKind(message)
  return prepFailure(transport ? transportReason(transport) : 'failed', message)
}

/** 需要教学图像的计划页（D3：图像通道不可用时本阶段挡住） */
export function pageNeedsImage(plan: Pick<LessonPagePlan, 'visualSpec'>): boolean {
  return plan.visualSpec.required && plan.visualSpec.form === 'instructional-image'
}

export function imagesUnavailableMessage(orders: readonly number[]): string {
  return `云一网关目前没有可用的图像模型，第 ${orders.join('、')} 页需要教学图像，本阶段不能生成。请用 approve_plan 的 structure 操作在这些页的位置插入讲解页（insert-explanation）并删除原页，或改用不需要图像的讲法，再确认计划。`
}

/**
 * 生成前先查模型通道：迁入的 fillOnePlannedPage 把模型调用的任何异常（含 CourseRuntimeMissingError）吞成闸门理由、
 * 最后抛 PageContentGenerationQualityError（page-content-generator.ts 的重试循环），不预先拦就会把页记成闸门失败并锁住
 */
function modelChannelMissing(): PrepFailure {
  return prepFailureOf(new CourseRuntimeMissingError('COURSE_LLM_MISSING'))
}

/** 一轮 runNext 的上下文：老师意见，以及 runner 是否已调用生成器（调用前它一定已把页写成 running，attempt 已计） */
interface RoundContext { feedback: readonly string[]; started: boolean }
const roundContext = new AsyncLocalStorage<RoundContext>()
/** 闸门失败（单页质量闸门、来源）：会话不自动重排，门面显式 resume-page 后重跑，计入 repairs */
const GATE_KINDS: ReadonlySet<string> = new Set(['validation_error', 'source_error'])

function cleanFeedback(feedback: readonly string[] | undefined): string[] {
  return (feedback ?? []).map((item) => item.trim().slice(0, 400)).filter((item) => item.length > 0).slice(0, PREP_MAX_FEEDBACK)
}

const NEXT_STEP_BY_STATUS: Record<string, string> = {
  rendering: '全部页面已经生成：下一步用 render_page 送截图。',
  'course-audit': '截图都已通过：下一步用 audit_course 做整课审查。',
  'awaiting-teacher-acceptance': '整课审查已通过：下一步逐页 accept_page。',
  ready: '课程已验收，可以 export_pptx。',
  cancelled: '生成会话已取消。',
  failed: '生成会话已失败。',
}

function pageRows(course: MainlineCourse) {
  const session = course.generationSession
  const evidence = new Map((course.pageRenderEvidence ?? []).map((item) => [item.pageId, item]))
  const accepted = new Set((course.teacherAcceptance?.pages ?? []).map((item) => item.pageId))
  return (course.planning?.pages ?? []).map((plan) => {
    const job = session?.jobs.find((candidate) => candidate.pageId === plan.id)
    const shot = evidence.get(plan.id)
    return {
      pageId: plan.id,
      order: plan.order,
      purpose: plan.purpose,
      learningAction: plan.learningAction,
      needsImage: pageNeedsImage(plan),
      status: job?.status ?? 'not-started',
      attempts: job?.attempt ?? 0,
      lastDiagnostic: job?.diagnostics.at(-1)?.message ?? null,
      render: shot ? { evidenceId: shot.id, blocking: evidenceBlocksPage(shot), issues: shot.issues.map((issue) => issue.message) } : null,
      accepted: accepted.has(plan.id),
    }
  })
}

/** 交给模型的 AI 教学审查问题：最多 8 条，阻断项在前 */
const MAX_AUDIT_FINDINGS = 8
const SEVERITY_ORDER: Record<string, number> = { blocking: 0, 'insufficient-evidence': 1, warning: 2 }

/**
 * 每条审查问题按它自带的 fix 归类（[final-fix](2)：finding 自带修法与 advice 矛盾时以 finding 为准）：
 * - add-source：缺权威来源（课标、教材原文），迁入的 insufficient() 写的是"挂载并绑定……原文"，修页解决不了；
 * - rerun-audit：审查输出本身不完整（review-integrity、页面 ID 或证据对不上），fix 写的是"重新运行审查/整课核查"；
 * - repair-page：其余，按 fix 改页
 */
export type PrepAuditAction = 'repair-page' | 'add-source' | 'rerun-audit'
export function auditActionForFinding(fix: string): PrepAuditAction {
  if (/挂载|绑定.*原文|补充.*来源|补.*权威来源/.test(fix)) return 'add-source'
  if (/重新运行(整课)?(审查|核查)/.test(fix)) return 'rerun-audit'
  return 'repair-page'
}
/**
 * 事实核查的修法（3c 终审复审遗留）：迁入的核查常写"补充权威来源或删去该断言"，删去或改写断言就是修页，
 * 只有修法里没有"删/改"这条路时才归 add-source（交给老师补来源）
 */
export function auditActionForFact(fix: string): PrepAuditAction {
  if (/删去|删除|删掉|改写|修改|改为|改成/.test(fix)) return 'repair-page'
  return auditActionForFinding(fix)
}

function teachingFindings(course: MainlineCourse) {
  return [...(course.teachingQualityAudit?.findings ?? [])]
    .sort((left, right) => (SEVERITY_ORDER[left.severity] ?? 3) - (SEVERITY_ORDER[right.severity] ?? 3))
    .slice(0, MAX_AUDIT_FINDINGS)
    .map((finding) => ({ severity: finding.severity, category: finding.category, pageId: finding.pageId, impact: finding.impact, fix: finding.fix, action: auditActionForFinding(finding.fix) }))
}

/** 迁入的事实核查失败时写进 info 项 fix 的错误原文前缀（page-content-fact-audit.ts，只读不改） */
const FACT_AUDIT_ERROR_PREFIX = '核查服务错误：'

/** 本次事实核查没完成时的错误原文（迁入代码已截到 240 字）；没有则 undefined */
function factAuditError(fact: FactAuditRecord | undefined): string | undefined {
  if (!fact || (fact.unverifiedSceneIds ?? []).length === 0) return undefined
  for (const issue of fact.issues) {
    const at = issue.severity === 'info' ? issue.fix.indexOf(FACT_AUDIT_ERROR_PREFIX) : -1
    if (at >= 0) return issue.fix.slice(at + FACT_AUDIT_ERROR_PREFIX.length).trim() || undefined
  }
  return undefined
}

/**
 * 整课审查被阻断时交给模型的机器审计结果（审查 I1、终审 M1）：
 * - 事实核查记录每次运行都会重写（audit.run 先跑 auditFacts），只认与当前正文同一修订的；
 * - AI 教学审查只在事实核查通过后才跑：以 auditedAt 为运行标记，与本次运行前的记录相同就是上一轮的结论，不交给模型；
 * - unverified 里带的错误原文放进 auditError：模型通道正常、只是审查输出没通过解析或校验时建议直接重跑（[final-fix](1)）
 */
function auditBlockedDetails(course: MainlineCourse | undefined, previousTeachingAuditedAt: string | undefined) {
  const revision = course?.pageContent?.contentRevisionId
  const record = course?.teachingQualityAudit
  const teaching = record && record.contentRevisionId === revision && record.auditedAt !== previousTeachingAuditedAt ? course : undefined
  const fact = course?.factAudit && revision && course.factAudit.contentRevisionId === revision ? course.factAudit : undefined
  const factIssues = (fact?.issues ?? [])
    .filter((issue) => issue.severity === 'blocking')
    .slice(0, MAX_AUDIT_FINDINGS)
    .map((issue) => ({
      severity: issue.severity, pageId: issue.targetId,
      ...(issue.relatedTargetIds?.length ? { relatedPageIds: issue.relatedTargetIds } : {}),
      message: issue.message, impact: issue.impact, fix: issue.fix, action: auditActionForFact(issue.fix),
    }))
  const findings = teaching ? teachingFindings(teaching) : []
  const unverifiedPageIds = fact?.unverifiedSceneIds ?? []
  const pendingPageIds = fact?.pendingSceneIds ?? []
  const auditError = factAuditError(fact)
  const actions = new Set([...factIssues, ...findings].map((item) => item.action))
  const parts: string[] = []
  if (unverifiedPageIds.length > 0) {
    parts.push(auditError
      ? `事实核查没有完成（${unverifiedPageIds.length} 页未经核实）：模型通道正常，是审查输出没有通过解析或校验（原因见 auditError），不是页面内容的问题，直接重跑 audit_course。`
      : `事实核查没有完成（${unverifiedPageIds.length} 页未经核实），不是页面内容的问题：直接重跑 audit_course。`)
  } else if (pendingPageIds.length > 0) {
    parts.push(`有 ${pendingPageIds.length} 页在等待重新核查：直接重跑 audit_course。`)
  }
  if (actions.size > 0) parts.push('factIssues 与 findings 每条按它自带的 fix 与 action 处理：')
  if (actions.has('repair-page')) parts.push('action 为 repair-page 的，用 repair_page 按 fix 修改对应页面，重新截图后再 audit_course（也可以用 audit_page 查看单页问题）；')
  if (actions.has('add-source')) parts.push('action 为 add-source 的，是缺少权威来源（课标或教材原文），修页解决不了，如实告诉老师缺哪类来源；')
  if (actions.has('rerun-audit')) parts.push('action 为 rerun-audit 的，是审查输出本身不完整，不是页面内容的问题，直接重跑 audit_course；')
  return {
    teachingQuality: teaching?.teachingQualityAudit?.status ?? null,
    qualityStatus: course?.qualityStatus ?? null,
    findings,
    factIssues,
    unverifiedPageIds,
    pendingPageIds,
    ...(auditError ? { auditError } : {}),
    advice: parts.length > 0
      ? parts.join('').replace(/；$/, '。')
      : '整课审查没通过，但没有可操作的问题条目：用 read_course 查看当前状态，必要时重跑 audit_course。',
  }
}

/** 会话里还没按当前版本（检查点的正文修订与截图证据）逐页验收的页，判据同迁入的 publish（teacher-acceptance.ts） */
function unacceptedPageIds(course: MainlineCourse): string[] {
  const accepted = new Map((course.teacherAcceptance?.pages ?? []).map((item) => [item.pageId, item]))
  return (course.generationSession?.jobs ?? [])
    .filter((job) => {
      const item = accepted.get(job.pageId)
      return !item || !job.checkpoint || item.contentRevisionId !== job.checkpoint.contentRevisionId || item.renderEvidenceId !== job.checkpoint.renderEvidenceId
    })
    .map((job) => job.pageId)
}

function courseSummary(course: MainlineCourse): PrepJson {
  return toPrepJson({
    courseId: course.id,
    topic: course.topic,
    subject: course.subject,
    gradeBand: course.gradeBand,
    qualityStatus: course.qualityStatus,
    planStatus: course.planning?.status ?? null,
    sessionStatus: course.generationSession?.status ?? null,
    goals: (course.goals ?? []).map((goal) => goal.statement),
    pages: pageRows(course),
    courseAudit: course.generationCourseAudit
      ? { auditId: course.generationCourseAudit.id, teachingQuality: course.teachingQualityAudit?.status ?? null }
      : null,
    acceptance: course.teacherAcceptance
      ? { acceptedPages: course.teacherAcceptance.pages.map((item) => item.pageId), finalSignature: course.teacherAcceptance.finalSignature ?? null }
      : null,
  })
}

export function createPrepFacade(deps: PrepFacadeDeps, internals: PrepFacadeInternals = {}): PrepFacade {
  const store = createMainlineCourseStore(deps.documents)
  const pageOptions = internals.generation?.pages ?? {}
  const baseGenerate = pageOptions.generate ?? defaultGenerationPageRunnerDependencies().generate
  // 老师意见经 roundContext（AsyncLocalStorage）并到 runner 交给生成器的闸门反馈后面，同时记下本轮已调用生成器（runner 只带最近两条闸门诊断，generation-page-runner.ts:114-117）
  const services = createCourseGenerationServices(store, {
    ...internals.generation,
    pages: {
      ...pageOptions,
      generate: (input) => {
        const context = roundContext.getStore()
        if (context) context.started = true
        // 传输失败被生成器记成了 validation_error，runner 会把它当闸门反馈交回生成器：不是正文问题，滤掉
        const gateFeedback = input.qualityFeedback.filter((item) => !transportKind(item))
        return baseGenerate({ ...input, qualityFeedback: [...gateFeedback, ...(context?.feedback ?? [])].slice(-PREP_MAX_FEEDBACK) })
      },
    },
  })

  // 门面自己的按课程串行：选"下一页"与跑它必须一起做，否则两个并发调用会选到同一页
  const queues = new Map<string, Promise<void>>()
  async function serial<T>(courseId: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(courseId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>((resolve) => { release = resolve })
    const tail = previous.then(() => current)
    queues.set(courseId, tail)
    await previous
    try { return await operation() } finally {
      release()
      if (queues.get(courseId) === tail) queues.delete(courseId)
    }
  }

  async function sessionCommand(courseId: string, action: 'resume-page' | 'recover', pageId?: string): Promise<PrepFailure | undefined> {
    const session = (await store.findMainlineCourse(courseId))?.generationSession
    if (!session) return prepFailure('not-found', NOT_FOUND)
    try {
      await services.session.execute(courseId, action === 'resume-page'
        ? { action, expectedUpdatedAt: session.updatedAt, pageId: pageId! }
        : { action, expectedUpdatedAt: session.updatedAt })
      return undefined
    } catch (error) {
      return prepFailureOf(error)
    }
  }

  /**
   * 跑同一页最多 MAX_AUTOMATIC_PAGE_ATTEMPTS 轮：闸门不过（validation/source）显式恢复后重跑，计 repairs；
   * 模型或网络错误由会话自己回到 queued 后重跑，计 requeues（3c 裁决 F8）。
   * 传输失败（超时、网络、取消，审查 I2）计 requeues 但不再起下一轮：页放回队列，返回 model-unavailable（取消为 cancelled）；
   * 工具信号已中止时不开始新一轮
   */
  async function runPageWithRepairs(courseId: string, pageId: string, runtime: PrepRuntime, feedback: readonly string[], signal?: AbortSignal): Promise<PrepFailure | { ok: true; page: PrepJson }> {
    let rounds = 0
    let repairs = 0
    let requeues = 0
    for (;;) {
      if (signal?.aborted) {
        return prepFailure('cancelled', rounds === 0 ? '工具调用已取消，这一页没有开始生成。' : `工具调用已取消，第 ${rounds} 轮之后停止。`, toPrepJson({ pageId, rounds, repairs, requeues }))
      }
      rounds += 1
      const before = (await store.findMainlineCourse(courseId))?.generationSession?.jobs.find((candidate) => candidate.pageId === pageId)
      const context: RoundContext = { feedback, started: false }
      let thrown: { error: unknown } | undefined
      try {
        await roundContext.run(context, () => runWithCourseRuntime(runtime, () => services.pages.runNext(courseId)))
      } catch (error) {
        // 开始生成之前的拒绝（会话不对、课程不在）、写冲突与通道缺失原样转成失败；
        // 生成过程中的失败已由 runner 记进会话（persistFailure），按会话里该页的状态往下判断
        if (error instanceof GenerationPageRunError || error instanceof MainlineCourseWriteConflictError || error instanceof CourseRuntimeMissingError) return prepFailureOf(error)
        thrown = { error }
      }
      const session = (await store.findMainlineCourse(courseId))?.generationSession
      const job = session?.jobs.find((candidate) => candidate.pageId === pageId)
      if (!session || !job) return prepFailure('not-found', NOT_FOUND)
      // 这一页没开始生成就失败了（startPageGeneration 的拒绝、首次写入的存储错误）：原样返回，不算重跑（审查 I1）。
      // 判据：仍在队列、attempt 没变，且生成器没被调用。只看 attempt 不够——输入哈希变了时 startPageGeneration 把 attempt 重置为 1、
      // 诊断清空，真跑过并失败的一轮看起来和没开始一样；runner 在写 running 与调用生成器之间不会抛错，started 是准确判据
      if (thrown && !context.started && job.status === 'queued' && job.attempt === before?.attempt) return prepFailureOf(thrown.error)
      const view = {
        pageId, order: job.order, status: job.status, rounds, repairs, requeues, attempts: job.attempt, sessionStatus: session.status,
        remaining: session.jobs.filter((candidate) => candidate.status === 'queued' || candidate.status === 'blocked' || candidate.status === 'running').length,
      }
      if (job.status === 'content-ready' || job.status === 'passed') return { ok: true, page: toPrepJson(view) }
      const last = job.diagnostics.at(-1)
      // 只认本轮新记的诊断（上一轮留下的不算）
      const fresh = last !== undefined && !(before?.diagnostics ?? []).some((item) => item.at === last.at && item.attempt === last.attempt && item.message === last.message)
      const transport = fresh && (job.status === 'queued' || job.status === 'blocked') ? transportKind(last.message) : undefined
      if (transport || signal?.aborted) {
        if (transport) requeues += 1
        // 传输失败被生成器记成闸门失败、页被锁住：不是正文问题，放回队列，之后 generate_page 直接重试
        const resume = job.status === 'blocked' && transport !== undefined
        const resumeFailed = resume ? await sessionCommand(courseId, 'resume-page', pageId) : undefined
        const status = resume && !resumeFailed ? 'queued' : job.status
        const stopped = toPrepJson({ ...view, requeues, status, diagnostics: job.diagnostics.slice(-3).map((item) => ({ kind: item.kind, message: item.message })) })
        const where = status === 'queued' ? '这一页已放回队列' : `这一页现在是 ${status}`
        if (transport === 'abort' || signal?.aborted) return prepFailure('cancelled', `工具调用已取消，第 ${job.order} 页在第 ${rounds} 轮停止；${where}。`, stopped)
        if (transport === 'auth') {
          return prepFailure('model-channel-missing', `第 ${job.order} 页生成时模型通道认证失败（会话凭证无效或已失效）：${last!.message}。${where}，不是正文问题；凭证恢复后再用 generate_page。`, stopped)
        }
        return prepFailure(
          'model-unavailable',
          `第 ${job.order} 页生成时模型通道${TRANSPORT_TEXT[transport!] ?? '不可用'}：${last!.message}。${where}，不是正文问题；稍后再用 generate_page 重试。`,
          stopped,
        )
      }
      if (rounds < MAX_AUTOMATIC_PAGE_ATTEMPTS && job.status === 'queued') { requeues += 1; continue }
      if (rounds < MAX_AUTOMATIC_PAGE_ATTEMPTS && job.status === 'blocked' && GATE_KINDS.has(job.diagnostics.at(-1)?.kind ?? '')) {
        const failed = await sessionCommand(courseId, 'resume-page', pageId)
        if (failed) return failed
        repairs += 1
        continue
      }
      if (job.status === 'running') {
        return prepFailure('write-conflict', `第 ${job.order} 页的失败没能记进课程（连续写冲突）；稍后用 read_course 查看，必要时用 repair_page 恢复这一页。`, toPrepJson(view))
      }
      const diagnostics = job.diagnostics.slice(-3).map((item) => ({ kind: item.kind, message: item.message }))
      if (job.status === 'queued') {
        // 最后一轮又是模型或网络错误、会话把页放回了队列（审查 M3）：如实报原因，这一页没有被锁，稍后 generate_page 即可
        return prepFailure(
          'failed',
          `第 ${job.order} 页连续 ${rounds} 轮遇到模型或网络错误，已放回队列：${job.diagnostics.at(-1)?.message ?? '原因未知'}。稍后再用 generate_page 重试。`,
          toPrepJson({ ...view, diagnostics }),
        )
      }
      return prepFailure(
        'page-blocked',
        `第 ${job.order} 页自动修复 ${repairs} 次、重跑 ${requeues} 次后仍未通过：${job.diagnostics.at(-1)?.message ?? '原因未知'}。可以用 repair_page 带上修改意见重做这一页。`,
        toPrepJson({ ...view, diagnostics }),
      )
    }
  }

  /**
   * 修订族里的先后（4a 终审 M4 的同毫秒并列，4b 修）：revisionNo 大的新；相同时创建得晚的新；仍相同时按课程 id 的字典序，大的算新。
   * 这是全序，同族永远恰好一门"最新"。publicationDraft 与 reviseCourse 共用
   */
  const newerInFamily = (a: Pick<ListedMainlineCourse, 'course' | 'createdAt'>, b: Pick<ListedMainlineCourse, 'course' | 'createdAt'>): boolean => {
    const ra = revisionOf(a.course).revisionNo
    const rb = revisionOf(b.course).revisionNo
    if (ra !== rb) return ra > rb
    const ca = a.createdAt ?? 0
    const cb = b.createdAt ?? 0
    if (ca !== cb) return ca > cb
    return a.course.id > b.course.id
  }
  /** 同族里比 self 更新的课中最新的那门；没有返回 undefined */
  async function newestAbove(self: MainlineCourse): Promise<ListedMainlineCourse | undefined> {
    const listed = await store.listMainlineCourses()
    const family = revisionOf(self).familyId
    const mine = listed.find((row) => row.course.id === self.id) ?? { course: self, createdAt: 0 }
    return listed
      .filter((row) => row.course.id !== self.id && revisionOf(row.course).familyId === family && newerInFamily(row, mine))
      .reduce<ListedMainlineCourse | undefined>((best, row) => (!best || newerInFamily(row, best) ? row : best), undefined)
  }
  const REVISION_NOTE = '修订版已建好，处在规划阶段：正文、截图、整课审查与验收都要重新做（approve_plan → generate_page → render_page → audit_course → accept_page → accept_course），模型输出会和原课不同。整课验收后用 publish_course 发布：已发布过的课会成为同一发布件的新版本，原来的版本在新版本发布前一直可用，正在上旧版本的孩子不受影响。'
  /**
   * 跨进程同时修订同一门课（门面实例内已由 serial 串行）：两边都可能已各自写入一份修订版。写入后重读族，
   * 同一原课、同一 revisionNo 的修订版里按 newerInFamily 最早的那门胜出，其余的由写它的一方删掉，调用方拿到胜者（existing: true）。
   * 两边写完再各自重读时看到的集合相同，结论一致；先写完先重读的一方只看到自己，后写的一方通常创建得更晚、会让位。
   * 残留窗口：后写的一方与先写的同一毫秒且 id 更小，或两个进程时钟有偏差，两门都会留下——此时 newerInFamily 的全序只让其中一门可发布，另一门是死草稿。
   * 返回胜者；就是自己时返回 undefined
   */
  async function earlierSibling(fork: MainlineCourse): Promise<ListedMainlineCourse | undefined> {
    const r = revisionOf(fork)
    const listed = await store.listMainlineCourses()
    const siblings = listed.filter((row) => {
      const other = revisionOf(row.course)
      return other.familyId === r.familyId && other.revisionNo === r.revisionNo && other.basedOnCourseId === r.basedOnCourseId
    })
    const first = siblings.reduce<ListedMainlineCourse | undefined>((best, row) => (!best || newerInFamily(best, row) ? row : best), undefined)
    return first && first.course.id !== fork.id ? first : undefined
  }

  /**
   * 旧版本标为被替代：读快照、CAS 写，冲突时重读再试一次（最多 2 次尝试）。已标记过视为 marked；
   * 读不到（已删除，或 basedOnCourseId 指向别的 owner——仓储按 owner 绑定，读出来是 undefined）为 missing；存储或标记本身抛错为 error
   */
  async function markSuperseded(previousId: string, replacementId: string): Promise<{ status: 'marked' } | { status: 'missing' } | { status: 'conflict' } | { status: 'error'; message: string }> {
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const snapshot = await store.findMainlineCourseSnapshot(previousId)
        if (!snapshot) return { status: 'missing' }
        if (snapshot.course.revision?.supersededByCourseId === replacementId) return { status: 'marked' }
        if (await store.saveMainlineCourseIfUnchanged(markCourseSuperseded(snapshot.course, replacementId), snapshot.updatedAt)) return { status: 'marked' }
      }
      return { status: 'conflict' }
    } catch (error) {
      return { status: 'error', message: error instanceof Error ? error.message : String(error) }
    }
  }

  return {
    async listCourses() {
      const listed = await store.listMainlineCourses()
      return {
        ok: true,
        courses: toPrepJson(listed.map(({ course, createdAt }) => ({
          courseId: course.id,
          topic: course.topic,
          qualityStatus: course.qualityStatus,
          planStatus: course.planning?.status ?? null,
          sessionStatus: course.generationSession?.status ?? null,
          createdAt,
        }))),
      }
    },

    async readCourse(courseId, pageId) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      if (pageId === undefined) return { ok: true, course: courseSummary(course) }
      const plan = course.planning?.pages.find((page) => page.id === pageId)
      if (!plan) return prepFailure('not-found', PAGE_NOT_FOUND)
      const generated = course.pageContent?.pages.find((page) => page.pageId === pageId)
      return {
        ok: true,
        course: toPrepJson({
          courseId,
          page: { plan, content: generated?.content ?? null, teacherScript: generated?.teacherCompanion.script ?? null, imageUrl: generated?.imageUrl ?? null },
        }),
      }
    },

    async brief(courseId) {
      const brief = await buildPrepBriefForCourse(courseId, { store, knowledge: deps.knowledge })
      return brief ? { ok: true, brief: toPrepJson(brief) } : prepFailure('not-found', NOT_FOUND)
    },

    async planCourse(input) {
      try {
        const result = await createCourseFromKps(
          { kpIds: [...input.kpIds], ...(input.lessonPhase ? { lessonPhase: input.lessonPhase } : {}) },
          { store, knowledge: deps.knowledge, ...(deps.newId ? { newId: deps.newId } : {}) },
        )
        const course = await store.findMainlineCourse(result.courseId)
        const plans = course?.planning?.pages ?? []
        return { ok: true, course: toPrepJson({ ...result, imagePages: plans.filter(pageNeedsImage).map((page) => page.id), pages: course ? pageRows(course) : [] }) }
      } catch (error) {
        return prepFailureOf(error)
      }
    },

    async updatePlan(courseId, command, options) {
      if (command.action === 'approve' && !options.imagesAvailable) {
        const course = await store.findMainlineCourse(courseId)
        if (!course) return prepFailure('not-found', NOT_FOUND)
        const blocked = (course.planning?.pages ?? []).filter(pageNeedsImage)
        if (blocked.length > 0) {
          return prepFailure('images-unavailable', imagesUnavailableMessage(blocked.map((page) => page.order)), toPrepJson({ pageIds: blocked.map((page) => page.id) }))
        }
      }
      const input = command.action === 'structure'
        ? { action: 'structure', operation: command.operation }
        : { action: command.action, updates: command.updates ?? [] }
      try {
        const result = await updateCoursePlan(courseId, input, { store, ...(deps.newId ? { newId: deps.newId } : {}) })
        return { ok: true, plan: toPrepJson(result) }
      } catch (error) {
        return prepFailureOf(error)
      }
    },

    generateNextPage(courseId: string, runtime: PrepRuntime, options: PrepGenerateOptions) {
      return serial(courseId, async () => {
        const course = await store.findMainlineCourse(courseId)
        if (!course) return prepFailure('not-found', NOT_FOUND)
        const session = course.generationSession
        if (!session) return prepFailure('session-not-ready', '计划还没确认：先用 approve_plan 确认计划。')
        if (session.status !== 'generating') return prepFailure('session-not-ready', NEXT_STEP_BY_STATUS[session.status] ?? `生成会话状态为 ${session.status}。`)
        const next = [...session.jobs].sort((left, right) => left.order - right.order).find((job) => job.status !== 'content-ready' && job.status !== 'passed')
        if (!next) return prepFailure('session-not-ready', '没有待生成的页。')
        if (next.status === 'blocked' || next.status === 'cancelled') {
          return prepFailure('page-blocked', `第 ${next.order} 页上次没有通过：${next.diagnostics.at(-1)?.message ?? '原因未知'}。先用 repair_page 修这一页。`, toPrepJson({ pageId: next.pageId }))
        }
        if (next.status === 'running') {
          return prepFailure('session-conflict', `第 ${next.order} 页正在生成或上次被中断；稍后再试，确认中断时用 repair_page 恢复这一页。`, toPrepJson({ pageId: next.pageId }))
        }
        const plan = course.planning?.pages.find((page) => page.id === next.pageId)
        if (plan && pageNeedsImage(plan) && !options.imagesAvailable) {
          return prepFailure('images-unavailable', imagesUnavailableMessage([plan.order]), toPrepJson({ pageIds: [plan.id] }))
        }
        if (!runtime.llm) return modelChannelMissing()
        return runPageWithRepairs(courseId, next.pageId, runtime, cleanFeedback(options.feedback), options.signal)
      })
    },

    async auditPage(courseId, pageId) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      const planning = course.planning
      const plan = planning?.pages.find((page) => page.id === pageId)
      if (!planning || !plan) return prepFailure('not-found', PAGE_NOT_FOUND)
      const job = course.generationSession?.jobs.find((candidate) => candidate.pageId === pageId)
      const generatedPages = course.pageContent?.pages ?? []
      const generated = generatedPages.find((page) => page.pageId === pageId)
      const issues = generated
        ? auditGeneratedLessonPage({ planRevisionId: planning.planRevisionId, planPage: plan, generatedPage: generated, sourceMaterial: course.sourceMaterial, priorPages: generatedPages.filter((page) => page.order < generated.order) })
        : []
      const shot = (course.pageRenderEvidence ?? []).find((item) => item.pageId === pageId)
      return {
        ok: true,
        audit: toPrepJson({
          pageId,
          order: plan.order,
          needsImage: pageNeedsImage(plan),
          status: job?.status ?? 'not-started',
          attempts: job?.attempt ?? 0,
          diagnostics: (job?.diagnostics ?? []).slice(-3).map((item) => ({ kind: item.kind, message: item.message })),
          contentIssues: issues.map((issue) => ({ severity: issue.severity, message: issue.message })),
          render: shot ? { blocking: evidenceBlocksPage(shot), metrics: shot.metrics, issues: shot.issues.map((issue) => ({ severity: issue.severity, message: issue.message })) } : null,
          accepted: (course.teacherAcceptance?.pages ?? []).some((item) => item.pageId === pageId),
        }),
      }
    },

    repairPage(courseId, pageId, runtime, options) {
      return serial(courseId, async () => {
        const snapshot = await store.findMainlineCourseSnapshot(courseId)
        if (!snapshot) return prepFailure('not-found', NOT_FOUND)
        const course = snapshot.course
        const plan = course.planning?.pages.find((page) => page.id === pageId)
        const job = course.generationSession?.jobs.find((candidate) => candidate.pageId === pageId)
        if (!plan || !job) return prepFailure('not-found', PAGE_NOT_FOUND)
        if (pageNeedsImage(plan) && !options.imagesAvailable) return prepFailure('images-unavailable', imagesUnavailableMessage([plan.order]), toPrepJson({ pageIds: [plan.id] }))
        if (!runtime.llm) return modelChannelMissing()
        const feedback = cleanFeedback(options.feedback)
        if (job.status === 'blocked' || job.status === 'cancelled' || job.status === 'running') {
          // runner 只跑会话里第一张 queued 的页：恢复的必须是最早未完成的页，否则恢复了这页却跑不到它（审查 I1，取消后的会话里会出现）
          const earliest = [...course.generationSession!.jobs].sort((left, right) => left.order - right.order).find((candidate) => candidate.status !== 'content-ready' && candidate.status !== 'passed')
          if (earliest && earliest.pageId !== pageId) {
            return prepFailure('plan-conflict', `第 ${earliest.order} 页还没完成，要先修它：先用 repair_page 修第 ${earliest.order} 页，再修第 ${job.order} 页。`, toPrepJson({ pageId: earliest.pageId, order: earliest.order }))
          }
          // running 只会是被中断的页（门面按课程串行，本实例里没有在跑的生成）：recover 把它放回队列
          const failed = await sessionCommand(courseId, job.status === 'running' ? 'recover' : 'resume-page', pageId)
          if (failed) return failed
          return runPageWithRepairs(courseId, pageId, runtime, feedback, options.signal)
        }
        if (job.status === 'queued') return prepFailure('session-not-ready', `第 ${job.order} 页还没生成：用 generate_page。`)
        // 已有正文：沿用 maolab 单页重做（api/v2/mainline/page-content PATCH）——重生成、单页核查、修订检查点，作废整课审计与验收
        if (course.planning?.status !== 'review' || course.pageContent?.status !== 'review') {
          return prepFailure('session-not-ready', '全部页面生成完、课程处于备课检查时才能重做已生成的页；已验收的课程不能直接改。')
        }
        try {
          const revised = await runWithCourseRuntime(runtime, async () => {
            const regenerated = await regeneratePlannedPage(course, pageId, feedback.length > 0 ? { qualityFeedback: feedback } : {})
            return applyGeneratedPageContentRevision(regenerated.course, pageId, { audit: (target, page) => auditGeneratedPageFacts(target, page) })
          })
          if (!(await store.saveMainlineCourseIfUnchanged(revised, snapshot.updatedAt))) {
            return prepFailure('write-conflict', '重做期间课程被其他操作更新，本次结果没有写入；请重新读取后再试。')
          }
          const revisedJob = revised.generationSession?.jobs.find((candidate) => candidate.pageId === pageId)
          return {
            ok: true,
            page: toPrepJson({ pageId, order: job.order, status: revisedJob?.status ?? null, sessionStatus: revised.generationSession?.status ?? null, rounds: 1, repairs: 0, requeues: 0, note: '本页正文已重做并通过单页核查；这一页需要重新 render_page，之前的整课审查与验收已作废。' }),
          }
        } catch (error) {
          return prepFailureOf(error)
        }
      })
    },

    async renderablePages(courseId) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      const session = course.generationSession
      if (!session) return prepFailure('session-not-ready', '计划还没确认：先用 approve_plan 确认计划。')
      if (session.status === 'course-audit' || session.status === 'awaiting-teacher-acceptance' || session.status === 'ready') {
        return { ok: true, pageIds: [], revisions: {}, note: `没有需要截图的页。${NEXT_STEP_BY_STATUS[session.status]}` }
      }
      if (session.status !== 'rendering') return prepFailure('session-not-ready', '还有页面没生成完：全部生成后才能截图。')
      const jobs = [...session.jobs].sort((left, right) => left.order - right.order).filter((job) => job.status === 'content-ready')
      // 每页的正文修订：content-ready 的页一定有内容检查点（generation-session.ts），缺省时退回整课正文修订
      const fallback = course.pageContent?.contentRevisionId ?? ''
      const revisions = Object.fromEntries(jobs.map((job) => [job.pageId, job.contentCheckpoint?.contentRevisionId ?? fallback]))
      return jobs.length > 0
        ? { ok: true, pageIds: jobs.map((job) => job.pageId), revisions }
        : { ok: true, pageIds: [], revisions, note: '没有需要截图的页：截图任务还在进行，或有页的截图没通过；用 read_course 查看每页的截图结论。' }
    },

    async auditCourse(courseId, runtime) {
      const before = await store.findMainlineCourse(courseId)
      if (!before) return prepFailure('not-found', NOT_FOUND)
      // 整课审查里的事实核查与 AI 教学审查要调模型：没有模型通道先拦下，不进迁入的审计流程
      if (!runtime.llm) return modelChannelMissing()
      try {
        const result = await runWithCourseRuntime(runtime, () => services.audit.run(courseId))
        return {
          ok: true,
          audit: toPrepJson({
            auditId: result.audit.id,
            sessionStatus: result.session.status,
            teachingQuality: result.course.teachingQualityAudit?.status ?? null,
            // audit.run 只在 AI 教学审查 passed 时正常返回，否则抛 AUDIT_BLOCKED（generation-course-audit.ts），成功即可验收
            acceptable: true,
            findings: teachingFindings(result.course),
            note: '整课审查通过：可以逐页 accept_page。findings 里只剩不阻断的提醒。',
          }),
        }
      } catch (error) {
        const failure = prepFailureOf(error)
        if (failure.reason !== 'audit-blocked') return failure
        // 3c 裁决 F1：audit.run 先把审查结果（qualityStatus blocked、事实核查记录，可能含 AI 教学审查记录）写进课程再抛错；
        // 重读课程，把机器审计与教学审查的可操作信息交给模型（只带本次运行的结论，终审 M1）
        const details = auditBlockedDetails(await store.findMainlineCourse(courseId), before.teachingQualityAudit?.auditedAt)
        // 终审 I1：迁入的事实核查把模型通道的异常也吞成 unverified，错误原文在 auditError 里；带传输标记的按通道原因报，
        // 不报 audit-blocked——凭证失效时引导重跑，每次重跑都会带着失效的凭证再出网一次
        const transport = transportKind(details.auditError)
        if (transport) {
          const stopped = toPrepJson({ unverifiedPageIds: details.unverifiedPageIds, auditError: details.auditError })
          if (transport === 'auth') {
            return prepFailure('model-channel-missing', `整课审查时模型通道认证失败（会话凭证无效或已失效），事实核查没有完成：${details.auditError}。这不是课程内容的问题；不要再调用 audit_course，告诉老师重新登录。`, stopped)
          }
          if (transport === 'abort') return prepFailure('cancelled', '工具调用已取消，整课审查没有完成；课程仍停在整课审查，需要时再调用 audit_course。', stopped)
          return prepFailure('model-unavailable', `整课审查时模型通道${TRANSPORT_TEXT[transport] ?? '不可用'}，事实核查没有完成：${details.auditError}。这不是课程内容的问题；过一会儿再调用 audit_course。`, stopped)
        }
        return prepFailure('audit-blocked', `${failure.message} ${details.advice}`, toPrepJson(details))
      }
    },

    async acceptPage(courseId, pageId) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      const session = course.generationSession
      const job = session?.jobs.find((candidate) => candidate.pageId === pageId)
      if (!session || !job) return prepFailure('not-found', PAGE_NOT_FOUND)
      // 闸门：本页必须有当前检查点指向的、与检查点正文修订一致、没有 blocking 问题的截图证据
      const checkpoint = job.checkpoint
      const evidence = checkpoint ? (course.pageRenderEvidence ?? []).find((item) => item.id === checkpoint.renderEvidenceId && item.pageId === pageId) : undefined
      if (!checkpoint || !evidence || evidence.contentRevisionId !== checkpoint.contentRevisionId || evidenceBlocksPage(evidence)) {
        return prepFailure('render-evidence-missing', `第 ${job.order} 页还没有通过截图检查的证据，不能验收：先 render_page，截图通过后再验收。`, toPrepJson({ pageId }))
      }
      try {
        // 迁入的验收服务再查会话状态（待验收）、整课审计与 AI 教学审查记录是否对应当前版本，并按会话版本 CAS
        const next = await services.acceptance.acceptPage(courseId, pageId, session.updatedAt)
        const remaining = unacceptedPageIds(next)
        const accepted = session.jobs.map((candidate) => candidate.pageId).filter((id) => !remaining.includes(id))
        return { ok: true, acceptance: toPrepJson({ accepted, remaining }) }
      } catch (error) {
        return prepFailureOf(error)
      }
    },

    async acceptCourse(courseId) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      const session = course.generationSession
      if (!session) return prepFailure('session-not-ready', '计划还没确认，也没有生成任何页面。')
      // 不在待验收时先说清楚会话处在哪一步，不把全部页列成"没验收"（审查附带项）
      if (session.status !== 'awaiting-teacher-acceptance') {
        return prepFailure('session-not-ready', NEXT_STEP_BY_STATUS[session.status] ?? `生成会话状态为 ${session.status}，整课审查通过后才能整课验收。`)
      }
      const missing = unacceptedPageIds(course)
      if (missing.length > 0) {
        return prepFailure('pages-not-accepted', `还有 ${missing.length} 页没有按当前版本逐页验收，整课验收要求每一页都已验收。`, toPrepJson({ pageIds: missing }))
      }
      let ready: MainlineCourse
      try {
        ready = await services.acceptance.publish(courseId, session.updatedAt)
      } catch (error) {
        return prepFailureOf(error)
      }
      // 同 maolab 验收路由：本课是某门课的修订版时，旧版本标为被替代（3c 裁决 F19：CAS 写入，冲突重读后再试一次）。
      // publish 已经写入，这里的任何失败都不改变"验收成功"，只如实附说明（审查 M1、M2、M3）
      const previousId = ready.revision?.basedOnCourseId
      const marked = previousId ? await markSuperseded(previousId, ready.id) : undefined
      const unmarked = `旧课程 ${previousId} 未标记为已取代，下次整课验收不会再标（本课已是 ready）；需要在工作台处理。`
      const note = !marked || marked.status === 'marked' ? undefined
        : marked.status === 'missing' ? `本课登记为 ${previousId} 的修订版，但读不到这门旧课程（已删除或不在本账号下），没有标记被替代。`
          : marked.status === 'conflict' ? `课程已验收；${unmarked}原因：旧课程连续两次被其他操作同时修改。`
            : `课程已验收；${unmarked}原因：${marked.message}`
      return {
        ok: true,
        acceptance: toPrepJson({
          planStatus: ready.planning?.status ?? null,
          finalSignature: ready.teacherAcceptance?.finalSignature ?? null,
          supersededCourseId: marked?.status === 'marked' ? previousId : null,
          ...(note ? { note } : {}),
        }),
      }
    },

    async exportReadiness(courseId) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      try {
        const plan = planProjectionExport(course)
        return { ok: true, export: toPrepJson({ pageCount: plan.pageCount, filename: plan.filename }) }
      } catch (error) {
        return prepFailureOf(error)
      }
    },

    async publicationDraft(courseId) {
      const snapshot = await store.findMainlineCourseSnapshot(courseId)
      if (!snapshot) return prepFailure('not-found', NOT_FOUND)
      const out = publicationDraftOf(snapshot.course)
      if (!out.ok) return prepFailure(out.reason, out.message, out.blockers ? toPrepJson({ blockers: out.blockers }) : undefined)
      // 同一修订族里有更新的课程时不能发布旧课（终审 M4）：不只看 supersededByCourseId——修订版验收时标记被替代可能失败（acceptCourse 的 note），
      // 那样旧课仍会通过上面的判定，签名不同，会把旧内容发成新的 v(n+1)。"更新"按 newerInFamily 的全序（4b 修同毫秒并列）
      const newer = await newestAbove(snapshot.course)
      if (newer) return prepFailure('not-ready', `这门课所在的修订族里有更新的版本（${newer.course.id}），请发布最新版本。`)
      // 知识点 id 要在知识库里都查得到（Task 4 遗留：kpIdsOf 只做字符串去重，不核对知识库）
      const found = new Set((await deps.knowledge.knowledgePoints(out.draft.kpIds)).map((row) => row.id))
      const missing = out.draft.kpIds.filter((id) => !found.has(id))
      if (missing.length > 0) return prepFailure('no-knowledge-point', `课程关联的知识点在知识库里查不到：${missing.join('、')}，不能进公共库。`, toPrepJson({ kpIds: missing }))
      return {
        ok: true,
        draft: { sourceCourseId: snapshot.course.id, sourceUpdatedAt: snapshot.updatedAt, ...out.draft, snapshot: toPrepJson(out.draft.snapshot) },
      }
    },

    reviseCourse(courseId) {
      // 同一门课的修订串行（同一门面实例内）；跨进程同时修订由 earlierSibling 收敛成一门。原课不写：
      // markSuperseded 只在修订版整课验收时由 acceptCourse 做，与 maolab 相同；即便收敛前留下两门，newerInFamily 的全序也只让一门可发布
      return serial(`revise:${courseId}`, async () => {
        const snapshot = await store.findMainlineCourseSnapshot(courseId)
        if (!snapshot) return prepFailure('not-found', NOT_FOUND)
        const course = snapshot.course
        const existing = (row: ListedMainlineCourse) => {
          const r = revisionOf(row.course)
          return { ok: true as const, revision: toPrepJson({ courseId: row.course.id, familyId: r.familyId, revisionNo: r.revisionNo, basedOnCourseId: r.basedOnCourseId ?? null, existing: true, note: `这门课已经有更新的版本（${row.course.id}），在那门课上继续。` }) }
        }
        const newest = await newestAbove(course)
        if (newest) return existing(newest)
        if (course.planning?.status !== 'ready') return prepFailure('session-not-ready', '这门课还没有整课验收：直接在这门课上修改即可，不需要建修订版。')
        try {
          const next = forkCourseForReplanning(course, (deps.newId ?? randomUUID)())
          // 新 id 的首次写入：存储端口没有"不存在才插入"，这里不是 CAS；并发由 earlierSibling 收敛
          await store.saveMainlineCourse(next)
          const winner = await earlierSibling(next)
          if (winner) {
            await store.deleteMainlineCourse(next.id)
            return existing(winner)
          }
          const r = revisionOf(next)
          return { ok: true, revision: toPrepJson({ courseId: next.id, familyId: r.familyId, revisionNo: r.revisionNo, basedOnCourseId: course.id, existing: false, note: REVISION_NOTE }) }
        } catch (error) {
          return prepFailureOf(error)
        }
      })
    },

    async workbench(courseId) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      const record = course.teachingQualityAudit
      // 当前与否同 maolab PageWorkflowBanner 的 teachingAuditPresentation：审查记录的计划、正文、整课审计版本与输入哈希都与当前一致
      const current = Boolean(record)
        && Boolean(course.generationCourseAudit?.id)
        && record!.planRevisionId === course.planning?.planRevisionId
        && record!.contentRevisionId === course.pageContent?.contentRevisionId
        && record!.generationCourseAuditId === course.generationCourseAudit?.id
        && Boolean(record!.inputHash)
        && record!.inputHash === teachingQualityInputHash(course)
      let exportReady: PrepJson
      try {
        const plan = planProjectionExport(course)
        exportReady = { ok: true, pageCount: plan.pageCount, filename: plan.filename }
      } catch (error) {
        const failure = prepFailureOf(error)
        exportReady = { ok: false, message: failure.ok ? '' : failure.message, blockers: failure.ok ? null : (failure.details ?? null) }
      }
      return {
        ok: true,
        workbench: toPrepJson({
          course,
          summary: courseSummary(course),
          teachingAudit: record ? { status: record.status, state: current ? 'current' : 'stale', findings: teachingFindings(course) } : null,
          // 面板显示整课审查被拦的逐条建议（3c 交接）：与工具返回同一个函数，previousTeachingAuditedAt 不传 = 当前版本的记录都算
          auditBlocked: course.generationSession?.status === 'course-audit' && (course.factAudit || course.teachingQualityAudit) ? auditBlockedDetails(course, undefined) : null,
          unacceptedPageIds: course.generationSession?.status === 'awaiting-teacher-acceptance' || course.generationSession?.status === 'ready' ? unacceptedPageIds(course) : [],
          exportReady,
        }),
      }
    },

    async rehearse(courseId, runtime) {
      const course = await store.findMainlineCourse(courseId)
      if (!course) return prepFailure('not-found', NOT_FOUND)
      const planned = course.planning?.pages.length ?? 0
      if (planned === 0 || (course.pageContent?.pages.length ?? 0) !== planned) {
        return prepFailure('session-not-ready', '全部页面生成完成后才能试学。')
      }
      if (!runtime.llm) return modelChannelMissing()
      try {
        // 迁入的 AI 试学：一次逻辑调用（defaultLLM maxAttempts 2，模型输出不合格或出错时最多 2 次尝试），
        // 系统提示词只有目标学段学生人设；只读课程、不落库（tryout.ts 文件头）
        const report = await runWithCourseRuntime(runtime, () => tryoutCourse(course))
        return { ok: true, report: toPrepJson(report) }
      } catch (error) {
        return prepFailureOf(error)
      }
    },
  }
}
