/**
 * atom_by_kp repo — atom 对 KP 的多对多索引 CRUD + 查询.
 *
 * 边界:
 *   - 只 prepared-statement 单事务 CRUD, 不做业务编排
 *   - 不引用 LLM / 网络
 *   - 与 0007_atom_by_kp.sql / schema.ts 的 atomByKp 一致
 */
import { randomUUID } from 'node:crypto'

import type { BetterSqliteDb } from './knowledge-point-store.js'

export interface AtomByKpRecord {
  id: string
  kpId: string
  atomId: string
  courseId: string
  atomType: string
  ageBand: string
  subject: string
  generatedAt: number
  payloadSnapshot: string
}

interface AtomByKpRow {
  id: string
  kp_id: string
  atom_id: string
  course_id: string
  atom_type: string
  age_band: string
  subject: string
  generated_at: number
  payload_snapshot: string
}

function rowToRecord(row: AtomByKpRow): AtomByKpRecord {
  return {
    id: row.id,
    kpId: row.kp_id,
    atomId: row.atom_id,
    courseId: row.course_id,
    atomType: row.atom_type,
    ageBand: row.age_band,
    subject: row.subject,
    generatedAt: row.generated_at,
    payloadSnapshot: row.payload_snapshot,
  }
}

const INSERT_SQL = `INSERT INTO atom_by_kp
  (id, kp_id, atom_id, course_id, atom_type, age_band, subject, generated_at, payload_snapshot)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`

export function insertAtomByKp(db: BetterSqliteDb, record: AtomByKpRecord): void {
  db.prepare(INSERT_SQL).run(
    record.id || randomUUID(),
    record.kpId,
    record.atomId,
    record.courseId,
    record.atomType,
    record.ageBand,
    record.subject,
    record.generatedAt,
    record.payloadSnapshot,
  )
}

export function insertAtomByKpBatch(db: BetterSqliteDb, records: AtomByKpRecord[]): void {
  if (records.length === 0) return
  const stmt = db.prepare(INSERT_SQL)
  const tx = db.transaction((rows: AtomByKpRecord[]) => {
    for (const r of rows) {
      stmt.run(
        r.id || randomUUID(),
        r.kpId,
        r.atomId,
        r.courseId,
        r.atomType,
        r.ageBand,
        r.subject,
        r.generatedAt,
        r.payloadSnapshot,
      )
    }
  })
  tx(records)
}

export interface FindAtomsByKpOpts {
  kpId: string
  ageBand?: string
  subject?: string
  /** 默认 90 天 */
  maxAgeMs?: number
  /** 默认 5 */
  limit?: number
}

const DEFAULT_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000
const DEFAULT_LIMIT = 5

export function findAtomsByKp(db: BetterSqliteDb, opts: FindAtomsByKpOpts): AtomByKpRecord[] {
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS
  const limit = opts.limit ?? DEFAULT_LIMIT
  const cutoff = Date.now() - maxAge

  const where: string[] = ['kp_id = ?', 'generated_at >= ?']
  const args: unknown[] = [opts.kpId, cutoff]
  if (opts.ageBand) {
    where.push('age_band = ?')
    args.push(opts.ageBand)
  }
  if (opts.subject) {
    where.push('subject = ?')
    args.push(opts.subject)
  }
  args.push(limit)

  const rows = db
    .prepare(
      `SELECT * FROM atom_by_kp WHERE ${where.join(' AND ')} ORDER BY generated_at DESC LIMIT ?`,
    )
    .all(...args) as AtomByKpRow[]
  return rows.map(rowToRecord)
}

export function deleteAtomsByKpForCourse(db: BetterSqliteDb, courseId: string): void {
  db.prepare(`DELETE FROM atom_by_kp WHERE course_id = ?`).run(courseId)
}
