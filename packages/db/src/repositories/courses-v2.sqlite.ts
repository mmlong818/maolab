/**
 * coursesV2 repository — Sprint 0
 *
 * 整个 CourseV2 序列化为 JSON 存 `data` 字段。
 * status / id / title / origin / timestamps 提取为列以便查询。
 */

import { eq, desc } from 'drizzle-orm'
import type { DbClient } from '../client.js'
import type { CourseV2, CourseStatusV2, CourseOrigin } from '@maolab/shared-types'
import { coursesV2 } from '../schema.js'
import { parseJsonColumn } from './parse-column.js'

export interface CoursesV2Repository {
  find(id: string): Promise<CourseV2 | undefined>
  save(course: CourseV2): Promise<void>
  list(opts?: { status?: CourseStatusV2; limit?: number }): Promise<CourseV2[]>
  delete(id: string): Promise<void>
}

export function createCoursesV2Repository(db: DbClient): CoursesV2Repository {
  return {
    async find(id: string): Promise<CourseV2 | undefined> {
      const row = db.select().from(coursesV2).where(eq(coursesV2.id, id)).get()
      if (!row) return undefined
      return deserialize(row.data, id)
    },

    async save(course: CourseV2): Promise<void> {
      const now = Date.now()
      const payload = JSON.stringify(course)
      db.insert(coursesV2)
        .values({
          id: course.id,
          title: course.title,
          origin: course.origin,
          status: course.status,
          data: payload,
          createdAt: course.createdAt,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: coursesV2.id,
          set: {
            title: course.title,
            origin: course.origin,
            status: course.status,
            data: payload,
            updatedAt: now,
          },
        })
        .run()
    },

    async list(opts?: { status?: CourseStatusV2; limit?: number }): Promise<CourseV2[]> {
      const limit = opts?.limit ?? 100
      const baseQuery = db.select().from(coursesV2)
      const filtered = opts?.status
        ? baseQuery.where(eq(coursesV2.status, opts.status))
        : baseQuery
      const rows = filtered.orderBy(desc(coursesV2.updatedAt)).limit(limit).all()
      return rows.map(r => deserialize(r.data, r.id))
    },

    async delete(id: string): Promise<void> {
      db.delete(coursesV2).where(eq(coursesV2.id, id)).run()
    },
  }
}

function deserialize(data: string, id: string): CourseV2 {
  return parseJsonColumn<CourseV2>(data, { table: 'courses_v2', id, column: 'data' })
}
