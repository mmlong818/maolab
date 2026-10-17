// 渲染任务队列（3b，spec 4.2"api 到 render-worker 经队列"）。api 与 harness 的工具只投任务、持句柄；workers/render 领任务。
// 领取：FOR UPDATE SKIP LOCKED，两个 worker 不会拿到同一行；领取即 attempts + 1 并设租约。
// 栅栏：完成、失败、续租都要求 (id, status = running, lease_holder, attempts) 与领取时一致；租约过期被别人接走后，旧 worker 的写入不生效。
// 顺序：id = rj_<20 位补零的投递事务号 pg_current_xact_id()>_<uuid>，事务号全库单调递增；同一毫秒投递的任务按 id（C 排序）排，领取顺序与投递顺序一致（Ruling [T8/T9/T12]）。
import { randomUUID } from 'node:crypto'
import type pg from 'pg'

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/
const check = (schema: string): string => { if (!SCHEMA_RE.test(schema)) throw new Error(`invalid schema name: ${schema}`); return schema }
const KINDS = ['render-page', 'export-pptx'] as const

export type RenderJobKind = (typeof KINDS)[number]
export type RenderJobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface RenderJobError {
  code: string
  message: string
  retryable: boolean
  details?: unknown
}

export interface RenderJob {
  id: string
  owner: string
  courseId: string
  kind: RenderJobKind
  requestKey: string
  payload: Record<string, unknown>
  status: RenderJobStatus
  attempts: number
  maxAttempts: number
  availableAt: number
  leaseHolder: string | null
  leaseExpiresAt: number | null
  result: unknown
  error: RenderJobError | null
  createdAt: number
  updatedAt: number
  finishedAt: number | null
}

export interface EnqueueRenderJob {
  courseId: string
  kind: RenderJobKind
  /** 调用方的幂等键（3c 用工具调用 id，3d 用请求 id）；同一 owner 内唯一 */
  requestKey: string
  payload?: Record<string, unknown>
  maxAttempts?: number
}

export class RenderJobCourseNotFoundError extends Error {
  readonly code = 'COURSE_NOT_FOUND'
  readonly courseId: string
  constructor(courseId: string) {
    super(`course ${courseId} not found for this owner`)
    this.name = 'RenderJobCourseNotFoundError'
    this.courseId = courseId
  }
}

export class RenderJobKeyConflictError extends Error {
  readonly code = 'REQUEST_KEY_CONFLICT'
  readonly requestKey: string
  constructor(requestKey: string) {
    super(`request key ${requestKey} was already used for a different course or kind`)
    this.name = 'RenderJobKeyConflictError'
    this.requestKey = requestKey
  }
}

export interface OwnerRenderJobs {
  enqueue(input: EnqueueRenderJob): Promise<{ job: RenderJob; created: boolean }>
  get(id: string): Promise<RenderJob | undefined>
  /** 新的在前 */
  listForCourse(courseId: string, limit?: number): Promise<RenderJob[]>
}

export type RenderJobFailOutcome = 'retry' | 'failed' | 'lost'

interface DbRow {
  id: string; owner: string; course_id: string; kind: RenderJobKind; request_key: string; payload: Record<string, unknown>
  status: RenderJobStatus; attempts: number; max_attempts: number; available_at: string; lease_holder: string | null
  lease_expires_at: string | null; result: unknown; error: RenderJobError | null; created_at: string; updated_at: string; finished_at: string | null
}
const COLUMNS = 'id, owner, course_id, kind, request_key, payload, status, attempts, max_attempts, available_at, lease_holder, lease_expires_at, result, error, created_at, updated_at, finished_at'
const num = (v: string | null): number | null => (v === null ? null : Number(v))
const toJob = (r: DbRow): RenderJob => ({
  id: r.id, owner: r.owner, courseId: r.course_id, kind: r.kind, requestKey: r.request_key, payload: r.payload ?? {},
  status: r.status, attempts: Number(r.attempts), maxAttempts: Number(r.max_attempts), availableAt: Number(r.available_at),
  leaseHolder: r.lease_holder, leaseExpiresAt: num(r.lease_expires_at), result: r.result ?? null, error: r.error ?? null,
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at), finishedAt: num(r.finished_at),
})

export class PgRenderJobs {
  readonly schema: string
  private readonly pool: pg.Pool
  private readonly now: () => number

  constructor(pool: pg.Pool, options: { schema?: string; now?: () => number } = {}) {
    this.pool = pool
    this.schema = check(options.schema ?? 'course')
    this.now = options.now ?? Date.now
  }

  private get table(): string {
    return `"${this.schema}"."render_jobs"`
  }

  forOwner(owner: string): OwnerRenderJobs {
    if (!owner.trim()) throw new Error('render job owner is required')
    return {
      enqueue: (input) => this.enqueue(owner, input),
      get: async (id) => {
        const r = await this.pool.query<DbRow>(`select ${COLUMNS} from ${this.table} where id = $1 and owner = $2`, [id, owner])
        return r.rows[0] ? toJob(r.rows[0]) : undefined
      },
      listForCourse: async (courseId, limit = 20) => {
        const r = await this.pool.query<DbRow>(
          `select ${COLUMNS} from ${this.table} where owner = $1 and course_id = $2 order by created_at desc, id collate "C" desc limit $3`,
          [owner, courseId, Math.max(1, Math.min(limit, 100))],
        )
        return r.rows.map(toJob)
      },
    }
  }

