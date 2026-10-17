import { afterAll, beforeAll, expect, test } from 'vitest'
import { applyCourseDdl, PgCourseDocuments } from '../src/course-documents.ts'
import { PgRenderJobs, RenderJobCourseNotFoundError, RenderJobKeyConflictError } from '../src/render-jobs.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
const SCHEMA = 'domain_test_render_jobs'
const A = 'domain_test_jobs_a'
const B = 'domain_test_jobs_b'
let clock = 1_000
const docs = new PgCourseDocuments(pool, { schema: SCHEMA, now: () => clock })
const jobs = new PgRenderJobs(pool, { schema: SCHEMA, now: () => clock })
const a = jobs.forOwner(A)
const b = jobs.forOwner(B)
const PAGE = { pageId: 'page-1' }
const err = (retryable: boolean) => ({ code: retryable ? 'RENDER_TIMEOUT' : 'SESSION_CONFLICT', message: '测试', retryable })
const drain = async () => { for (let job = await jobs.claim('drain', 1); job; job = await jobs.claim('drain', 1)) await jobs.complete(job, 'drain', {}) }

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query(`insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0), ($2, $2, 0, 0) on conflict do nothing`, [A, B])
  await applyCourseDdl(pool, SCHEMA)
  for (const id of ['c-a1', 'c-a2', 'c-a3']) await docs.forOwner(A).save('course', { id, title: id, status: 'draft', payload: { id } })
  await docs.forOwner(B).save('course', { id: 'c-b1', title: 'B', status: 'draft', payload: { id: 'c-b1' } })
})
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = any($1)', [[A, B]])
  await pool.end()
})

test('enqueue is idempotent per owner and request key and only accepts the owner\'s own courses', async () => {
  const first = await a.enqueue({ courseId: 'c-a1', kind: 'render-page', requestKey: 'k-1', payload: { pageId: 'page-1' } })
  const again = await a.enqueue({ courseId: 'c-a1', kind: 'render-page', requestKey: 'k-1', payload: { pageId: 'page-1' } })
  expect(first.created).toBe(true)
  expect(again).toMatchObject({ created: false, job: { id: first.job.id } })
  expect(first.job).toMatchObject({ owner: A, courseId: 'c-a1', kind: 'render-page', status: 'queued', attempts: 0, maxAttempts: 3, availableAt: 1_000, payload: { pageId: 'page-1' }, leaseHolder: null })
  await expect(a.enqueue({ courseId: 'c-a2', kind: 'render-page', payload: PAGE, requestKey: 'k-1' })).rejects.toBeInstanceOf(RenderJobKeyConflictError)
  await expect(b.enqueue({ courseId: 'c-a1', kind: 'export-pptx', requestKey: 'steal' })).rejects.toBeInstanceOf(RenderJobCourseNotFoundError)
  await expect(a.enqueue({ courseId: 'c-missing', kind: 'export-pptx', requestKey: 'k-2' })).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' })
  await expect(a.enqueue({ courseId: 'c-a1', kind: 'render-page', payload: PAGE, requestKey: '' })).rejects.toThrow(/requestKey/)
  // B 投同样的 key 是 B 自己的任务，互不影响
  expect((await b.enqueue({ courseId: 'c-b1', kind: 'render-page', payload: PAGE, requestKey: 'k-1' })).created).toBe(true)
  expect(await b.get(first.job.id)).toBeUndefined()
  expect((await a.listForCourse('c-a1')).map((job) => job.id)).toEqual([first.job.id])
  await drain()
})

test('an owner cannot enqueue a job for another owner\'s course (owner check is in the insert statement)', async () => {
  await expect(b.enqueue({ courseId: 'c-a2', kind: 'render-page', payload: PAGE, requestKey: 'cross-owner' })).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND', courseId: 'c-a2' })
  const leaked = await pool.query(`select count(*)::int as n from ${SCHEMA}.render_jobs where owner = $1 and course_id = $2`, [B, 'c-a2'])
  expect(leaked.rows[0].n).toBe(0)
  expect(await a.listForCourse('c-a2')).toEqual([])
})

