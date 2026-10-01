import { createHash } from 'node:crypto'
import type { MainlineCourse } from './domain.js'

export const GENERATION_SESSION_SCHEMA_VERSION = 'mainline-generation-session-v1' as const
export const MAX_AUTOMATIC_PAGE_ATTEMPTS = 2

export type GenerationSessionStatus =
  | 'generating'
  | 'rendering'
  | 'course-audit'
  | 'awaiting-teacher-acceptance'
  | 'ready'
  | 'failed'
  | 'cancelled'

export type PageGenerationJobStatus = 'queued' | 'running' | 'content-ready' | 'blocked' | 'passed' | 'cancelled'

export type GenerationFailureKind =
  | 'validation_error'
  | 'source_error'
  | 'model_error'
  | 'render_error'
  | 'transient_error'
  | 'conflict_error'

export interface PageGenerationDiagnostic {
  kind: GenerationFailureKind
  message: string
  at: string
  attempt: number
}

export interface PageCheckpoint {
  pageId: string
  planRevisionId: string
  inputHash: string
  contentRevisionId: string
  factAuditRevisionId: string
  renderEvidenceId: string
  createdAt: string
}

export interface PageRenderIssue {
  code: 'stage-size' | 'font-size' | 'clipping' | 'text-overlap' | 'broken-image' | 'missing-visual' | 'sparse-layout'
  severity: 'blocking' | 'warning'
  message: string
}

export interface PageRenderEvidence {
  schemaVersion: 'mainline-page-render-v1'
  id: string
  courseId: string
  pageId: string
  planRevisionId: string
  contentRevisionId: string
  screenshotPath: string
  screenshotSha256: string
  viewport: { width: 1920; height: 1080 }
  metrics: {
    minimumFontPx: number | null
    clippedElementCount: number
    overlappingTextCount: number
    brokenImageCount: number
    visualElementCount: number
    occupiedAreaRatio: number
  }
  issues: PageRenderIssue[]
  createdAt: string
}

export interface GenerationCourseAuditRecord {
  schemaVersion: 'mainline-course-audit-v1'
  id: string
  courseId: string
  planRevisionId: string
  contentRevisionId: string
  renderEvidenceIds: string[]
  pageIds: string[]
  factAuditAt: string
  passedAt: string
}

export type TeachingQualityStandardSource = 'official-requirement' | 'research-supported' | 'product-operationalization'
export type TeachingQualityAuditSeverity = 'blocking' | 'warning' | 'insufficient-evidence'

export interface TeachingQualityStandard {
  id: string
  title: string
  sourceType: TeachingQualityStandardSource
  sourceUrl: string
  applicability: string
  limitation?: string
}

export interface TeachingQualityAuditFinding {
  id: string
  standardId: string
  pageId: string
  severity: TeachingQualityAuditSeverity
  category: 'goal-alignment' | 'materials' | 'progression' | 'information-gain' | 'answer-separation' | 'visual-purpose' | 'teacher-companion' | 'standards-evidence'
  evidence: string
  impact: string
  fix: string
}

/** 自动化教学审查记录；它不构成教师验收或发布签名。 */
export interface TeachingQualityAuditRecord {
  schemaVersion: 'mainline-teaching-quality-audit-v1'
  id: string
  /** Stable signature of the complete review input. Missing legacy values fail release gates closed. */
  inputHash?: string
  courseId: string
  planRevisionId: string
  contentRevisionId: string
  generationCourseAuditId: string
  standards: TeachingQualityStandard[]
  findings: TeachingQualityAuditFinding[]
  status: 'passed' | 'blocked' | 'insufficient-evidence'
  auditedAt: string
}

export interface TeacherPageAcceptance {
  pageId: string
  contentRevisionId: string
  renderEvidenceId: string
  acceptedAt: string
}

export interface TeacherAcceptanceRecord {
  schemaVersion: 'mainline-teacher-acceptance-v1'
  courseId: string
  planRevisionId: string
  courseAuditId: string
  pages: TeacherPageAcceptance[]
  finalSignature?: string
  acceptedAt?: string
}

export interface PageContentCheckpoint {
  pageId: string
  planRevisionId: string
  inputHash: string
  contentRevisionId: string
  factAuditRevisionId: string
  createdAt: string
}

