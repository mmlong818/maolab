// 知识点检索（S3）：k12-knowledge-points 数据集没有教材章节树，老师先选学段，再选学科或输入关键词检索。
import type { PrepKnowledgeFacets, PrepKnowledgePoint } from './api'
import type { KpChoice } from './kp-selection'

export const DEFAULT_BAND = '初中'
const MAX_QUERY = 80

export function subjectsOf(facets: PrepKnowledgeFacets | null, band: string): string[] {
  return facets?.gradeBands.find((b) => b.gradeBand === band)?.subjects ?? []
}

/** 没有关键词也没选学科时不检索（只按学段会列出整个学段）；关键词去首尾空白，最多 80 字（同 api） */
export function searchQueryOf(input: { q: string; band: string; subject: string }): { q: string; gradeBand?: string; subject?: string } | null {
  const q = input.q.trim().slice(0, MAX_QUERY)
  if (!q && !input.subject) return null
  return { q, ...(input.band ? { gradeBand: input.band } : {}), ...(input.subject ? { subject: input.subject } : {}) }
}

export function choiceOf(point: PrepKnowledgePoint): KpChoice {
  return { kpId: point.id, canonicalName: point.name, subject: point.subject }
}
