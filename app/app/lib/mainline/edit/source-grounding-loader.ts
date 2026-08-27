/** server-only:按课程当前 KP 批量读取教材来源节点，再复用建课期同一解析器。 */

import { openSqliteRaw } from '@maolab/db'
import type { MainlineCourse } from '../domain.js'
import {
  resolveCourseGroundings,
  type CourseGroundingResult,
  type KpGroundingSourceRow,
} from '../generation/course-grounding.js'

let _db: ReturnType<typeof openSqliteRaw> | null = null

function getDb() {
  if (_db) return _db
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  _db = openSqliteRaw(url.replace(/^file:/, ''))
  return _db
}

export async function resolveCurrentCourseGroundings(course: MainlineCourse): Promise<CourseGroundingResult> {
  const kpsById = new Map<string, { id: string; canonicalName: string }>()
  for (const source of course.sourceMaterial) {
    if (source.kpId) kpsById.set(source.kpId, { id: source.kpId, canonicalName: source.title })
  }
  const kps = [...kpsById.values()]
  if (kps.length === 0) {
    return resolveCourseGroundings([], [])
  }

  const placeholders = kps.map(() => '?').join(',')
  const rows = getDb().prepare(`
    SELECT
      knowledge_point_id AS knowledgePointId,
      source,
      external_id AS externalId,
      evidence_snippet AS evidenceSnippet,
      confidence
    FROM knowledge_point_sources
    WHERE knowledge_point_id IN (${placeholders})
  `).all(...kps.map(kp => kp.id)) as KpGroundingSourceRow[]

  return resolveCourseGroundings(kps, rows)
}