export interface PageGenerationJob {
  pageId: string
  order: number
  planRevisionId: string
  attempt: number
  status: PageGenerationJobStatus
  inputHash?: string
  contentCheckpoint?: PageContentCheckpoint
  checkpoint?: PageCheckpoint
  diagnostics: PageGenerationDiagnostic[]
  updatedAt: string
}

export interface GenerationSession {
  schemaVersion: typeof GENERATION_SESSION_SCHEMA_VERSION
  id: string
  courseId: string
  planRevisionId: string
  status: GenerationSessionStatus
  currentPageId?: string
  jobs: PageGenerationJob[]
  createdAt: string
  updatedAt: string
}

export function createGenerationSession(
  course: MainlineCourse,
  sessionId: string,
  now = new Date().toISOString(),
): GenerationSession {
  const planning = course.planning
  if (!planning) throw new Error('createGenerationSession: 课程缺少页面计划。')
  if (planning.status !== 'plan-approved') {
    throw new Error(`createGenerationSession: 页面计划必须先确认，实际为 ${planning.status}。`)
  }
  if (!sessionId.trim()) throw new Error('createGenerationSession: 会话 ID 不能为空。')

  return {
    schemaVersion: GENERATION_SESSION_SCHEMA_VERSION,
    id: sessionId,
    courseId: course.id,
    planRevisionId: planning.planRevisionId,
    status: 'generating',
    jobs: planning.pages.map(page => ({
      pageId: page.id,
      order: page.order,
      planRevisionId: planning.planRevisionId,
      attempt: 0,
      status: 'queued',
      diagnostics: [],
      updatedAt: now,
    })),
    createdAt: now,
    updatedAt: now,
  }
}

export function attachGenerationSession(course: MainlineCourse, session: GenerationSession): MainlineCourse {
  assertSessionMatchesCourse(course, session)
  return { ...course, generationSession: session }
}

export function startPageGeneration(
  session: GenerationSession,
  pageId: string,
  inputHash: string,
  now = new Date().toISOString(),
): GenerationSession {
  assertMutableSession(session, 'startPageGeneration')
  if (!inputHash.trim()) throw new Error('startPageGeneration: 输入哈希不能为空。')
  if (session.jobs.some(job => job.status === 'running')) {
    const running = session.jobs.find(job => job.status === 'running')!
    if (running.pageId === pageId && running.inputHash === inputHash) return session
    throw new Error(`startPageGeneration: 页面 ${running.pageId} 正在生成，不能并行启动 ${pageId}。`)
  }

  const index = session.jobs.findIndex(job => job.pageId === pageId)
  if (index < 0) throw new Error(`startPageGeneration: 页面计划中不存在 ${pageId}。`)
  let job = session.jobs[index]!
  const unfinishedBefore = session.jobs.slice(0, index).find(candidate => (
    candidate.status !== 'content-ready' && candidate.status !== 'passed'
  ))
  if (unfinishedBefore) {
    throw new Error(`startPageGeneration: 必须先完成页面 ${unfinishedBefore.pageId}。`)
  }
  if ((job.status === 'content-ready' || job.status === 'passed') && job.inputHash === inputHash) return session
  if (job.status === 'blocked' || job.status === 'cancelled') {
    throw new Error(`startPageGeneration: 页面 ${pageId} 当前为 ${job.status}，必须先显式恢复。`)
  }

  let baseSession = session
  if ((job.status === 'content-ready' || job.status === 'passed') && job.inputHash !== inputHash) {
    baseSession = invalidateFromPage(session, index, now)
    job = baseSession.jobs[index]!
  }
  const { checkpoint: previousCheckpoint, ...jobWithoutCheckpoint } = job
  return updateJob(baseSession, index, {
    ...jobWithoutCheckpoint,
    attempt: job.inputHash === inputHash ? job.attempt + 1 : 1,
    status: 'running',
    inputHash,
    ...(job.inputHash === inputHash && previousCheckpoint ? { checkpoint: previousCheckpoint } : {}),
    diagnostics: job.inputHash === inputHash ? job.diagnostics : [],
    updatedAt: now,
  }, now, pageId)
}

