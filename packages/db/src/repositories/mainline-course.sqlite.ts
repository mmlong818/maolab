/**
 * mainline course repository — 重启主线 P1
 *
 * 复用 courses_v2 表落库 MainlineCourse（零迁移）。用 data JSON 里的
 * `schemaKind: 'mainline'` 信封与旧 CourseV2 行区分：find/list 只认 mainline 行，
 * 旧 CourseV2 行（无 schemaKind）对本仓储不可见，反之亦然。
 *
 * 领域类型 MainlineCourse 定义在 app 层，db 包不反向依赖它——因此 payload 对本
 * 仓储保持不透明（unknown），由调用方 cast。
 */

import { eq, desc } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import { coursesV2 } from '../schema.js'

const SCHEMA_KIND = 'mainline'

export interface MainlineCourseRecord {
  id: string
  title: string
  status: string
  payload: unknown
  /** 首次生成时间(ms);save 时由仓储写入,读取时回传 */
  createdAt?: number
}

export interface MainlineCourseRepository {
  find(id: string): Promise<MainlineCourseRecord | undefined>
  save(record: MainlineCourseRecord): Promise<void>
  list(): Promise<MainlineCourseRecord[]>
  delete(id: string): Promise<void>
}

interface Envelope {
  schemaKind: typeof SCHEMA_KIND
  payload: unknown
}

export function createMainlineCourseRepository(db: DbClient): MainlineCourseRepository {
  return {
    async find(id): Promise<MainlineCourseRecord | undefined> {
      const row = db.select().from(coursesV2).where(eq(coursesV2.id, id)).get()
      if (!row) return undefined
      const record = toRecord(row)
      return record
    },

    async save(record): Promise<void> {
      const now = Date.now()
      const data = JSON.stringify({ schemaKind: SCHEMA_KIND, payload: record.payload } satisfies Envelope)
      db.insert(coursesV2)
        .values({
          id: record.id,
          title: record.title,
          origin: 'kp-selection',
          status: record.status,
          data,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: coursesV2.id,
          set: { title: record.title, status: record.status, data, updatedAt: now },
        })
        .run()
    },

    async list(): Promise<MainlineCourseRecord[]> {
      const rows = db.select().from(coursesV2).orderBy(desc(coursesV2.updatedAt)).all()
      return rows.map(toRecord).filter((r): r is MainlineCourseRecord => r !== undefined)
    },

    async delete(id): Promise<void> {
      db.delete(coursesV2).where(eq(coursesV2.id, id)).run()
    },
  }
}

function toRecord(row: { id: string; title: string; status: string; data: string; createdAt: number }): MainlineCourseRecord | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(row.data)
  } catch {
    return undefined
  }
  if (!isEnvelope(parsed)) return undefined
  return { id: row.id, title: row.title, status: row.status, payload: parsed.payload, createdAt: row.createdAt }
}

function isEnvelope(value: unknown): value is Envelope {
  return typeof value === 'object' && value !== null && (value as { schemaKind?: unknown }).schemaKind === SCHEMA_KIND
}
