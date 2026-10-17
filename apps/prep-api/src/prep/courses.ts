// 3d：api 侧的备课门面（与 3c 对话工具同一个 PrepFacade）。只做不调模型的轻操作：门面从不拿到 runtime，模型步骤只经对话工具走会话凭证。
// 按 owner 缓存门面（LRU，上限 512，同 bundle 的 yunyi-prep）；owner 只来自已鉴权的账号用户名。
// api 与 harness 各有一个门面实例：跨进程靠 CAS；面板写操作在 owner 有进行中的对话回合时由路由先拒（PREP_TURN_RUNNING）。
import type pg from 'pg'
import { PgCourseArtifacts, PgCourseDocuments, PgCourseKnowledge, PgRenderJobs, type OwnerArtifacts, type OwnerRenderJobs, type RenderJob } from '@maolab/domain'
import type { PrepFacade, PrepFailure, PrepFailureReason, PrepJson } from '@maolab/course/services/prep-facade-types'
import type { PrepConfig } from './config.ts'
import { loadCourseApi, type CourseApi } from './course-loader.ts'

const STATUS: Record<PrepFailureReason, number> = {
  'not-found': 404, 'invalid-input': 400, 'unknown-kp': 400,
  'plan-conflict': 409, 'write-conflict': 409, 'session-conflict': 409, cancelled: 409,
  'session-not-ready': 422, 'page-blocked': 422, 'images-unavailable': 422, 'render-evidence-missing': 422,
  'pages-not-accepted': 422, 'audit-blocked': 422, 'not-ready': 422, 'no-knowledge-point': 422,
  'model-channel-missing': 503, 'model-unavailable': 503, failed: 500,
}
export const httpStatusOf = (reason: PrepFailureReason): number => STATUS[reason] ?? 500
/** 门面的 message 是写给老师与模型的中文说明；failed 的 message 只带错误类型（3c M4），对浏览器换成固定文案 */
export function failureBody(failure: PrepFailure): { error: string; reason: PrepFailureReason; details?: PrepJson } {
  return {
    error: failure.reason === 'failed' ? '操作没有完成，请稍后重试。' : failure.message,
    reason: failure.reason,
    ...(failure.details !== undefined && failure.reason !== 'failed' ? { details: failure.details } : {}),
  }
}

export function jobDto(job: RenderJob) {
  const result = (job.result ?? null) as { blocked?: unknown; skipped?: unknown; url?: unknown; filename?: unknown; expiresAt?: unknown } | null
  return {
    jobId: job.id,
    kind: job.kind,
    pageId: typeof job.payload.pageId === 'string' ? job.payload.pageId : null,
    status: job.status,
    attempts: job.attempts,
    error: job.error ? { code: job.error.code, message: job.error.message } : null,
    result: result ? {
      blocked: result.blocked ?? null, skipped: result.skipped ?? null,
      url: typeof result.url === 'string' ? result.url : null,
      filename: typeof result.filename === 'string' ? result.filename : null,
      expiresAt: typeof result.expiresAt === 'number' ? result.expiresAt : null,
    } : null,
    createdAt: job.createdAt,
    finishedAt: job.finishedAt,
  }
}

export class PrepCourses {
  private readonly documents: PgCourseDocuments
  private readonly knowledge: PgCourseKnowledge
  private readonly renderJobs: PgRenderJobs
  private readonly artifactStore: PgCourseArtifacts
  private readonly load: () => Promise<CourseApi>
  private readonly maxOwners: number
  private readonly facades = new Map<string, PrepFacade>()
  private api: CourseApi | undefined

  constructor(deps: { pool: pg.Pool; prep: PrepConfig; load?: () => Promise<CourseApi>; maxOwners?: number }) {
    this.documents = new PgCourseDocuments(deps.pool, { schema: deps.prep.courseSchema })
    this.knowledge = new PgCourseKnowledge(deps.pool, { schema: deps.prep.knowledgeSchema })
    this.renderJobs = new PgRenderJobs(deps.pool, { schema: deps.prep.courseSchema })
    this.artifactStore = new PgCourseArtifacts(deps.pool, { schema: deps.prep.courseSchema })
    this.load = deps.load ?? loadCourseApi
    this.maxOwners = deps.maxOwners ?? 512
  }

  /** 课程模块是否已加载（启动与 /api/prep/status 不加载，首个课程请求才加载） */
  loaded(): boolean { return this.api !== undefined }

  async facade(owner: string): Promise<PrepFacade> {
    if (!owner.trim()) throw new Error('prep owner is required')
    const cached = this.take(owner)
    if (cached) return cached
    this.api = this.api ?? (await this.load())
    // 等加载时同一 owner 的并发首次请求可能已建好门面：共用它
    const raced = this.take(owner)
    if (raced) return raced
    const facade = this.api.createPrepFacade({ documents: this.documents.forOwner(owner), knowledge: this.knowledge })
    this.facades.set(owner, facade)
    if (this.facades.size > this.maxOwners) {
      const oldest = this.facades.keys().next()
      if (!oldest.done) this.facades.delete(oldest.value)
    }
    return facade
  }

  jobs(owner: string): OwnerRenderJobs { return this.renderJobs.forOwner(owner) }
  artifacts(owner: string): OwnerArtifacts { return this.artifactStore.forOwner(owner) }

  /** 取缓存并标为最近使用 */
  private take(owner: string): PrepFacade | undefined {
    const cached = this.facades.get(owner)
    if (cached) {
      this.facades.delete(owner)
      this.facades.set(owner, cached)
    }
    return cached
  }
}
