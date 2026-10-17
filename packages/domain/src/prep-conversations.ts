// 3d：备课对话的会话与回合（spec 7.1"api 管人：归属、幂等、记账"、8.2 备课场景排队）。owner = 账号用户名，不是学习者档案 id。
// 回合 id 就是交给 harness 的 messageId（UUID）；同一会话内 requestId 唯一，内容哈希不同即冲突（与 2e learning_runs 同一规则）。
// 所有读写都按 owner 过滤：别人的会话与回合一律查不到（不区分"不存在"与"属于别人"）。
// startRun 在事务里先锁会话行，同一会话的并发占位串行：同 requestId 只有一个拿到 claimed。
// claim 是领取版本（栅栏）：每次（重新）领取加一；completeRun/failRun 必须带上领取时拿到的 claim，不一致（已被别人回收）或已结束都返回 false。
import { randomUUID } from 'node:crypto'
import type pg from 'pg'

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/
const check = (schema: string): string => { if (!SCHEMA_RE.test(schema)) throw new Error(`invalid schema name: ${schema}`); return schema }

export interface PrepToolOutcome { name?: string; ok: boolean; reason?: string; courseId?: string }
export interface PrepReply { messageId: string; content: string; outcome: 'completed' | 'failed'; tools: PrepToolOutcome[]; modelError?: 'quota' | 'credential' }
export interface PrepSessionRow { id: string; owner: string; title: string; courseId: string | null; createdAt: number; updatedAt: number }
export type PrepRunStatus = 'running' | 'completed' | 'failed'
export interface PrepRunRow { id: string; sessionId: string; requestId: string; inputHash: string; content: string; status: PrepRunStatus; reply: PrepReply | null; errorCode: string | null; claim: number; createdAt: number; updatedAt: number }
export type PrepRunStart = { kind: 'claimed' | 'running' | 'completed'; run: PrepRunRow }

export class PrepRequestConflictError extends Error {
  constructor(requestId: string) { super(`requestId ${requestId} 已用于不同的内容`); this.name = 'PrepRequestConflictError' }
}
export class PrepSessionNotFoundError extends Error {
  constructor(sessionId: string) { super(`prep session ${sessionId} not found for this owner`); this.name = 'PrepSessionNotFoundError' }
}

export interface OwnerPrepConversations {
  createSession(input: { title: string; courseId?: string | null }): Promise<PrepSessionRow>
  getSession(id: string): Promise<PrepSessionRow | undefined>
  listSessions(limit?: number): Promise<PrepSessionRow[]>
  bindCourse(id: string, courseId: string): Promise<PrepSessionRow | undefined>
  startRun(sessionId: string, input: { requestId: string; inputHash: string; content: string; staleAfterMs: number }): Promise<PrepRunStart>
  /** 只在回合仍是 running 且 claim 与领取时一致时生效 */
  completeRun(runId: string, reply: PrepReply, claim: number): Promise<boolean>
  failRun(runId: string, code: string, claim: number): Promise<boolean>
  runs(sessionId: string, limit?: number): Promise<PrepRunRow[]>
  getRun(sessionId: string, runId: string): Promise<PrepRunRow | undefined>
  /** 进行中且没过期的回合（按开始时间）；不给 sessionId 时是本 owner 全部会话 */
  activeRuns(input: { sessionId?: string; staleAfterMs: number }): Promise<PrepRunRow[]>
}

interface SessionDb { id: string; owner: string; title: string; course_id: string | null; created_at: string; updated_at: string }
interface RunDb { id: string; session_id: string; request_id: string; input_hash: string; content: string; status: PrepRunStatus; reply: PrepReply | null; error_code: string | null; claim: number; created_at: string; updated_at: string }
const SESSION_COLUMNS = 'id, owner, title, course_id, created_at, updated_at'
const RUN_COLUMNS = 'r.id, r.session_id, r.request_id, r.input_hash, r.content, r.status, r.reply, r.error_code, r.claim, r.created_at, r.updated_at'
const toSession = (r: SessionDb): PrepSessionRow => ({ id: r.id, owner: r.owner, title: r.title, courseId: r.course_id, createdAt: Number(r.created_at), updatedAt: Number(r.updated_at) })
const toRun = (r: RunDb): PrepRunRow => ({
  id: r.id, sessionId: r.session_id, requestId: r.request_id, inputHash: r.input_hash, content: r.content, status: r.status,
  reply: r.reply ?? null, errorCode: r.error_code, claim: Number(r.claim), createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
})

export class PgPrepConversations {
  readonly schema: string
  private readonly pool: pg.Pool
  private readonly now: () => number

  constructor(pool: pg.Pool, options: { schema?: string; now?: () => number } = {}) {
    this.pool = pool
    this.schema = check(options.schema ?? 'course')
    this.now = options.now ?? Date.now
  }

  private get sessions(): string { return `"${this.schema}"."prep_sessions"` }
  private get runsTable(): string { return `"${this.schema}"."prep_runs"` }