test('a render-page job must name its page with a non-empty pageId (final review I1)', async () => {
  for (const payload of [undefined, {}, { pageId: '' }, { pageId: '   ' }, { pageId: 7 }]) {
    await expect(a.enqueue({ courseId: 'c-a1', kind: 'render-page', requestKey: 'no-page', ...(payload ? { payload } : {}) })).rejects.toThrow(/pageId/)
  }
  const rows = await pool.query(`select count(*)::int as n from ${SCHEMA}.render_jobs where request_key = 'no-page'`)
  expect(rows.rows[0].n).toBe(0)
  // export-pptx 不需要 pageId
  expect((await a.enqueue({ courseId: 'c-a1', kind: 'export-pptx', requestKey: 'export-no-page' })).created).toBe(true)
  await drain()
})

test('two workers never claim the same job', async () => {
  clock = 2_000
  await a.enqueue({ courseId: 'c-a1', kind: 'render-page', payload: PAGE, requestKey: 'race-1' })
  const [x, y] = await Promise.all([jobs.claim('worker-x', 60_000), jobs.claim('worker-y', 60_000)])
  const claimed = [x, y].filter(Boolean)
  expect(claimed).toHaveLength(1)
  expect(claimed[0]).toMatchObject({ status: 'running', attempts: 1, leaseExpiresAt: 62_000 })
  await a.enqueue({ courseId: 'c-a2', kind: 'render-page', payload: PAGE, requestKey: 'race-2' })
  await a.enqueue({ courseId: 'c-a3', kind: 'render-page', payload: PAGE, requestKey: 'race-3' })
  const both = await Promise.all([jobs.claim('worker-x', 60_000), jobs.claim('worker-y', 60_000)])
  expect(new Set(both.map((job) => job?.id)).size).toBe(2)
  await drain()
  for (const job of [...claimed, ...both]) if (job) await jobs.complete(job, job.leaseHolder!, {})
})

test('five parallel workers drain twenty jobs with each job claimed exactly once', async () => {
  clock = 2_500
  const enqueued = new Set<string>()
  for (let i = 0; i < 20; i++) enqueued.add((await a.enqueue({ courseId: ['c-a1', 'c-a2', 'c-a3'][i % 3]!, kind: 'render-page', payload: PAGE, requestKey: `swarm-${i}` })).job.id)
  const worker = async (name: string) => {
    const got: string[] = []
    for (let job = await jobs.claim(name, 60_000); job; job = await jobs.claim(name, 60_000)) {
      got.push(job.id)
      expect(await jobs.complete(job, name, {})).toBe(true)
    }
    return got
  }
  const results = await Promise.all(['s1', 's2', 's3', 's4', 's5'].map(worker))
  const all = results.flat()
  expect(all).toHaveLength(20)
  expect(new Set(all)).toEqual(enqueued)
})

test('jobs are claimed oldest first and a finished job is never claimed again', async () => {
  clock = 3_000
  const older = (await a.enqueue({ courseId: 'c-a1', kind: 'export-pptx', requestKey: 'order-1' })).job
  clock = 3_001
  await a.enqueue({ courseId: 'c-a2', kind: 'export-pptx', requestKey: 'order-2' })
  const first = (await jobs.claim('w', 60_000))!
  expect(first.id).toBe(older.id)
  expect(await jobs.complete(first, 'w', { ok: 1 })).toBe(true)
  expect(await a.get(first.id)).toMatchObject({ status: 'succeeded', result: { ok: 1 }, leaseHolder: null, finishedAt: 3_001 })
  const second = (await jobs.claim('w', 60_000))!
  expect(second.id).not.toBe(first.id)
  await jobs.complete(second, 'w', {})
  expect(await jobs.claim('w', 60_000)).toBeUndefined()
})

