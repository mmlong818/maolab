/**
 * Content Unit System — atomic, reusable, indexable teaching content.
 *
 * Replaces the old "Stage owns embedded Scene[]" model. Each ContentUnit is an
 * independently generated, library-stored atom. A Program is the "节目单" — an
 * ordered list of ContentRef pointing into the library.
 */

import type { SceneContent } from './stage.js'

/** Four high-level pedagogical categories. */
export type ContentKind =
  | 'lecture'      // 知识讲解: PPT / image / video / animation / hotspot
  | 'interactive'  // 互动: interactive html / 3D model / drag-drop / branching / comparison
  | 'exercise'    // 练习: quiz / cloze — one item per page until answered
  | 'summary'      // 总结: review with placeholders for runtime data

/** Concrete renderer key — narrower than ContentKind. Maps to a SceneRenderer branch. */
export type ContentSubkind =
  // lecture
  | 'slide' | 'image' | 'video' | 'animation' | 'hotspot'
  // interactive
  | 'interactive' | 'model-3d' | 'drag-drop' | 'branching' | 'comparison' | 'math'
  // exercise
  | 'quiz' | 'cloze'
  // summary
  | 'summary'

export interface ContentUnit {
  id: string
  kind: ContentKind
  subkind: ContentSubkind
  title: string
  /** The actual renderable payload — same shape as the old Scene.content union. */
  content: SceneContent
  // ── Indexing / retrieval fields ────────────────────────────────────────────
  /** Concepts this unit teaches or assesses, e.g. ["光合作用","叶绿体"]. */
  concepts: string[]
  /** Coarse subject taxonomy, e.g. "biology" | "physics" | "history". */
  subject: string
  /** Grade level: "primary" | "junior" | "senior" | "university" | null. */
  gradeLevel?: string
  /** Difficulty band. */
  difficulty: 'easy' | 'medium' | 'hard'
  /** Suggested classroom duration in seconds. */
  durationHint: number
  /** Content language code, e.g. "zh-CN". */
  language: string
  /** Free-form tags for additional faceting. */
  tags: string[]
  /** Optional pre-computed embedding (reserved for future vector search). */
  embedding?: number[]
  /** How this unit entered the library. */
  origin: 'generated' | 'manual' | 'imported'
  /** First plan that produced this unit, if any. */
  sourcePlanId?: string
  createdAt: number
  /** Number of Programs currently referencing this unit. Maintained by the repository. */
  usageCount: number
}

/** A single slot in a Program's playlist. */
export interface ContentRef {
  /** Foreign key to ContentUnit.id */
  unitId: string
  /** Zero-based position in the program. */
  orderIndex: number
  /** Optional per-program overrides without mutating the underlying unit. */
  overrideTitle?: string
  /** Optional transition note shown between units (UI hint). */
  transitionNote?: string
}

/** A "节目单" — the playable program of a course. Replaces Stage. */
export type ProgramStatus = 'generating' | 'ready' | 'error' | 'partial'

export interface Program {
  id: string
  planId: string
  status: ProgramStatus
  /** Ordered playlist — references units in the library. */
  ordered: ContentRef[]
  /** Agent (teacher/student) configuration for this run. */
  agents: import('./plan.js').AgentConfig[]
  generatedAt?: number
  errorMessage?: string
}

/** Retrieval query — pass any subset of fields to match library units. */
export interface ContentUnitQuery {
  kind?: ContentKind | ContentKind[]
  subkind?: ContentSubkind | ContentSubkind[]
  subject?: string | string[]
  /** Match units whose `concepts` array intersects this list (OR). */
  concepts?: string[]
  /** Require ALL given concepts. */
  conceptsAll?: string[]
  gradeLevel?: string | string[]
  difficulty?: ContentUnit['difficulty'] | ContentUnit['difficulty'][]
  language?: string
  /** Match any of these tags. */
  tags?: string[]
  /** Free-text search over title + concepts + tags. */
  text?: string
  limit?: number
  offset?: number
}
