// 排空脚本（3c 的端到端与真实模型验收用）：--fake-capture 时不开浏览器，把 schema 里排队的截图任务跑到空闲，证据写回课程。
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRenderingCourse, createMainlineCourseStore } from '@maolab/course'
import { applyCourseDdl, PgCourseDocuments, PgRenderJobs } from '@maolab/domain'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { testPool } from './helpers.ts'

const pool = testPool()
const SCHEMA = 'course_test_prep_drain'
const OWNER = 'course_test_prep_drain_teacher'
const workerDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let clock = 2_000_000

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0) on conflict do nothing', [OWNER])
  await applyCourseDdl(pool, SCHEMA)
  const documents = new PgCourseDocuments(pool, { schema: SCHEMA, now: () => clock })
  await buildRenderingCourse(createMainlineCourseStore(documents.forOwner(OWNER)), 'c-drain')
  const jobs = new PgRenderJobs(pool, { schema: SCHEMA, now: () => clock }).forOwner(OWNER)
  await jobs.enqueue({ courseId: 'c-drain', kind: 'render-page', requestKey: 'drain-1', payload: { pageId: 'page-1' } })
  clock += 1
  await jobs.enqueue({ courseId: 'c-drain', kind: 'render-page', requestKey: 'drain-2', payload: { pageId: 'page-2' } })
})
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = $1', [OWNER])
  await pool.end()
})

test('drain --fake-capture marks the summary truncated when --max-jobs runs out before idle, then a full run reaches idle and writes the evidence back', async () => {
  // 终审（T10 minor）：跑满 --max-jobs 还没 idle 时仍以 0 退出，但汇总带 truncated: true
  const partial = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/drain-queue.ts', '--schema', SCHEMA, '--fake-capture', '--max-jobs', '1'], { cwd: workerDir, encoding: 'utf8', timeout: 120_000 })
  expect(partial.status, partial.stderr).toBe(0)
  const first = JSON.parse(partial.stdout.trim().split('\n').at(-1)!)
  expect(first).toMatchObject({ schema: SCHEMA, fake: true, truncated: true, counts: { succeeded: 1 } })
  expect(first.counts.idle).toBeUndefined()
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/drain-queue.ts', '--schema', SCHEMA, '--fake-capture'], { cwd: workerDir, encoding: 'utf8', timeout: 120_000 })
  expect(run.status, run.stderr).toBe(0)
  expect(JSON.parse(run.stdout.trim().split('\n').at(-1)!)).toMatchObject({ schema: SCHEMA, fake: true, truncated: false, counts: { succeeded: 1, idle: 1 } })
  const course = await createMainlineCourseStore(new PgCourseDocuments(pool, { schema: SCHEMA }).forOwner(OWNER)).findMainlineCourse('c-drain')
  expect(course?.generationSession?.status).toBe('course-audit')
  expect(course?.pageRenderEvidence?.map((item) => item.pageId).sort()).toEqual(['page-1', 'page-2'])
}, 250_000)

test('drain refuses any schema outside course_test_*', () => {
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/drain-queue.ts', '--schema', 'course', '--fake-capture'], { cwd: workerDir, encoding: 'utf8', timeout: 60_000 })
  expect(run.status).toBe(2)
})
