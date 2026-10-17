// 备课课程文档仓储（3a，spec 9.1、9.3、11 第 4 条）。owner = 账号用户名；所有读写都带 owner 与 kind 条件。
// payload 列是 json：pg 读回时按原文本 JSON.parse，键序不变。updated_at 是 CAS 版本号，语义同 maolab mainline-course.sqlite。
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/
const MIGRATIONS = ['0000_course.sql', '0001_render.sql', '0002_prep.sql', '0003_export.sql'].map((name) => resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations', name))
const check = (schema: string): string => { if (!SCHEMA_RE.test(schema)) throw new Error(`invalid schema name: ${schema}`); return schema }

export type CourseDocumentKind = 'course' | 'season'
export type CourseDocumentOrigin = 'prep'

export interface CourseDocumentRow {
  id: string
  owner: string
  kind: CourseDocumentKind
  title: string
  status: string
  origin: CourseDocumentOrigin
  payload: unknown
  createdAt: number
  updatedAt: number
}

export interface CourseDocumentInput {
  id: string
  title: string
  status: string
  payload: unknown
}

export class CourseOwnerMismatchError extends Error {
  readonly documentId: string
  constructor(documentId: string) {
    super(`course document ${documentId} belongs to another owner or kind`)
    this.name = 'CourseOwnerMismatchError'
    this.documentId = documentId
  }
}

/** 测试与非默认 schema 用：把 0005、0006 原样套到指定 schema（生产走 runMigrations）。单一 DDL 来源。 */
export async function applyCourseDdl(pool: pg.Pool, schema: string): Promise<void> {
  check(schema)
  for (const file of MIGRATIONS) {
    const sql = readFileSync(file, 'utf8').replaceAll('"course"', `"${schema}"`).replaceAll("'course.", `'${schema}.`)
    for (const statement of sql.split('--> statement-breakpoint').map((s) => s.trim()).filter(Boolean)) await pool.query(statement)
  }
}

/** 3c/3d 启用备课前的自检：表在，且 account.users 存在时外键也在 */
export async function checkCourseSchema(pool: pg.Pool, schema = 'course'): Promise<void> {
  check(schema)
  const r = await pool.query<{ t: string | null; accounts: string | null; fk: number }>(
    `select to_regclass($1) as t, to_regclass('account.users') as accounts,
            (select count(*)::int from pg_constraint where conname = 'fk_documents_owner' and conrelid = to_regclass($1)) as fk`,
    [`${schema}.documents`],
  )
  const row = r.rows[0]!
  if (!row.t || (row.accounts && row.fk !== 1)) {
    throw new Error(`迁移 0005 未生效（schema ${schema}）：先确认 api 启动时的 runMigrations 已执行，必要时手工执行 packages/domain/migrations/0005_course.sql`)
  }
}

interface DbRow { id: string; owner: string; kind: CourseDocumentKind; title: string; status: string; origin: CourseDocumentOrigin; payload: unknown; created_at: string; updated_at: string }
const COLUMNS = 'id, owner, kind, title, status, origin, payload, created_at, updated_at'
const toRow = (r: DbRow): CourseDocumentRow => ({
  id: r.id, owner: r.owner, kind: r.kind, title: r.title, status: r.status, origin: r.origin, payload: r.payload,
  createdAt: Number(r.created_at), updatedAt: Number(r.updated_at),
})

export interface OwnerCourseDocuments {
  find(kind: CourseDocumentKind, id: string): Promise<CourseDocumentRow | undefined>
  save(kind: CourseDocumentKind, doc: CourseDocumentInput): Promise<number>
  saveIfUnchanged(kind: CourseDocumentKind, doc: CourseDocumentInput, expectedUpdatedAt: number): Promise<boolean>
  list(kind: CourseDocumentKind): Promise<CourseDocumentRow[]>
  delete(kind: CourseDocumentKind, id: string): Promise<boolean>
}

export class PgCourseDocuments {
  readonly schema: string
  private readonly pool: pg.Pool
  private readonly now: () => number

  constructor(pool: pg.Pool, options: { schema?: string; now?: () => number } = {}) {
    this.pool = pool
    this.schema = check(options.schema ?? 'course')
    this.now = options.now ?? Date.now
  }

  private get table(): string {
    return `"${this.schema}"."documents"`
  }

  /** owner 只来自调用方的已鉴权身份（api 的账号、harness 的 agent 上下文），从不来自模型参数 */
  forOwner(owner: string): OwnerCourseDocuments {
    if (!owner.trim()) throw new Error('course owner is required')
    return {
      find: (kind, id) => this.find(owner, kind, id),
      save: (kind, doc) => this.save(owner, kind, doc),
      saveIfUnchanged: (kind, doc, expected) => this.saveIfUnchanged(owner, kind, doc, expected),
      list: (kind) => this.list(owner, kind),
      delete: (kind, id) => this.remove(owner, kind, id),
    }
  }

  private async find(owner: string, kind: CourseDocumentKind, id: string): Promise<CourseDocumentRow | undefined> {
    const r = await this.pool.query<DbRow>(`select ${COLUMNS} from ${this.table} where id = $1 and owner = $2 and kind = $3`, [id, owner, kind])
    return r.rows[0] ? toRow(r.rows[0]) : undefined
  }

  private upsertSql(): string {
    return `insert into ${this.table} as d (id, owner, kind, title, status, origin, payload, created_at, updated_at)
      values ($1, $2, $3, $4, $5, 'prep', $6::json, $7, $7)
      on conflict (id) do update set title = excluded.title, status = excluded.status, payload = excluded.payload,
        updated_at = case when d.updated_at >= $7 then d.updated_at + 1 else $7 end
      where d.owner = excluded.owner and d.kind = excluded.kind
      returning updated_at`
  }

  private async save(owner: string, kind: CourseDocumentKind, doc: CourseDocumentInput): Promise<number> {
    const r = await this.pool.query<{ updated_at: string }>(this.upsertSql(), [doc.id, owner, kind, doc.title, doc.status, JSON.stringify(doc.payload), this.now()])
    if (r.rowCount !== 1) throw new CourseOwnerMismatchError(doc.id)
    return Number(r.rows[0]!.updated_at)
  }

  /** 纯 CAS 更新：只改已存在、属于本 owner 与 kind、且版本等于 expected 的行；行不存在（含读后被删）返回 false，从不插入（3b Ruling [T11]） */
  private async saveIfUnchanged(owner: string, kind: CourseDocumentKind, doc: CourseDocumentInput, expectedUpdatedAt: number): Promise<boolean> {
    const r = await this.pool.query(
      `update ${this.table} as d set title = $4, status = $5, payload = $6::json,
         updated_at = case when d.updated_at >= $7 then d.updated_at + 1 else $7 end
       where d.id = $1 and d.owner = $2 and d.kind = $3 and d.updated_at = $8`,
      [doc.id, owner, kind, doc.title, doc.status, JSON.stringify(doc.payload), this.now(), expectedUpdatedAt],
    )
    return r.rowCount === 1
  }

  private async list(owner: string, kind: CourseDocumentKind): Promise<CourseDocumentRow[]> {
    const r = await this.pool.query<DbRow>(`select ${COLUMNS} from ${this.table} where owner = $1 and kind = $2 order by updated_at desc, id`, [owner, kind])
    return r.rows.map(toRow)
  }

  private async remove(owner: string, kind: CourseDocumentKind, id: string): Promise<boolean> {
    const r = await this.pool.query(`delete from ${this.table} where id = $1 and owner = $2 and kind = $3`, [id, owner, kind])
    return (r.rowCount ?? 0) > 0
  }
}
