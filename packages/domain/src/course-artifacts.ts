// 产物存储（3b，spec 4.1"产物进对象存储"；用户裁决 D4 缺省：先存 PG bytea）。
// CourseArtifactStore 是端口：api（3d 下载）、harness 工具（3c 图片）、workers/render（证据、导出件）只依赖它；
// SDP 对象存储确认后写一个新实现（元数据仍在 course.artifacts，storage = 'object'），调用方不改。
// 隔离：所有读写带 owner 条件；产物 id 由 owner 参与计算，不同 owner 的同一内容是两行。
import { createHash } from 'node:crypto'
import type pg from 'pg'

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/
const check = (schema: string): string => { if (!SCHEMA_RE.test(schema)) throw new Error(`invalid schema name: ${schema}`); return schema }

export type ArtifactKind = 'image' | 'evidence' | 'export'
export const ARTIFACT_KINDS: readonly ArtifactKind[] = ['image', 'evidence', 'export']
export const PPTX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
export const ARTIFACT_CONTENT_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', PPTX_CONTENT_TYPE]
export const ARTIFACT_MAX_BYTES = 64 * 1024 * 1024
export const EXPORT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
/** 浏览器与渲染页里产物的地址前缀；@maolab/course 的 render-contract 有同值常量（浏览器侧不能引 pg），course 的测试校验两者一致 */
export const COURSE_ARTIFACT_URL_PREFIX = '/api/prep/artifacts/'
export const courseArtifactUrlOf = (id: string): string => `${COURSE_ARTIFACT_URL_PREFIX}${id}`

export interface ArtifactPutInput {
  bytes: Uint8Array
  contentType: string
  kind: ArtifactKind
  courseId?: string
  /** 毫秒时间；不给即永久。同一产物再次写入时只会延长，永久的保持永久 */
  expiresAt?: number
}

export interface ArtifactMeta {
  id: string
  owner: string
  sha256: string
  kind: ArtifactKind
  contentType: string
  byteSize: number
  courseId: string | null
  createdAt: number
  expiresAt: number | null
}

export interface StoredArtifact extends ArtifactMeta {
  bytes: Buffer
}

export interface OwnerArtifacts {
  put(input: ArtifactPutInput): Promise<ArtifactMeta>
  /** 过期的视为不存在 */
  get(id: string): Promise<StoredArtifact | undefined>
  head(id: string): Promise<ArtifactMeta | undefined>
  delete(id: string): Promise<boolean>
}

export interface CourseArtifactStore {
  forOwner(owner: string): OwnerArtifacts
  /** 删除已过期的产物，返回删除行数（worker 空闲时调用） */
  purgeExpired(): Promise<number>
}

export class ArtifactRejectedError extends Error {
  readonly code: 'ARTIFACT_TOO_LARGE' | 'ARTIFACT_TYPE' | 'ARTIFACT_INPUT'
  constructor(code: ArtifactRejectedError['code'], message: string) {
    super(message)
    this.name = 'ArtifactRejectedError'
    this.code = code
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function artifactIdFor(owner: string, kind: ArtifactKind, sha256: string): string {
  return `ar_${createHash('sha256').update(`${owner}\n${kind}\n${sha256}`).digest('hex').slice(0, 40)}`
}

export function validateArtifactInput(input: ArtifactPutInput, maxBytes: number): void {
  if (!ARTIFACT_KINDS.includes(input.kind)) throw new ArtifactRejectedError('ARTIFACT_INPUT', `unknown artifact kind: ${String(input.kind)}`)
  if (!ARTIFACT_CONTENT_TYPES.includes(input.contentType)) throw new ArtifactRejectedError('ARTIFACT_TYPE', `content type not allowed: ${input.contentType}`)
  if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0) throw new ArtifactRejectedError('ARTIFACT_INPUT', 'artifact is empty')
  if (input.bytes.byteLength > maxBytes) throw new ArtifactRejectedError('ARTIFACT_TOO_LARGE', `artifact is ${input.bytes.byteLength} bytes, limit ${maxBytes}`)
  if (input.expiresAt !== undefined && !Number.isSafeInteger(input.expiresAt)) throw new ArtifactRejectedError('ARTIFACT_INPUT', 'expiresAt must be an integer (ms)')
}

interface DbRow {
  id: string; owner: string; sha256: string; kind: ArtifactKind; content_type: string; byte_size: number
  course_id: string | null; created_at: string; expires_at: string | null; content?: Buffer | null
}
const META = 'id, owner, sha256, kind, content_type, byte_size, course_id, created_at, expires_at'
const toMeta = (r: DbRow): ArtifactMeta => ({
  id: r.id, owner: r.owner, sha256: r.sha256, kind: r.kind, contentType: r.content_type, byteSize: Number(r.byte_size),
  courseId: r.course_id, createdAt: Number(r.created_at), expiresAt: r.expires_at === null ? null : Number(r.expires_at),
})

export class PgCourseArtifacts implements CourseArtifactStore {
  readonly schema: string
  private readonly pool: pg.Pool
  private readonly now: () => number
  private readonly maxBytes: number

