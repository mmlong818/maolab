import { sqliteTable, text, real, integer } from 'drizzle-orm/sqlite-core'

// 学习者画像（单条记录 id='me'）
export const learnerProfiles = sqliteTable('learner_profiles', {
  id: text('id').primaryKey(),
  learnerType: text('learner_type', {
    enum: ['individual', 'group'],
  }).notNull().default('individual'),
  nickname: text('nickname'),
  age: integer('age'),
  gender: text('gender', { enum: ['male', 'female', 'other'] }),
  gradeLevel: text('grade_level'),
  preferredLanguage: text('preferred_language').notNull().default('zh-CN'),
  preferredStyle: text('preferred_style', {
    enum: ['lecture', 'socratic', 'project'],
  }).notNull().default('lecture'),
  preferredDifficulty: text('preferred_difficulty', {
    enum: ['beginner', 'intermediate', 'advanced'],
  }).notNull().default('intermediate'),
  preferredAgentCount: integer('preferred_agent_count').notNull().default(2),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// 课程历史
export const courseHistory = sqliteTable('course_history', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  stageId: text('stage_id').notNull(),
  completionRate: real('completion_rate').notNull().default(0),
  lastAccessedAt: integer('last_accessed_at'),
  totalDuration: integer('total_duration').notNull().default(0),
  status: text('status', {
    enum: ['generating', 'ready', 'in_progress', 'completed'],
  }).notNull().default('generating'),
})

// 概念掌握度（用户级，跨课程）
export const conceptMastery = sqliteTable('concept_mastery', {
  conceptId: text('concept_id').primaryKey(),
  score: real('score').notNull().default(0),
  lastReviewedAt: integer('last_reviewed_at').notNull(),
})

// 自适应状态（用户级，单条记录 id='me'）
export const adaptiveStates = sqliteTable('adaptive_states', {
  id: text('id').primaryKey(),
  weakConcepts: text('weak_concepts').notNull().default('[]'),
  recommendedNext: text('recommended_next').notNull().default('[]'),
  lastUpdated: integer('last_updated').notNull(),
})

// 教学计划
export const teachingPlans = sqliteTable('teaching_plans', {
  id: text('id').primaryKey(),
  topic: text('topic').notNull(),
  teachingMethod: text('teaching_method').notNull(),
  style: text('style').notNull(),
  language: text('language').notNull(),
  difficulty: text('difficulty').notNull(),
  outline: text('outline').notNull(),
  agents: text('agents').notNull(),
  emphasizedConcepts: text('emphasized_concepts').notNull().default('[]'),
  sourceDocuments: text('source_documents').notNull().default('[]'),
  gradeLevel: text('grade_level'),
  createdAt: integer('created_at').notNull(),
})

// v2 课程聚合 — Sprint 0 数据模型重塑
// 整体 Course 序列化为 JSON blob 存 data 字段；status 字段独立以便查询
// 当 MAOLAB_V2=1 时，新创建的课程写这张表；旧数据继续走 teaching_plans + stages
export const coursesV2 = sqliteTable('courses_v2', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  // 'season' = v4 M2 课程季信封行(schemaKind:'season',见 repositories/season.sqlite)
  origin: text('origin', { enum: ['one-line', 'paragraph', 'material', 'kp-selection', 'season'] }).notNull(),
  status: text('status').notNull(), // CourseStatusV2 字符串
  data: text('data').notNull(),     // JSON.stringify(CourseV2)
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
})

// 教学阶段 (LEGACY — keep for backward compatibility; new flow uses programs + content_units)
export const stages = sqliteTable('stages', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull(),
  status: text('status', {
    enum: ['generating', 'ready', 'error', 'partial'],
  }).notNull().default('generating'),
  scenes: text('scenes').notNull().default('[]'),
  agents: text('agents').notNull().default('[]'),
  generatedAt: integer('generated_at'),
  errorMessage: text('error_message'),
  /** Slide visual theme chosen at generation time (e.g. 'light' / 'swiss-grid' / 'editorial-monocle' / 'brutalist-mono'). Null = client fallback. */
  slideTheme: text('slide_theme'),
})

// 内容单元库 — 原子、可复用、可检索的教学内容
export const contentUnits = sqliteTable('content_units', {
  id: text('id').primaryKey(),
  kind: text('kind', {
    enum: ['lecture', 'interactive', 'exercise', 'summary'],
  }).notNull(),
  subkind: text('subkind').notNull(),
  title: text('title').notNull(),
  /** Full ContentUnit.content payload (SceneContent JSON). */
  content: text('content').notNull(),
  /** Concept IDs/names — JSON string[]. Indexed via FTS or LIKE matching. */
  concepts: text('concepts').notNull().default('[]'),
  subject: text('subject').notNull().default(''),
  gradeLevel: text('grade_level'),
  difficulty: text('difficulty', {
    enum: ['easy', 'medium', 'hard'],
  }).notNull().default('medium'),
  durationHint: integer('duration_hint').notNull().default(120),
  language: text('language').notNull().default('zh-CN'),
  /** Free-form tags — JSON string[]. */
  tags: text('tags').notNull().default('[]'),
  /** Optional embedding for future vector search — JSON number[] or NULL. */
  embedding: text('embedding'),
  origin: text('origin', {
    enum: ['generated', 'manual', 'imported'],
  }).notNull().default('generated'),
  sourcePlanId: text('source_plan_id'),
  createdAt: integer('created_at').notNull(),
  usageCount: integer('usage_count').notNull().default(0),
})

// atom-KP 索引 — atom 对 KP 的多对多投影,用于按 KP 复用历史 atom
export const atomByKp = sqliteTable('atom_by_kp', {
  id: text('id').primaryKey(),
  kpId: text('kp_id').notNull(),
  atomId: text('atom_id').notNull(),
  courseId: text('course_id').notNull(),
  atomType: text('atom_type').notNull(),
  ageBand: text('age_band').notNull(),
  subject: text('subject').notNull(),
  generatedAt: integer('generated_at').notNull(),
  payloadSnapshot: text('payload_snapshot').notNull(),
})

// 节目单 — 一门课程的有序 ContentRef 列表
export const programs = sqliteTable('programs', {
  id: text('id').primaryKey(),
  planId: text('plan_id').notNull(),
  status: text('status', {
    enum: ['generating', 'ready', 'error', 'partial'],
  }).notNull().default('generating'),
  /** Ordered ContentRef[] JSON — references content_units.id with order. */
  ordered: text('ordered').notNull().default('[]'),
  agents: text('agents').notNull().default('[]'),
  generatedAt: integer('generated_at'),
  errorMessage: text('error_message'),
})
