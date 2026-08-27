/** server-only:从当前知识点索引读取存量课程重建目标所需的最小元数据。 */

import { openSqliteRaw } from '@maolab/db'
import type { MainlineCourse } from '../domain.js'

export interface KpGoalMetadata {
  id: string
  canonicalName: string
  learningObjectives: string[]
}

interface KpGoalRow {
  id: string
  canonicalName: string
  annotations: string | null
}

let _db: ReturnType<typeof openSqliteRaw> | null = null

function getDb() {
  if (_db) return _db
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  _db = openSqliteRaw(url.replace(/^file:/, ''))
  return _db
}

export function learningObjectivesFromAnnotations(raw: string | null): string[] {
  if (!raw) return []
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return [] }
  if (!parsed || typeof parsed !== 'object') return []

  const dimensions = parsed as Record<string, { value?: unknown } | undefined>
  const objectives = dimensions.learningObjectives?.value
  if (!Array.isArray(objectives)) return []
  return objectives
    .filter((objective): objective is string => typeof objective === 'string')
    .map(objective => objective.trim())
    .filter(Boolean)
}

export function loadCurrentKpGoalMetadata(course: MainlineCourse): Readonly<Record<string, KpGoalMetadata>> {
  const kpIds = [...new Set(course.sourceMaterial
    .map(source => source.kpId)
    .filter((kpId): kpId is string => Boolean(kpId?.trim())))]
  if (kpIds.length === 0) return {}

  const placeholders = kpIds.map(() => '?').join(',')
  const rows = getDb().prepare(`
    SELECT
      id,
      canonical_name AS canonicalName,
      annotations
    FROM knowledge_points
    WHERE id IN (${placeholders})
  `).all(...kpIds) as KpGoalRow[]

  return Object.fromEntries(rows.map(row => [row.id, {
    id: row.id,
    canonicalName: row.canonicalName,
    learningObjectives: learningObjectivesFromAnnotations(row.annotations),
  }]))
}
