'use server'

import type { ContentUnit, ContentUnitQuery, ContentKind } from '@maolab/shared-types'
import { createDb, createContentUnitRepository } from '@maolab/db'

const DB_URL = process.env['DATABASE_URL'] ?? 'file:./data/maolab.db'

export interface LibraryFacets {
  kinds: Array<{ kind: ContentKind; count: number }>
  subjects: Array<{ subject: string; count: number }>
  languages: Array<{ language: string; count: number }>
  total: number
}

export interface LibraryListResult {
  units: ContentUnit[]
  facets: LibraryFacets
}

/** Search content units; also returns simple count facets across the whole table. */
export async function listContentUnits(query: ContentUnitQuery = {}): Promise<LibraryListResult> {
  const db = createDb(DB_URL)
  const repo = createContentUnitRepository(db)
  const units = await repo.search({ limit: 200, ...query })

  // Facet counts come from a wide unfiltered fetch so the user sees totals,
  // not just the slice that survived the active filter.
  const all = await repo.search({ limit: 5000 })
  const kindCounts = new Map<ContentKind, number>()
  const subjectCounts = new Map<string, number>()
  const langCounts = new Map<string, number>()
  for (const u of all) {
    kindCounts.set(u.kind, (kindCounts.get(u.kind) ?? 0) + 1)
    if (u.subject) subjectCounts.set(u.subject, (subjectCounts.get(u.subject) ?? 0) + 1)
    langCounts.set(u.language, (langCounts.get(u.language) ?? 0) + 1)
  }

  return {
    units,
    facets: {
      kinds: [...kindCounts].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
      subjects: [...subjectCounts].map(([subject, count]) => ({ subject, count })).sort((a, b) => b.count - a.count),
      languages: [...langCounts].map(([language, count]) => ({ language, count })).sort((a, b) => b.count - a.count),
      total: all.length,
    },
  }
}

export async function deleteContentUnit(id: string): Promise<void> {
  const db = createDb(DB_URL)
  const repo = createContentUnitRepository(db)
  await repo.delete(id)
}
