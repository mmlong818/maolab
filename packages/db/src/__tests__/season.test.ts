import { describe, it, expect, beforeEach } from 'vitest'
import { sql } from 'drizzle-orm'
import { createDb } from '../client.js'
import { createSeasonRepository } from '../repositories/season.sqlite.js'
import { createMainlineCourseRepository } from '../repositories/mainline-course.sqlite.js'

// 同 mainline-course.test:迁移 journal 缺口,直接建表自包含。
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

const SEASON = {
  id: 'season-s01',
  title: '看不见的规律',
  status: 'active',
  payload: { id: 'season-s01', title: '看不见的规律', subject: 'physics', episodes: [], openPlotThreads: [] },
}

describe('SeasonRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: ReturnType<typeof createSeasonRepository>

  beforeEach(() => {
    db = createTestDb()
    repo = createSeasonRepository(db)
  })

  it('round-trips a season payload and upserts', async () => {
    await repo.save(SEASON)
    const found = await repo.find(SEASON.id)
    expect(found?.payload).toEqual(SEASON.payload)

    await repo.save({ ...SEASON, payload: { ...SEASON.payload, episodes: [{ episodeNo: 1 }] } })
    const updated = await repo.find(SEASON.id)
    expect((updated?.payload as { episodes: unknown[] }).episodes).toHaveLength(1)
  })

  it('season rows and mainline rows are mutually invisible(信封隔离)', async () => {
    await repo.save(SEASON)
    const mainlineRepo = createMainlineCourseRepository(db)
    await mainlineRepo.save({ id: 'course-1', title: '课', status: 'passed', payload: { id: 'course-1' } })

    expect(await mainlineRepo.find(SEASON.id)).toBeUndefined()
    expect(await repo.find('course-1')).toBeUndefined()
    expect((await repo.list()).map(r => r.id)).toEqual([SEASON.id])
    expect((await mainlineRepo.list()).map(r => r.id)).toEqual(['course-1'])
  })
})