function invalidateFromPage(session: GenerationSession, index: number, now: string): GenerationSession {
  return {
    ...withoutCurrentPage(session),
    status: 'generating',
    jobs: session.jobs.map((job, jobIndex) => {
      if (jobIndex < index) return job
      const { checkpoint: _checkpoint, contentCheckpoint: _contentCheckpoint, inputHash: _inputHash, ...rest } = job
      return {
        ...rest,
        attempt: 0,
        status: 'queued' as const,
        diagnostics: [],
        updatedAt: now,
      }
    }),
    updatedAt: now,
  }
}

export function completePageGeneration(
  session: GenerationSession,
  checkpoint: PageCheckpoint,
  now = new Date().toISOString(),
): GenerationSession {
  assertMutableSession(session, 'completePageGeneration')
  const index = session.jobs.findIndex(job => job.pageId === checkpoint.pageId)
  if (index < 0) throw new Error(`completePageGeneration: 页面计划中不存在 ${checkpoint.pageId}。`)
  const job = session.jobs[index]!
  if (job.status === 'passed' && sameCheckpoint(job.checkpoint, checkpoint)) return session
  if (job.status !== 'content-ready' || !job.contentCheckpoint) {
    throw new Error(`completePageGeneration: 页面 ${checkpoint.pageId} 尚未完成正文与事实核查。`)
  }
  if (checkpoint.planRevisionId !== session.planRevisionId || checkpoint.planRevisionId !== job.planRevisionId) {
    throw new Error('completePageGeneration: 检查点不属于当前页面计划版本。')
  }
  if (checkpoint.inputHash !== job.inputHash) {
    throw new Error('completePageGeneration: 检查点输入与当前生成任务不一致。')
  }
  if (
    checkpoint.contentRevisionId !== job.contentCheckpoint.contentRevisionId
    || checkpoint.factAuditRevisionId !== job.contentCheckpoint.factAuditRevisionId
  ) {
    throw new Error('completePageGeneration: 渲染证据与当前正文或事实核查版本不一致。')
  }
  assertCompleteCheckpoint(checkpoint)

  const jobs = replaceAt(session.jobs, index, { ...job, status: 'passed', checkpoint, updatedAt: now })
  const allPassed = jobs.every(candidate => candidate.status === 'passed')
  return {
    ...withoutCurrentPage(session),
    jobs,
    status: allPassed ? 'course-audit' : 'rendering',
    updatedAt: now,
  }
}

export function completePageContent(
  session: GenerationSession,
  checkpoint: PageContentCheckpoint,
  now = new Date().toISOString(),
): GenerationSession {
  assertMutableSession(session, 'completePageContent')
  const index = session.jobs.findIndex(job => job.pageId === checkpoint.pageId)
  if (index < 0) throw new Error(`completePageContent: 页面计划中不存在 ${checkpoint.pageId}。`)
  const job = session.jobs[index]!
  if (job.status === 'content-ready' && sameContentCheckpoint(job.contentCheckpoint, checkpoint)) return session
  if (job.status !== 'running') throw new Error(`completePageContent: 页面 ${checkpoint.pageId} 尚未处于生成状态。`)
  if (checkpoint.planRevisionId !== session.planRevisionId || checkpoint.planRevisionId !== job.planRevisionId) {
    throw new Error('completePageContent: 检查点不属于当前页面计划版本。')
  }
  if (checkpoint.inputHash !== job.inputHash) {
    throw new Error('completePageContent: 检查点输入与当前生成任务不一致。')
  }
  if ([checkpoint.contentRevisionId, checkpoint.factAuditRevisionId, checkpoint.createdAt].some(value => !value.trim())) {
    throw new Error('completePageContent: 检查点缺少正文或事实核查证据。')
  }

  const jobs = replaceAt(session.jobs, index, {
    ...job,
    status: 'content-ready',
    contentCheckpoint: checkpoint,
    updatedAt: now,
  })
  const allContentReady = jobs.every(candidate => candidate.status === 'content-ready' || candidate.status === 'passed')
  return {
    ...withoutCurrentPage(session),
    jobs,
    status: allContentReady ? 'rendering' : 'generating',
    updatedAt: now,
  }
}

/**
 * 学生可见正文发生局部变化后，只让这一页重新通过渲染门禁；其他页面的正文、
 * 事实检查点和真实截图证据保持有效。
 */
