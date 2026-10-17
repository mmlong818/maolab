/** 从当前知识点索引读取存量课程重建目标所需的最小元数据（3a：经知识点端口，不再直读 SQLite）。 */

import type { CourseKnowledgePort } from '../../ports.js'
import type { MainlineCourse } from '../domain.js'

export interface KpGoalMetadata {
  id: string
  canonicalName: string
  learningObjectives: string[]
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

export async function loadCurrentKpGoalMetadata(
  course: MainlineCourse,
  knowledge: CourseKnowledgePort,
): Promise<Readonly<Record<string, KpGoalMetadata>>> {
  const kpIds = [...new Set(course.sourceMaterial
    .map(source => source.kpId)
    .filter((kpId): kpId is string => Boolean(kpId?.trim())))]
  if (kpIds.length === 0) return {}

  const rows = await knowledge.knowledgePoints(kpIds)
  return Object.fromEntries(rows.map(row => [row.id, {
    id: row.id,
    canonicalName: row.canonical_name,
    learningObjectives: learningObjectivesFromAnnotations(row.annotations),
  }]))
}
