import type {
  LearnerProfile,
  CourseHistory,
  ConceptMastery,
  AdaptiveState,
  TeachingPlan,
  Stage,
  Scene,
  ContentUnit,
  ContentUnitQuery,
  Program,
  ContentRef,
} from '@maolab/shared-types'

// ─── UserProfile ─────────────────────────────────────────────────────────────

export interface UserProfileRepository {
  find(id: 'me'): Promise<LearnerProfile | undefined>
  save(profile: LearnerProfile): Promise<void>

  appendCourseHistory(userId: 'me', entry: Omit<CourseHistory, 'id'>): Promise<string>
  updateCourseHistory(courseId: string, patch: Partial<CourseHistory>): Promise<void>
  getCourseHistory(userId: 'me'): Promise<CourseHistory[]>

  getAdaptiveState(userId: 'me'): Promise<AdaptiveState>
  saveAdaptiveState(userId: 'me', state: AdaptiveState): Promise<void>
}

// ─── ConceptMastery ──────────────────────────────────────────────────────────

export interface ConceptMasteryRepository {
  get(conceptId: string): Promise<ConceptMastery | undefined>
  upsert(entry: ConceptMastery): Promise<void>
  listWeak(threshold?: number): Promise<ConceptMastery[]>
  listAll(): Promise<ConceptMastery[]>
}

// ─── TeachingPlan ────────────────────────────────────────────────────────────

export interface TeachingPlanRepository {
  find(id: string): Promise<TeachingPlan | undefined>
  save(plan: TeachingPlan): Promise<void>
  list(): Promise<Pick<TeachingPlan, 'id' | 'topic' | 'createdAt' | 'gradeLevel' | 'outline'>[]>
}

// ─── Stage ───────────────────────────────────────────────────────────────────

export interface StageRepository {
  find(id: string): Promise<Stage | undefined>
  save(stage: Stage): Promise<void>
  updateStatus(id: string, status: Stage['status'], error?: string): Promise<void>
  updateScene(stageId: string, scene: Scene): Promise<void>
  listByPlan(planId: string): Promise<Pick<Stage, 'id' | 'status' | 'generatedAt'>[]>
}

// ─── ContentUnit ─────────────────────────────────────────────────────────────

export interface ContentUnitRepository {
  find(id: string): Promise<ContentUnit | undefined>
  findMany(ids: string[]): Promise<ContentUnit[]>
  save(unit: ContentUnit): Promise<void>
  delete(id: string): Promise<void>
  /** Tag-based retrieval; falls back to title/concept LIKE when `text` is set. */
  search(query: ContentUnitQuery): Promise<ContentUnit[]>
  /** Recalculate usageCount for a unit based on referencing programs. */
  refreshUsageCount(id: string): Promise<number>
}

// ─── Program ─────────────────────────────────────────────────────────────────

export interface ProgramRepository {
  find(id: string): Promise<Program | undefined>
  save(program: Program): Promise<void>
  updateStatus(id: string, status: Program['status'], error?: string): Promise<void>
  updateOrdered(id: string, ordered: ContentRef[]): Promise<void>
  listByPlan(planId: string): Promise<Pick<Program, 'id' | 'status' | 'generatedAt'>[]>
}

// ─── Media ───────────────────────────────────────────────────────────────────

export interface MediaRepository {
  save(filename: string, buffer: Buffer, mimeType: string): Promise<string>
  getUrl(filename: string): Promise<string>
  delete(filename: string): Promise<void>
}