export function revisePageContent(
  session: GenerationSession,
  checkpoint: PageContentCheckpoint,
  now = new Date().toISOString(),
): GenerationSession {
  const index = session.jobs.findIndex(job => job.pageId === checkpoint.pageId)
  if (index < 0) throw new Error(`revisePageContent: 页面计划中不存在 ${checkpoint.pageId}。`)
  const job = session.jobs[index]!
  const previous = job.contentCheckpoint ?? job.checkpoint
  if (!previous) throw new Error(`revisePageContent: 页面 ${checkpoint.pageId} 尚无可修订正文。`)
  if (checkpoint.planRevisionId !== session.planRevisionId || checkpoint.planRevisionId !== job.planRevisionId) {
    throw new Error('revisePageContent: 页面修订不属于当前页面计划版本。')
  }
  if (checkpoint.inputHash !== previous.inputHash) {
    throw new Error('revisePageContent: 页面修订与当前页面输入不一致。')
  }
  if ([checkpoint.contentRevisionId, checkpoint.factAuditRevisionId, checkpoint.createdAt].some(value => !value.trim())) {
    throw new Error('revisePageContent: 页面修订检查点不完整。')
  }

  const { checkpoint: _checkpoint, ...withoutRenderCheckpoint } = job
  const jobs = replaceAt(session.jobs, index, {
    ...withoutRenderCheckpoint,
    status: 'content-ready',
    contentCheckpoint: checkpoint,
    updatedAt: now,
  })
  return {
    ...withoutCurrentPage(session),
    jobs,
    status: 'rendering',
    updatedAt: now,
  }
}

export const revisePageImageContent = revisePageContent

export function failPageGeneration(
  session: GenerationSession,
  pageId: string,
  kind: GenerationFailureKind,
  message: string,
  now = new Date().toISOString(),
): GenerationSession {
  assertMutableSession(session, 'failPageGeneration')
  const index = session.jobs.findIndex(job => job.pageId === pageId)
  if (index < 0) throw new Error(`failPageGeneration: 页面计划中不存在 ${pageId}。`)
  const job = session.jobs[index]!
  if (job.status !== 'running') throw new Error(`failPageGeneration: 页面 ${pageId} 尚未处于生成状态。`)

  const retryable = kind === 'model_error' || kind === 'transient_error'
  const canRetry = retryable && job.attempt < MAX_AUTOMATIC_PAGE_ATTEMPTS
  const diagnostic: PageGenerationDiagnostic = {
    kind,
    message: message.trim() || '未提供失败原因。',
    at: now,
    attempt: job.attempt,
  }
  return updateJob(session, index, {
    ...job,
    status: canRetry ? 'queued' : 'blocked',
    diagnostics: [...job.diagnostics, diagnostic],
    updatedAt: now,
  }, now)
}

export function resumeBlockedPage(
  session: GenerationSession,
  pageId: string,
  now = new Date().toISOString(),
): GenerationSession {
  if (session.status === 'ready') throw new Error('resumeBlockedPage: 已发布会话不能恢复页面任务。')
  const index = session.jobs.findIndex(job => job.pageId === pageId)
  if (index < 0) throw new Error(`resumeBlockedPage: 页面计划中不存在 ${pageId}。`)
  const job = session.jobs[index]!
  if (job.status !== 'blocked' && job.status !== 'cancelled') return session
  return updateJob({ ...session, status: 'generating' }, index, {
    ...job,
    status: 'queued',
    updatedAt: now,
  }, now)
}

export function recoverInterruptedGeneration(
  session: GenerationSession,
  now = new Date().toISOString(),
): GenerationSession {
  if (session.status === 'ready') return session
  let changed = false
  const jobs = session.jobs.map(job => {
    if (job.status !== 'running' && !(session.status === 'cancelled' && job.status === 'cancelled')) return job
    changed = true
    return { ...job, status: 'queued' as const, updatedAt: now }
  })
  if (!changed && session.status !== 'cancelled' && session.status !== 'failed') return session
  return { ...withoutCurrentPage(session), jobs, status: 'generating', updatedAt: now }
}