  constructor(pool: pg.Pool, options: { schema?: string; now?: () => number; maxBytes?: number } = {}) {
    this.pool = pool
    this.schema = check(options.schema ?? 'course')
    this.now = options.now ?? Date.now
    this.maxBytes = options.maxBytes ?? ARTIFACT_MAX_BYTES
  }

  private get table(): string {
    return `"${this.schema}"."artifacts"`
  }

  /** owner 只来自调用方的已鉴权身份或任务行，从不来自模型参数 */
  forOwner(owner: string): OwnerArtifacts {
    if (!owner.trim()) throw new Error('artifact owner is required')
    return {
      put: (input) => this.put(owner, input),
      get: (id) => this.get(owner, id),
      head: (id) => this.head(owner, id),
      delete: (id) => this.remove(owner, id),
    }
  }

  private async put(owner: string, input: ArtifactPutInput): Promise<ArtifactMeta> {
    validateArtifactInput(input, this.maxBytes)
    const sha256 = sha256Hex(input.bytes)
    const id = artifactIdFor(owner, input.kind, sha256)
    const bytes = Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength)
    const r = await this.pool.query<DbRow>(
      `insert into ${this.table} as a (id, owner, sha256, kind, content_type, byte_size, storage, content, course_id, created_at, expires_at)
       values ($1, $2, $3, $4, $5, $6, 'pg', $7, $8, $9, $10)
       on conflict (id) do update set
         expires_at = case when a.expires_at is null or excluded.expires_at is null then null else greatest(a.expires_at, excluded.expires_at) end
       where a.owner = excluded.owner
       returning ${META}`,
      [id, owner, sha256, input.kind, input.contentType, bytes.byteLength, bytes, input.courseId ?? null, this.now(), input.expiresAt ?? null],
    )
    if (r.rowCount !== 1) throw new Error(`artifact ${id} belongs to another owner`)
    return toMeta(r.rows[0]!)
  }

  private async get(owner: string, id: string): Promise<StoredArtifact | undefined> {
    const r = await this.pool.query<DbRow>(
      `select ${META}, storage, content from ${this.table} where id = $1 and owner = $2 and (expires_at is null or expires_at > $3)`,
      [id, owner, this.now()],
    )
    const row = r.rows[0] as (DbRow & { storage: string }) | undefined
    if (!row) return undefined
    if (row.storage !== 'pg' || !row.content) throw new Error(`artifact ${id} is not stored in PG (storage=${row.storage})`)
    return { ...toMeta(row), bytes: row.content }
  }

  private async head(owner: string, id: string): Promise<ArtifactMeta | undefined> {
    const r = await this.pool.query<DbRow>(
      `select ${META} from ${this.table} where id = $1 and owner = $2 and (expires_at is null or expires_at > $3)`,
      [id, owner, this.now()],
    )
    return r.rows[0] ? toMeta(r.rows[0]) : undefined
  }

  private async remove(owner: string, id: string): Promise<boolean> {
    const r = await this.pool.query(`delete from ${this.table} where id = $1 and owner = $2`, [id, owner])
    return (r.rowCount ?? 0) > 0
  }

  async purgeExpired(): Promise<number> {
    const r = await this.pool.query(`delete from ${this.table} where expires_at is not null and expires_at <= $1`, [this.now()])
    return r.rowCount ?? 0
  }
}

/** 3c 的工具在 runWithCourseRuntime({ assets }) 里用：结构上满足 @maolab/course 的 CourseAssetSink（本包不依赖 course） */
export function courseAssetSinkFor(artifacts: OwnerArtifacts, courseId: string): { put(input: { bytes: Uint8Array; contentType: string; name: string }): Promise<string> } {
  return {
    async put(input) {
      const meta = await artifacts.put({ bytes: input.bytes, contentType: input.contentType, kind: 'image', courseId })
      return courseArtifactUrlOf(meta.id)
    },
  }
}

/** worker 与 3c/3d 启用渲染前的自检：两张表与课程外键都在 */
export async function checkRenderSchema(pool: pg.Pool, schema = 'course'): Promise<void> {
  check(schema)
  const r = await pool.query<{ a: string | null; j: string | null; fk: number }>(
    `select to_regclass($1) as a, to_regclass($2) as j,
            (select count(*)::int from pg_constraint where conname = 'fk_render_jobs_course' and conrelid = to_regclass($2)) as fk`,
    [`${schema}.artifacts`, `${schema}.render_jobs`],
  )
  const row = r.rows[0]!
  if (!row.a || !row.j || row.fk !== 1) {
    throw new Error(`迁移 0006 未生效（schema ${schema}）：先确认 api 启动时的 runMigrations 已执行，必要时手工执行 packages/domain/migrations/0006_render.sql`)
  }
}