  private async enqueue(owner: string, input: EnqueueRenderJob): Promise<{ job: RenderJob; created: boolean }> {
    if (!KINDS.includes(input.kind)) throw new Error(`unknown render job kind: ${String(input.kind)}`)
    if (!input.requestKey.trim() || input.requestKey.length > 200) throw new Error('requestKey must be 1–200 characters')
    // render-page 只截任务点名的那一页（崩溃重跑保护靠它）：没有 pageId 的任务会替会话里任意下一页截图，投递时就拒绝
    const pageId = input.payload?.pageId
    if (input.kind === 'render-page' && (typeof pageId !== 'string' || !pageId.trim())) {
      throw new Error('render-page jobs require payload.pageId (a non-empty string naming the page to render)')
    }
    const maxAttempts = input.maxAttempts ?? 3
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) throw new Error('maxAttempts must be 1–10')
    const now = this.now()
    const inserted = await this.pool.query<DbRow>(
      `insert into ${this.table} (id, owner, course_id, kind, request_key, payload, status, attempts, max_attempts, available_at, created_at, updated_at)
       select 'rj_' || lpad(pg_current_xact_id()::text, 20, '0') || '_' || $1, $2, $3, $4, $5, $6::json, 'queued', 0, $7, $8, $8, $8
       where exists (select 1 from "${this.schema}"."documents" where id = $3 and owner = $2 and kind = 'course')
       on conflict (owner, request_key) do nothing
       returning ${COLUMNS}`,
      [randomUUID(), owner, input.courseId, input.kind, input.requestKey, JSON.stringify(input.payload ?? {}), maxAttempts, now],
    )
    if (inserted.rows[0]) return { job: toJob(inserted.rows[0]), created: true }
    const existing = await this.pool.query<DbRow>(`select ${COLUMNS} from ${this.table} where owner = $1 and request_key = $2`, [owner, input.requestKey])
    const row = existing.rows[0]
    if (!row) throw new RenderJobCourseNotFoundError(input.courseId)
    if (row.course_id !== input.courseId || row.kind !== input.kind) throw new RenderJobKeyConflictError(input.requestKey)
    return { job: toJob(row), created: false }
  }

  async claim(holder: string, leaseMs: number): Promise<RenderJob | undefined> {
    const now = this.now()
    // 最后一次尝试的租约已过期：不再重跑，直接判失败
    await this.pool.query(
      `update ${this.table} set status = 'failed', lease_holder = null, lease_expires_at = null, finished_at = $1, updated_at = $1,
         error = json_build_object('code', 'LEASE_EXHAUSTED', 'message', '渲染任务多次中断，已放弃。', 'retryable', false)
       where status = 'running' and lease_expires_at < $1 and attempts >= max_attempts`,
      [now],
    )
    const r = await this.pool.query<DbRow>(
      `with next as (
         select id from ${this.table}
         where (status = 'queued' and available_at <= $1) or (status = 'running' and lease_expires_at < $1 and attempts < max_attempts)
         order by available_at, created_at, id collate "C"
         for update skip locked
         limit 1
       )
       update ${this.table} j set status = 'running', attempts = j.attempts + 1, lease_holder = $2, lease_expires_at = $3, updated_at = $1
       from next where j.id = next.id
       returning ${COLUMNS.split(', ').map((c) => `j.${c}`).join(', ')}`,
      [now, holder, now + leaseMs],
    )
    return r.rows[0] ? toJob(r.rows[0]) : undefined
  }

  private fence = `id = $1 and status = 'running' and lease_holder = $2 and attempts = $3`

  async heartbeat(job: RenderJob, holder: string, leaseMs: number): Promise<boolean> {
    const now = this.now()
    const r = await this.pool.query(`update ${this.table} set lease_expires_at = $4, updated_at = $5 where ${this.fence}`, [job.id, holder, job.attempts, now + leaseMs, now])
    return r.rowCount === 1
  }

  async complete(job: RenderJob, holder: string, result: unknown): Promise<boolean> {
    const now = this.now()
    const r = await this.pool.query(
      `update ${this.table} set status = 'succeeded', result = $4::json, error = null, lease_holder = null, lease_expires_at = null, finished_at = $5, updated_at = $5
       where ${this.fence}`,
      [job.id, holder, job.attempts, JSON.stringify(result ?? null), now],
    )
    return r.rowCount === 1
  }

  async fail(job: RenderJob, holder: string, error: RenderJobError, backoffMs: number): Promise<RenderJobFailOutcome> {
    const now = this.now()
    const retry = error.retryable && job.attempts < job.maxAttempts
    const r = retry
      ? await this.pool.query(
        `update ${this.table} set status = 'queued', error = $4::json, lease_holder = null, lease_expires_at = null, available_at = $5, updated_at = $6
         where ${this.fence}`,
        [job.id, holder, job.attempts, JSON.stringify(error), now + Math.max(0, backoffMs), now],
      )
      : await this.pool.query(
        `update ${this.table} set status = 'failed', error = $4::json, lease_holder = null, lease_expires_at = null, finished_at = $5, updated_at = $5
         where ${this.fence}`,
        [job.id, holder, job.attempts, JSON.stringify(error), now],
      )
    if (r.rowCount !== 1) return 'lost'
    return retry ? 'retry' : 'failed'
  }
}
