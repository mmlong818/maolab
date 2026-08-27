import { describe, it, expect, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb } from '../client.js'
import { createMainlineCourseRepository } from '../repositories/mainline-course.sqlite.js'
import { createCoursesV2Repository } from '../repositories/courses-v2.sqlite.js'
import type { CourseV2 } from '@maolab/shared-types'

// 迁移 journal 只登记到 0003（0004_courses_v2 未登记，migrate 不会应用），
// 因此这里直接建表，让测试自包含。见 migrations/meta/_journal.json。
function createTestDb() {
  const db = createDb(':memory:')
  db.run(sql`CREATE TABLE courses_v2 (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    origin TEXT NOT NULL,
    status TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  return db
}

const RECORD = {
  id: 'golden-primary-jingyesi',
  title: '静夜思',
  status: 'passed',
  payload: { id: 'golden-primary-jingyesi', topic: '静夜思', scenes: [{ id: 's1' }] },
}

describe('MainlineCourseRepository', () => {
  let repo: ReturnType<typeof createMainlineCourseRepository>
  let db: ReturnType<typeof createTestDb>

  beforeEach(() => {
    db = createTestDb()
    repo = createMainlineCourseRepository(db)
  })

  it('round-trips a mainline course payload', async () => {
    await repo.save(RECORD)
    const found = await repo.find(RECORD.id)
    expect(found?.title).toBe('静夜思')
    expect(found?.status).toBe('passed')
    expect(found?.payload).toEqual(RECORD.payload)
  })

  it('returns undefined for unknown id', async () => {
    expect(await repo.find('does-not-exist')).toBeUndefined()
  })

  it('does not surface legacy CourseV2 rows (schemaKind isolation)', async () => {
    const legacy = { id: 'legacy-1', title: '旧课', origin: 'kp-selection', status: 'ready', createdAt: 1000 } as unknown as CourseV2
    await createCoursesV2Repository(db).save(legacy)

    expect(await repo.find('legacy-1')).toBeUndefined()
    const listed = await repo.list()
    expect(listed.map(r => r.id)).not.toContain('legacy-1')
  })

  it('lists only mainline records', async () => {
    await repo.save(RECORD)
    await repo.save({ ...RECORD, id: 'golden-middle-tianjingsha', title: '天净沙·秋思' })
    const legacy = { id: 'legacy-2', title: '旧课', origin: 'kp-selection', status: 'ready', createdAt: 1000 } as unknown as CourseV2
    await createCoursesV2Repository(db).save(legacy)

    const listed = await repo.list()
    expect(listed).toHaveLength(2)
    expect(listed.map(r => r.id).sort()).toEqual(['golden-middle-tianjingsha', 'golden-primary-jingyesi'])
  })
})
