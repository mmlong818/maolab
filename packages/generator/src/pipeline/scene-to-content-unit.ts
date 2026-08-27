import { randomUUID } from 'node:crypto'
import type {
  Scene,
  ContentUnit,
  ContentKind,
  ContentSubkind,
  TeachingPlan,
  OutlineItem,
  KnowledgeProfile,
} from '@maolab/shared-types'

const SUBKIND_TO_KIND: Record<ContentSubkind, ContentKind> = {
  slide: 'lecture',
  image: 'lecture',
  video: 'lecture',
  animation: 'lecture',
  hotspot: 'lecture',
  interactive: 'interactive',
  'model-3d': 'interactive',
  'drag-drop': 'interactive',
  branching: 'interactive',
  comparison: 'interactive',
  math: 'interactive',
  quiz: 'exercise',
  cloze: 'exercise',
  summary: 'summary',
}

const DIFFICULTY_MAP: Record<TeachingPlan['difficulty'], ContentUnit['difficulty']> = {
  beginner: 'easy',
  intermediate: 'medium',
  advanced: 'hard',
}

/**
 * Wrap a freshly-generated Scene as a ContentUnit, ready for the library.
 * Extracts concepts from the outline item + scene content (if it carries them).
 */
export function sceneToContentUnit(
  scene: Scene,
  item: OutlineItem,
  profile: KnowledgeProfile,
  plan: TeachingPlan,
): ContentUnit {
  const subkind = scene.type as ContentSubkind
  const kind = SUBKIND_TO_KIND[subkind] ?? 'lecture'

  // Try to pull concept ids from scene.content (only slide carries them today),
  // then merge with outline item.concepts and the broader profile core list.
  const inlineConcepts =
    scene.content.type === 'slide' && Array.isArray(scene.content.conceptIds)
      ? scene.content.conceptIds
      : []
  const conceptSet = new Set<string>([
    ...(item.concepts ?? []),
    ...inlineConcepts,
    ...profile.emphasizedConcepts,
  ])

  const tags: string[] = []
  if (item.objective) tags.push(`obj:${item.objective.slice(0, 40)}`)
  if (profile.domain && profile.domain !== 'auto-detect') tags.push(`domain:${profile.domain}`)

  const unit: ContentUnit = {
    id: randomUUID(),
    kind,
    subkind,
    title: scene.title,
    content: scene.content,
    concepts: Array.from(conceptSet),
    subject: profile.domain && profile.domain !== 'auto-detect' ? profile.domain : '',
    difficulty: DIFFICULTY_MAP[plan.difficulty] ?? 'medium',
    durationHint: scene.durationHint,
    language: plan.language,
    tags,
    origin: 'generated',
    createdAt: Date.now(),
    usageCount: 0,
  }
  if (plan.gradeLevel) unit.gradeLevel = plan.gradeLevel
  if (plan.id) unit.sourcePlanId = plan.id

  return unit
}

/**
 * Concept overlap with bidirectional substring fallback.
 *
 * Returns matched-count + a soft (0..1) match-quality score. The score weights
 * exact equality highest, then contains matches, so cross-course retrieval can
 * fire even when the LLM names a concept slightly differently (e.g.
 * "光合作用" ↔ "光合作用定义").
 */
// Filler concepts the LLM sometimes emits — must not count as overlap (R15 P0 复现根因)
const FILLER_CONCEPTS = new Set([
  'none', 'n/a', 'na', 'null', 'undefined', '无', '未知', '其他', '其它', '通用', '常识',
])
function isFiller(s: string): boolean {
  return !s || FILLER_CONCEPTS.has(s.trim().toLowerCase())
}

function conceptOverlap(
  candidateConcepts: string[],
  itemConcepts: string[],
): { matchedCount: number; weighted: number } {
  // 过滤填充性占位概念（LLM 习惯性补 "none" 等会跨学科误匹配）
  const cands = candidateConcepts.filter(c => !isFiller(c))
  const items = itemConcepts.filter(c => !isFiller(c))
  if (cands.length === 0 || items.length === 0) {
    return { matchedCount: 0, weighted: 0 }
  }
  const matched = new Set<string>()
  let weighted = 0
  for (const cc of cands) {
    for (const ic of items) {
      if (cc === ic) {
        matched.add(cc)
        weighted += 1
      } else {
        // 子串匹配收紧：短串至少 3 字，且短:长比例 >= 0.5。
        // 避免"变形"匹配上"动词变形"等跨学科误判（R10 P0 复现根因）。
        const short = cc.length <= ic.length ? cc : ic
        const long = cc.length <= ic.length ? ic : cc
        if (short.length >= 3 && short.length / long.length >= 0.5 && long.includes(short)) {
          matched.add(cc)
          weighted += 0.6
        }
      }
    }
  }
  return { matchedCount: matched.size, weighted }
}

/**
 * Score a candidate ContentUnit against an outline item.
 * Higher = better match. Returns >0 only if the candidate is plausibly reusable.
 */
export function scoreCandidate(
  candidate: ContentUnit,
  item: OutlineItem,
  profile: KnowledgeProfile,
  plan: TeachingPlan,
): number {
  let score = 0

  // Hard filter: subkind must match
  if (candidate.subkind !== item.sceneType) return 0
  score += 5

  // Language must match
  if (candidate.language !== plan.language) return 0
  score += 1

  // Concept overlap (strongest signal, with substring fallback)
  const itemConcepts = [
    ...(item.concepts ?? []),
    ...profile.emphasizedConcepts,
  ]
  const { matchedCount, weighted } = conceptOverlap(candidate.concepts, itemConcepts)
  score += weighted * 4

  // Grade level match
  if (plan.gradeLevel && candidate.gradeLevel === plan.gradeLevel) score += 2

  // Difficulty match
  if (candidate.difficulty === (DIFFICULTY_MAP[plan.difficulty] ?? 'medium')) score += 2

  // Subject match
  if (
    candidate.subject &&
    profile.domain &&
    candidate.subject === profile.domain
  ) {
    score += 2
  }

  // Require at least one **content** signal: concept overlap OR same subject.
  // gradeLevel alone is too weak (小学/数学 candidate would match 小学/拼音 query).
  const sameSubject =
    !!candidate.subject &&
    !!profile.domain &&
    profile.domain !== 'auto-detect' &&
    candidate.subject === profile.domain
  if (matchedCount === 0 && !sameSubject) {
    return 0
  }

  return score
}
