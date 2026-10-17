const KP_KNOWLEDGE_TYPES = ['factual', 'conceptual', 'procedural', 'metacognitive'] as const
type KpKnowledgeType = (typeof KP_KNOWLEDGE_TYPES)[number]

export interface KpDimensions {
  knowledgeType?: KpKnowledgeType
  misconceptions?: string[]
  learningObjectives?: string[]
}

interface KpAnnotationValue {
  value?: unknown
  source?: unknown
}

const REVIEWED_ANNOTATION_SOURCES = new Set([
  'human',
  'teacher-reviewed',
  'expert-reviewed',
  'editorial-reviewed',
])

/** Unreviewed misconception candidates must never become student-facing pages. */
export function parseKpDimensions(raw: string | null): KpDimensions {
  if (!raw) return {}
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return {} }
  if (!parsed || typeof parsed !== 'object') return {}
  const dims = parsed as Record<string, KpAnnotationValue | undefined>
  const out: KpDimensions = {}

  const knowledgeType = dims.knowledgeType?.value
  if (typeof knowledgeType === 'string' && (KP_KNOWLEDGE_TYPES as readonly string[]).includes(knowledgeType)) {
    out.knowledgeType = knowledgeType as KpKnowledgeType
  }

  const misconceptionAnnotation = dims.misconceptions
  const misconceptionSource = typeof misconceptionAnnotation?.source === 'string'
    ? misconceptionAnnotation.source.trim().toLowerCase()
    : ''
  if (Array.isArray(misconceptionAnnotation?.value) && REVIEWED_ANNOTATION_SOURCES.has(misconceptionSource)) {
    const items = misconceptionAnnotation.value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (items.length > 0) out.misconceptions = items
  }

  const objectives = dims.learningObjectives?.value
  if (Array.isArray(objectives)) {
    const items = objectives.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    if (items.length > 0) out.learningObjectives = items
  }
  return out
}
