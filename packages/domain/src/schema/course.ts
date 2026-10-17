// course schema（3a）：备课课程与课程季文档（spec 9.1）。payload 用 json 保键序；外键、CHECK 与锁超时以 migrations/0005_course.sql 为准。
import { sql } from 'drizzle-orm'
import { bigint, customType, index, integer, json, pgSchema, text, uniqueIndex } from 'drizzle-orm/pg-core'

export const course = pgSchema('course')

export const courseDocuments = course.table(
  'documents',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    kind: text('kind').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull(),
    origin: text('origin').notNull().default('prep'),
    payload: json('payload').notNull(),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ix_documents_owner_kind_updated').on(t.owner, t.kind, t.updatedAt.desc())],
)

// 3b：产物与渲染任务（0006）。CHECK、外键、锁超时以 migrations/0006_render.sql 为准。
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' })

export const courseArtifacts = course.table(
  'artifacts',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    sha256: text('sha256').notNull(),
    kind: text('kind').notNull(),
    contentType: text('content_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    storage: text('storage').notNull().default('pg'),
    content: bytea('content'),
    courseId: text('course_id'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    expiresAt: bigint('expires_at', { mode: 'number' }),
  },
  (t) => [
    index('ix_artifacts_owner_course').on(t.owner, t.courseId),
    index('ix_artifacts_expires').on(t.expiresAt).where(sql`${t.expiresAt} is not null`),
  ],
)

export const courseRenderJobs = course.table(
  'render_jobs',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    courseId: text('course_id').notNull(),
    kind: text('kind').notNull(),
    requestKey: text('request_key').notNull(),
    payload: json('payload').notNull(),
    status: text('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: bigint('available_at', { mode: 'number' }).notNull(),
    leaseHolder: text('lease_holder'),
    leaseExpiresAt: bigint('lease_expires_at', { mode: 'number' }),
    result: json('result'),
    error: json('error'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
    finishedAt: bigint('finished_at', { mode: 'number' }),
  },
  (t) => [
    uniqueIndex('ux_render_jobs_owner_request').on(t.owner, t.requestKey),
    index('ix_render_jobs_claim').on(t.status, t.availableAt).where(sql`${t.status} in ('queued', 'running')`),
    index('ix_render_jobs_owner_course').on(t.owner, t.courseId, t.createdAt.desc()),
  ],
)

// 3d：备课对话的会话与回合（0007）。CHECK、外键、锁超时以 migrations/0007_prep.sql 为准。
export const coursePrepSessions = course.table(
  'prep_sessions',
  {
    id: text('id').primaryKey(),
    owner: text('owner').notNull(),
    title: text('title').notNull(),
    courseId: text('course_id'),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [index('ix_prep_sessions_owner_updated').on(t.owner, t.updatedAt.desc())],
)

export const coursePrepRuns = course.table(
  'prep_runs',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id').notNull(),
    requestId: text('request_id').notNull(),
    inputHash: text('input_hash').notNull(),
    content: text('content').notNull(),
    status: text('status').notNull().default('running'),
    reply: json('reply'),
    errorCode: text('error_code'),
    claim: integer('claim').notNull().default(1),
    createdAt: bigint('created_at', { mode: 'number' }).notNull(),
    updatedAt: bigint('updated_at', { mode: 'number' }).notNull(),
  },
  (t) => [
    uniqueIndex('ux_prep_runs_session_request').on(t.sessionId, t.requestId),
    index('ix_prep_runs_session_created').on(t.sessionId, t.createdAt),
  ],
)
