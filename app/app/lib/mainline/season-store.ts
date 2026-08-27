/**
 * season store — v4 M2(server-only)
 *
 * 落库/取回 Season。复用 courses_v2 表 + schemaKind:'season' 信封(@maolab/db
 * season.sqlite,零迁移)。
 *
 * ⚠️ 依赖 DB,禁止从 `@/lib/mainline` barrel 导出(同 store.ts)。
 */

import { createDb, createSeasonRepository, type SeasonRepository } from '@maolab/db'
import type { Season } from './season.js'

let _repo: SeasonRepository | null = null

function getRepo(): SeasonRepository {
  if (_repo) return _repo
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  _repo = createSeasonRepository(createDb(url))
  return _repo
}

export async function findSeason(id: string): Promise<Season | undefined> {
  const record = await getRepo().find(id)
  return record ? (record.payload as Season) : undefined
}

export async function saveSeason(season: Season): Promise<void> {
  await getRepo().save({
    id: season.id,
    title: season.title,
    status: 'active',
    payload: season,
  })
}

export async function listSeasons(): Promise<Season[]> {
  const records = await getRepo().list()
  return records.map(record => record.payload as Season)
}
