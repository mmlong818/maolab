import { buildRenderingCourse, createMainlineCourseStore, goldenExportCourse } from '@maolab/course'
import { applyCourseDdl, EXPORT_RETENTION_MS, PgCourseArtifacts, PgCourseDocuments, PgRenderJobs } from '@maolab/domain'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { handleRenderJob, type RenderJobDeps } from '../src/jobs.ts'
import { runOnce, type LoopDeps } from '../src/loop.ts'
import { solidPng } from '../tests/helpers/png.ts'
import { testPool } from './helpers.ts'

const pool = testPool()
const SCHEMA = 'course_test_render_worker'
const OWNER = 'course_test_render_teacher'
let clock = 1_000_000
const documents = new PgCourseDocuments(pool, { schema: SCHEMA, now: () => clock })
const artifacts = new PgCourseArtifacts(pool, { schema: SCHEMA, now: () => clock })
const jobs = new PgRenderJobs(pool, { schema: SCHEMA, now: () => clock })
const shot = solidPng(32, 18)
const deps: RenderJobDeps = {
  documentsFor: (owner) => documents.forOwner(owner), artifacts, origin: 'http://web.test', timeoutMs: 1_000, now: () => clock,
  withContext: async (fn) => fn({} as never), routes: async () => {},
  capture: async () => ({ screenshot: shot, metrics: { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 0, occupiedAreaRatio: 0.3 } }),
}
const loop = (holder: string): LoopDeps => ({ jobs, handle: (job) => handleRenderJob(job, deps), holder, leaseMs: 1_000, heartbeatMs: 60_000, idleMs: 10, backoffMs: () => 0, log: () => {} })
const count = async (sql: string) => (await pool.query(sql, [OWNER])).rows[0].n as number

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query(`insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0) on conflict do nothing`, [OWNER])
  await applyCourseDdl(pool, SCHEMA)
  const store = createMainlineCourseStore(documents.forOwner(OWNER))
  await buildRenderingCourse(store, 'c-worker')
  await store.saveMainlineCourse(goldenExportCourse('c-worker-export'))
})
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = $1', [OWNER])
  await pool.end()
})

test('a worker that crashed after writing evidence is taken over without a second screenshot or a duplicate artifact', async () => {
  const owner = jobs.forOwner(OWNER)
  await owner.enqueue({ courseId: 'c-worker', kind: 'render-page', requestKey: 'page-1', payload: { pageId: 'page-1' } })
  clock += 1   // Ruling [T8/T9/T12]：两次入队之间推进时钟
  await owner.enqueue({ courseId: 'c-worker', kind: 'render-page', requestKey: 'page-2', payload: { pageId: 'page-2' } })
  // worker A 领到第一页，写完证据、推进了会话，在完成任务前崩溃
  const crashed = (await jobs.claim('worker-a', 1_000))!
  expect(crashed.payload).toEqual({ pageId: 'page-1' })
  expect(await handleRenderJob(crashed, deps)).toMatchObject({ ok: true })
  // worker B 先做第二页；A 的租约过期后再接手第一页：已截过，直接成功
  expect(await runOnce(loop('worker-b'))).toBe('succeeded')
  clock += 1_001
  expect(await runOnce(loop('worker-b'))).toBe('succeeded')
  expect(await jobs.complete(crashed, 'worker-a', {})).toBe(false)
  const listed = await owner.listForCourse('c-worker')
  expect(listed.map((job) => [job.requestKey, job.status, job.attempts]).sort()).toEqual([['page-1', 'succeeded', 2], ['page-2', 'succeeded', 1]])
  expect(listed.find((job) => job.requestKey === 'page-1')!.result).toMatchObject({ skipped: true, pageId: 'page-1' })
  const course = (await createMainlineCourseStore(documents.forOwner(OWNER)).findMainlineCourse('c-worker'))!
  expect(course.generationSession!.status).toBe('course-audit')
  expect(course.pageRenderEvidence!.map((evidence) => evidence.pageId).sort()).toEqual(['page-1', 'page-2'])
  // 两页截图字节相同：同一 owner、同一 kind 只存一份
  expect(await count(`select count(*)::int as n from ${SCHEMA}.artifacts where owner = $1 and kind = 'evidence'`)).toBe(1)
  expect(await runOnce(loop('worker-b'))).toBe('idle')
})

test('an export job stores an expiring pptx that the purge removes after the retention period', async () => {
  await jobs.forOwner(OWNER).enqueue({ courseId: 'c-worker-export', kind: 'export-pptx', requestKey: 'export-1' })
  expect(await runOnce(loop('worker-b'))).toBe('succeeded')
  const [done] = await jobs.forOwner(OWNER).listForCourse('c-worker-export')
  const result = done!.result as { artifactId: string; pageCount: number; expiresAt: number }
  expect(result).toMatchObject({ pageCount: 6, expiresAt: clock + EXPORT_RETENTION_MS })
  expect(await artifacts.forOwner(OWNER).head(result.artifactId)).toMatchObject({ kind: 'export' })
  clock += EXPORT_RETENTION_MS + 1
  expect(await artifacts.purgeExpired()).toBe(1)
  expect(await count(`select count(*)::int as n from ${SCHEMA}.artifacts where owner = $1 and kind = 'export'`)).toBe(0)
})