export function cancelGenerationSession(
  session: GenerationSession,
  now = new Date().toISOString(),
): GenerationSession {
  if (session.status === 'ready' || session.status === 'cancelled') return session
  return {
    ...withoutCurrentPage(session),
    status: 'cancelled',
    jobs: session.jobs.map(job => (
      job.status === 'content-ready' || job.status === 'passed'
        ? job
        : { ...job, status: 'cancelled', updatedAt: now }
    )),
    updatedAt: now,
  }
}

export function markCourseAuditPassed(
  session: GenerationSession,
  now = new Date().toISOString(),
): GenerationSession {
  if (session.status !== 'course-audit' || session.jobs.some(job => job.status !== 'passed')) {
    throw new Error('markCourseAuditPassed: 所有页面通过后才能完成整课核查。')
  }
  return { ...session, status: 'awaiting-teacher-acceptance', updatedAt: now }
}

export function markTeacherAccepted(
  session: GenerationSession,
  now = new Date().toISOString(),
): GenerationSession {
  if (session.status !== 'awaiting-teacher-acceptance') {
    throw new Error('markTeacherAccepted: 整课核查通过后才能接受课程。')
  }
  return { ...session, status: 'ready', updatedAt: now }
}

export function generationInputHash(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('hex')
}

function assertSessionMatchesCourse(course: MainlineCourse, session: GenerationSession): void {
  if (session.courseId !== course.id) throw new Error('attachGenerationSession: 会话不属于当前课程。')
  if (!course.planning || session.planRevisionId !== course.planning.planRevisionId) {
    throw new Error('attachGenerationSession: 会话不属于当前页面计划版本。')
  }
  const planned = course.planning.pages.map(page => `${page.order}:${page.id}`)
  const jobs = session.jobs.map(job => `${job.order}:${job.pageId}`)
  if (planned.length !== jobs.length || planned.some((value, index) => value !== jobs[index])) {
    throw new Error('attachGenerationSession: 会话任务与当前页面计划不一致。')
  }
}

function assertMutableSession(session: GenerationSession, operation: string): void {
  if (session.status === 'cancelled' || session.status === 'failed' || session.status === 'ready') {
    throw new Error(`${operation}: 会话状态 ${session.status} 不允许继续生成。`)
  }
}

function assertCompleteCheckpoint(checkpoint: PageCheckpoint): void {
  const required = [
    checkpoint.contentRevisionId,
    checkpoint.factAuditRevisionId,
    checkpoint.renderEvidenceId,
    checkpoint.createdAt,
  ]
  if (required.some(value => !value.trim())) {
    throw new Error('completePageGeneration: 检查点缺少正文、事实核查或真实渲染证据。')
  }
}

function updateJob(
  session: GenerationSession,
  index: number,
  job: PageGenerationJob,
  now: string,
  currentPageId?: string,
): GenerationSession {
  return {
    ...withoutCurrentPage(session),
    jobs: replaceAt(session.jobs, index, job),
    status: 'generating',
    ...(currentPageId ? { currentPageId } : {}),
    updatedAt: now,
  }
}

function withoutCurrentPage(session: GenerationSession): Omit<GenerationSession, 'currentPageId'> {
  const { currentPageId: _currentPageId, ...rest } = session
  return rest
}

function replaceAt<T>(items: readonly T[], index: number, value: T): T[] {
  return items.map((item, itemIndex) => itemIndex === index ? value : item)
}

function sameCheckpoint(left: PageCheckpoint | undefined, right: PageCheckpoint): boolean {
  return Boolean(left)
    && left!.pageId === right.pageId
    && left!.planRevisionId === right.planRevisionId
    && left!.inputHash === right.inputHash
    && left!.contentRevisionId === right.contentRevisionId
    && left!.factAuditRevisionId === right.factAuditRevisionId
    && left!.renderEvidenceId === right.renderEvidenceId
}

function sameContentCheckpoint(left: PageContentCheckpoint | undefined, right: PageContentCheckpoint): boolean {
  return Boolean(left)
    && left!.pageId === right.pageId
    && left!.planRevisionId === right.planRevisionId
    && left!.inputHash === right.inputHash
    && left!.contentRevisionId === right.contentRevisionId
    && left!.factAuditRevisionId === right.factAuditRevisionId
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
    return `{${entries.join(',')}}`
  }
  return JSON.stringify(value) ?? 'undefined'
}