  private async tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
    const c = await this.pool.connect()
    try {
      await c.query('begin')
      const out = await fn(c)
      await c.query('commit')
      return out
    } catch (e) {
      await c.query('rollback').catch(() => undefined)
      throw e
    } finally {
      c.release()
    }
  }

  forOwner(owner: string): OwnerPrepConversations {
    if (!owner.trim()) throw new Error('prep owner is required')
    const S = this.sessions
    const R = this.runsTable
    const ownRun = `from ${R} r join ${S} s on s.id = r.session_id and s.owner = $1`
    return {
      createSession: async ({ title, courseId }) => {
        const t = this.now()
        const r = await this.pool.query<SessionDb>(
          `insert into ${S} (id, owner, title, course_id, created_at, updated_at) values ($1, $2, $3, $4, $5, $5) returning ${SESSION_COLUMNS}`,
          [randomUUID(), owner, title, courseId ?? null, t],
        )
        return toSession(r.rows[0]!)
      },
      getSession: async (id) => {
        const r = await this.pool.query<SessionDb>(`select ${SESSION_COLUMNS} from ${S} where id = $1 and owner = $2`, [id, owner])
        return r.rows[0] ? toSession(r.rows[0]) : undefined
      },
      listSessions: async (limit = 50) => {
        const r = await this.pool.query<SessionDb>(`select ${SESSION_COLUMNS} from ${S} where owner = $1 order by updated_at desc, id desc limit $2`, [owner, Math.max(1, Math.min(limit, 200))])
        return r.rows.map(toSession)
      },
      bindCourse: async (id, courseId) => {
        const r = await this.pool.query<SessionDb>(`update ${S} set course_id = $3, updated_at = $4 where id = $1 and owner = $2 returning ${SESSION_COLUMNS}`, [id, owner, courseId, this.now()])
        return r.rows[0] ? toSession(r.rows[0]) : undefined
      },
      startRun: (sessionId, input) => this.tx(async (c) => {
        const locked = await c.query(`select id from ${S} where id = $1 and owner = $2 for update`, [sessionId, owner])
        if (!locked.rowCount) throw new PrepSessionNotFoundError(sessionId)
        const t = this.now()
        const inserted = await c.query<RunDb>(
          `insert into ${R} as r (id, session_id, request_id, input_hash, content, status, created_at, updated_at)
           values ($1, $2, $3, $4, $5, 'running', $6, $6) on conflict (session_id, request_id) do nothing returning ${RUN_COLUMNS}`,
          [randomUUID(), sessionId, input.requestId, input.inputHash, input.content, t],
        )
        const touch = () => c.query(`update ${S} set updated_at = $2 where id = $1`, [sessionId, t])
        if (inserted.rows[0]) {
          await touch()
          return { kind: 'claimed', run: toRun(inserted.rows[0]) }
        }
        const existing = (await c.query<RunDb>(`select ${RUN_COLUMNS} from ${R} r where r.session_id = $1 and r.request_id = $2 for update`, [sessionId, input.requestId])).rows[0]!
        if (existing.input_hash !== input.inputHash) throw new PrepRequestConflictError(input.requestId)
        if (existing.status === 'completed') return { kind: 'completed', run: toRun(existing) }
        if (existing.status === 'running' && Number(existing.updated_at) > t - input.staleAfterMs) return { kind: 'running', run: toRun(existing) }
        const reclaimed = await c.query<RunDb>(
          `update ${R} as r set status = 'running', error_code = null, reply = null, claim = r.claim + 1, updated_at = $2 where r.id = $1 returning ${RUN_COLUMNS}`,
          [existing.id, t],
        )
        await touch()
        return { kind: 'claimed', run: toRun(reclaimed.rows[0]!) }
      }),
      completeRun: async (runId, reply, claim) => {
        const r = await this.pool.query(
          `update ${R} r set status = 'completed', reply = $3::json, error_code = null, updated_at = $4
           from ${S} s where r.id = $2 and s.id = r.session_id and s.owner = $1 and r.status = 'running' and r.claim = $5`,
          [owner, runId, JSON.stringify(reply), this.now(), claim],
        )
        return (r.rowCount ?? 0) > 0
      },
      failRun: async (runId, code, claim) => {
        const r = await this.pool.query(
          `update ${R} r set status = 'failed', error_code = $3, updated_at = $4
           from ${S} s where r.id = $2 and s.id = r.session_id and s.owner = $1 and r.status = 'running' and r.claim = $5`,
          [owner, runId, code, this.now(), claim],
        )
        return (r.rowCount ?? 0) > 0
      },
      runs: async (sessionId, limit = 200) => {
        const r = await this.pool.query<RunDb>(`select ${RUN_COLUMNS} ${ownRun} where r.session_id = $2 order by r.created_at, r.id limit $3`, [owner, sessionId, Math.max(1, Math.min(limit, 500))])
        return r.rows.map(toRun)
      },
      getRun: async (sessionId, runId) => {
        const r = await this.pool.query<RunDb>(`select ${RUN_COLUMNS} ${ownRun} where r.session_id = $2 and r.id = $3`, [owner, sessionId, runId])
        return r.rows[0] ? toRun(r.rows[0]) : undefined
      },
      activeRuns: async ({ sessionId, staleAfterMs }) => {
        const since = this.now() - staleAfterMs
        const r = sessionId === undefined
          ? await this.pool.query<RunDb>(`select ${RUN_COLUMNS} ${ownRun} where r.status = 'running' and r.updated_at > $2 order by r.created_at, r.id`, [owner, since])
          : await this.pool.query<RunDb>(`select ${RUN_COLUMNS} ${ownRun} where r.status = 'running' and r.updated_at > $2 and r.session_id = $3 order by r.created_at, r.id`, [owner, since, sessionId])
        return r.rows.map(toRun)
      },
    }
  }
}

/** api 在 YUNYI_PREP 不是 off 时启动检查（同 checkRenderSchema）：0007 没生效就让 api 启动失败 */
export async function checkPrepSchema(pool: pg.Pool, schema = 'course'): Promise<void> {
  const r = await pool.query<{ s: string | null; r: string | null }>(`select to_regclass($1) as s, to_regclass($2) as r`, [`${check(schema)}.prep_sessions`, `${schema}.prep_runs`])
  if (!r.rows[0]?.s || !r.rows[0]?.r) throw new Error(`迁移 0007 未生效（schema ${schema}）：先确认 api 启动时的 runMigrations 已执行，必要时手工执行 packages/domain/migrations/0007_prep.sql`)
}
