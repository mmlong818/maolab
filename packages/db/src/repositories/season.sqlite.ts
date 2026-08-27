/**
 * season repository — v4 M2 课程季(圣经层)
 *
 * 与 mainline-course.sqlite 同法:复用 courses_v2 表 + `schemaKind: 'season'`
 * 信封落库(零迁移)。season 行对 mainline 仓储不可见,反之亦然。
 * 领域类型 Season 定义在 app 层,payload 对本仓储不透明。
 */

import { eq, desc } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import { coursesV2 } from '../schema.js'

const SCHEMA_KIND = 'season'

export interface SeasonRecord {
  id: string
  title: string
  status: string
  payload: unknown
  createdAt?: number
}

export interface SeasonRepository {
  find(id: string): Promise<SeasonRecord | undefined>
  save(record: SeasonRecord): Promise<void>
  list(): Promise<SeasonRecord[]>
  delete(id: string): Promise<void>
}

interface Envelope {
  schemaKind: typeof SCHEMA_KIND
  payload: unknown
}

export function createSeasonRepository(db: DbClient): SeasonRepository {
  return {
    async find(id): Promise<SeasonRecord | undefined> {
      const row = db.select().from(coursesV2).where(eq(coursesV2.id, id)).get()
      if (!row) return undefined
      return toRecord(row)
    },

    async save(record): Promise<void> {
      const now = Date.now()
      const data = JSON.stringify({ schemaKind: SCHEMA_KIND, payload: record.payload } satisfies Envelope)
      db.insert(coursesV2)
        .values({
          id: record.id,
          title: record.title,
          origin: 'season',
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

    async list(): Promise<SeasonRecord[]> {
      const rows = db.select().from(coursesV2).orderBy(desc(coursesV2.updatedAt)).all()
      return rows.map(toRecord).filter((r): r is SeasonRecord => r !== undefined)
    },

    async delete(id): Promise<void> {
      db.delete(coursesV2).where(eq(coursesV2.id, id)).run()
    },
  }
}

function toRecord(row: { id: string; title: string; status: string; data: string; createdAt: number }): SeasonRecord | undefined {
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