test('jobs enqueued in the same millisecond are claimed in enqueue order', async () => {
  clock = 3_500
  const ids: string[] = []
  for (let i = 0; i < 6; i++) ids.push((await a.enqueue({ courseId: ['c-a1', 'c-a2', 'c-a3'][i % 3]!, kind: 'render-page', payload: PAGE, requestKey: `same-ms-${i}` })).job.id)
  const claimed: string[] = []
  for (let job = await jobs.claim('w', 60_000); job; job = await jobs.claim('w', 60_000)) {
    claimed.push(job.id)
    await jobs.complete(job, 'w', {})
  }
  expect(claimed).toEqual(ids)
  expect((await a.listForCourse('c-a1')).slice(0, 2).map((job) => job.id)).toEqual([ids[3], ids[0]])
})

test('an expired lease is taken over and the stale worker can no longer write', async () => {
  clock = 4_000
  const job = (await a.enqueue({ courseId: 'c-a1', kind: 'render-page', payload: PAGE, requestKey: 'lease-1' })).job
  const stale = (await jobs.claim('worker-old', 1_000))!          // 租约到 5_000
  clock = 4_500
  expect(await jobs.heartbeat(stale, 'worker-old', 1_000)).toBe(true)   // 续到 5_500
  clock = 5_001
  expect(await jobs.claim('worker-new', 1_000)).toBeUndefined()
  clock = 6_001
  const fresh = (await jobs.claim('worker-new', 60_000))!
  expect(fresh).toMatchObject({ id: job.id, attempts: 2, leaseHolder: 'worker-new' })
  expect(await jobs.heartbeat(stale, 'worker-old', 1_000)).toBe(false)
  expect(await jobs.complete(stale, 'worker-old', { from: 'old' })).toBe(false)
  expect(await jobs.fail(stale, 'worker-old', err(true), 0)).toBe('lost')
  expect(await jobs.complete(fresh, 'worker-new', { from: 'new' })).toBe(true)
  expect(await a.get(job.id)).toMatchObject({ status: 'succeeded', result: { from: 'new' } })
})

test('retryable failures back off and stop at max attempts; non-retryable failures stop at once', async () => {
  clock = 10_000
  const job = (await a.enqueue({ courseId: 'c-a2', kind: 'render-page', payload: PAGE, requestKey: 'retry-1', maxAttempts: 2 })).job
  const first = (await jobs.claim('w', 60_000))!
  expect(await jobs.fail(first, 'w', err(true), 5_000)).toBe('retry')
  expect(await a.get(job.id)).toMatchObject({ status: 'queued', availableAt: 15_000, error: { code: 'RENDER_TIMEOUT' }, leaseHolder: null })
  expect(await jobs.claim('w', 60_000)).toBeUndefined()
  clock = 15_000
  const second = (await jobs.claim('w', 60_000))!
  expect(second.attempts).toBe(2)
  expect(await jobs.fail(second, 'w', err(true), 5_000)).toBe('failed')
  expect(await a.get(job.id)).toMatchObject({ status: 'failed', finishedAt: 15_000 })

  const once = (await a.enqueue({ courseId: 'c-a2', kind: 'render-page', payload: PAGE, requestKey: 'retry-2' })).job
  const claimed = (await jobs.claim('w', 60_000))!
  expect(claimed.id).toBe(once.id)
  expect(await jobs.fail(claimed, 'w', err(false), 5_000)).toBe('failed')
  expect(await a.get(once.id)).toMatchObject({ status: 'failed', error: { code: 'SESSION_CONFLICT', retryable: false } })
})

test('a job whose lease ran out on its last attempt is marked failed instead of being re-run', async () => {
  clock = 20_000
  const job = (await a.enqueue({ courseId: 'c-a3', kind: 'export-pptx', requestKey: 'exhaust-1', maxAttempts: 1 })).job
  await jobs.claim('crashing', 1_000)
  clock = 21_001
  expect(await jobs.claim('other', 1_000)).toBeUndefined()
  expect(await a.get(job.id)).toMatchObject({ status: 'failed', error: { code: 'LEASE_EXHAUSTED', retryable: false }, finishedAt: 21_001 })
})

test('deleting the course deletes its jobs', async () => {
  const job = (await a.enqueue({ courseId: 'c-a3', kind: 'render-page', payload: PAGE, requestKey: 'cascade-1' })).job
  await docs.forOwner(A).delete('course', 'c-a3')
  expect(await a.get(job.id)).toBeUndefined()
})
