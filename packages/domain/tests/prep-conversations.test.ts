import { afterAll, beforeAll, expect, test } from 'vitest'
import { applyCourseDdl } from '../src/course-documents.ts'
import { PgPrepConversations, PrepRequestConflictError, PrepSessionNotFoundError, type PrepReply } from '../src/prep-conversations.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
const SCHEMA = 'domain_test_prep_conv'
const A = 'domain_test_prep_a'
const B = 'domain_test_prep_b'
let clock = 1_000
const store = new PgPrepConversations(pool, { schema: SCHEMA, now: () => clock })
const a = store.forOwner(A)
const b = store.forOwner(B)
const STALE = 60_000
const reply = (content: string): PrepReply => ({ messageId: 'm-1', content, outcome: 'completed', tools: [{ name: 'list_courses', ok: true }] })

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0), ($2, $2, 0, 0) on conflict do nothing', [A, B])
  await applyCourseDdl(pool, SCHEMA)
})
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = any($1)', [[A, B]])
  await pool.end()
})

test('sessions and runs are visible only to their owner', async () => {
  const s = await a.createSession({ title: '对话一', courseId: 'c-1' })
  expect(s).toMatchObject({ owner: A, title: '对话一', courseId: 'c-1', createdAt: 1_000 })
  expect(await b.getSession(s.id)).toBeUndefined()
  expect(await b.listSessions()).toEqual([])
  expect(await b.bindCourse(s.id, 'c-x')).toBeUndefined()
  await expect(b.startRun(s.id, { requestId: 'req-00001', inputHash: 'h1', content: '你好', staleAfterMs: STALE })).rejects.toBeInstanceOf(PrepSessionNotFoundError)
  const started = await a.startRun(s.id, { requestId: 'req-00001', inputHash: 'h1', content: '你好', staleAfterMs: STALE })
  expect(started.kind).toBe('claimed')
  expect(started.run.id).toMatch(/^[0-9a-f-]{36}$/)
  expect(await b.getRun(s.id, started.run.id)).toBeUndefined()
  expect(await b.completeRun(started.run.id, reply('偷写'), started.run.claim)).toBe(false)
  expect(await b.failRun(started.run.id, 'x', started.run.claim)).toBe(false)
  expect(await b.activeRuns({ staleAfterMs: STALE })).toEqual([])
  expect((await a.activeRuns({ staleAfterMs: STALE })).map((r) => r.id)).toEqual([started.run.id])
  expect((await a.getSession(s.id))?.courseId).toBe('c-1')
})

test('same requestId: running → running, completed → completed with the reply, different content → conflict', async () => {
  const s = await a.createSession({ title: '对话二' })
  const first = await a.startRun(s.id, { requestId: 'req-00002', inputHash: 'h2', content: '生成下一页', staleAfterMs: STALE })
  const again = await a.startRun(s.id, { requestId: 'req-00002', inputHash: 'h2', content: '生成下一页', staleAfterMs: STALE })
  expect(again).toMatchObject({ kind: 'running', run: { id: first.run.id } })
  await expect(a.startRun(s.id, { requestId: 'req-00002', inputHash: 'other', content: '别的', staleAfterMs: STALE })).rejects.toBeInstanceOf(PrepRequestConflictError)
  expect(await a.completeRun(first.run.id, reply('好的'), first.run.claim)).toBe(true)
  const replay = await a.startRun(s.id, { requestId: 'req-00002', inputHash: 'h2', content: '生成下一页', staleAfterMs: STALE })
  expect(replay).toMatchObject({ kind: 'completed', run: { id: first.run.id, status: 'completed', reply: { content: '好的' } } })
  expect((await a.runs(s.id)).map((r) => r.status)).toEqual(['completed'])
})

test('a failed run or a running run older than the stale window can be claimed again (same run id)', async () => {
  const s = await a.createSession({ title: '对话三' })
  const first = await a.startRun(s.id, { requestId: 'req-00003', inputHash: 'h3', content: '审查', staleAfterMs: STALE })
  expect(await a.failRun(first.run.id, 'timeout', first.run.claim)).toBe(true)
  const retried = await a.startRun(s.id, { requestId: 'req-00003', inputHash: 'h3', content: '审查', staleAfterMs: STALE })
  expect(retried).toMatchObject({ kind: 'claimed', run: { id: first.run.id, status: 'running', errorCode: null } })
  clock += STALE + 1
  expect((await a.activeRuns({ sessionId: s.id, staleAfterMs: STALE })).length).toBe(0)
  const stale = await a.startRun(s.id, { requestId: 'req-00003', inputHash: 'h3', content: '审查', staleAfterMs: STALE })
  expect(stale.kind).toBe('claimed')
  expect(stale.run.updatedAt).toBe(clock)
})

test('concurrent starts with the same requestId claim exactly once', async () => {
  const s = await a.createSession({ title: '对话四' })
  const results = await Promise.all(Array.from({ length: 5 }, () => a.startRun(s.id, { requestId: 'req-00004', inputHash: 'h4', content: '并发', staleAfterMs: STALE })))
  expect(results.filter((r) => r.kind === 'claimed').length).toBe(1)
  expect(new Set(results.map((r) => r.run.id)).size).toBe(1)
})

test('listSessions is newest first and bindCourse updates the course', async () => {
  clock += 10
  const s = await a.createSession({ title: '最新' })
  expect((await a.listSessions())[0]!.id).toBe(s.id)
  expect((await a.bindCourse(s.id, 'c-9'))?.courseId).toBe('c-9')
})

test('a stale worker cannot complete or fail a run after it was reclaimed (claim fencing); reclaim bumps the session', async () => {
  const s = await a.createSession({ title: '对话五' })
  const old = await a.startRun(s.id, { requestId: 'req-00005', inputHash: 'h5', content: '栅栏', staleAfterMs: STALE })
  expect(old.run.claim).toBe(1)
  clock += STALE + 1
  const fresh = await a.startRun(s.id, { requestId: 'req-00005', inputHash: 'h5', content: '栅栏', staleAfterMs: STALE })
  expect(fresh).toMatchObject({ kind: 'claimed', run: { id: old.run.id, claim: 2, updatedAt: clock } })
  expect((await a.getSession(s.id))?.updatedAt).toBe(clock)
  expect(await a.completeRun(old.run.id, reply('旧的'), old.run.claim)).toBe(false)
  expect(await a.failRun(old.run.id, 'stale', old.run.claim)).toBe(false)
  expect(await a.getRun(s.id, old.run.id)).toMatchObject({ status: 'running', reply: null, errorCode: null, claim: 2 })
  expect(await a.completeRun(fresh.run.id, reply('新的'), fresh.run.claim)).toBe(true)
  expect((await a.getRun(s.id, old.run.id))?.reply?.content).toBe('新的')
})

test('concurrent reclaimers of a stale run: exactly one claims', async () => {
  const s = await a.createSession({ title: '对话六' })
  const first = await a.startRun(s.id, { requestId: 'req-00006', inputHash: 'h6', content: '并发回收', staleAfterMs: STALE })
  clock += STALE + 1
  const results = await Promise.all(Array.from({ length: 5 }, () => a.startRun(s.id, { requestId: 'req-00006', inputHash: 'h6', content: '并发回收', staleAfterMs: STALE })))
  expect(results.filter((r) => r.kind === 'claimed').length).toBe(1)
  expect(results.filter((r) => r.kind === 'running').length).toBe(4)
  expect(new Set(results.map((r) => r.run.id))).toEqual(new Set([first.run.id]))
  expect(new Set(results.map((r) => r.run.claim))).toEqual(new Set([2]))
})

test('complete or fail on an already finished run has no effect', async () => {
  const s = await a.createSession({ title: '对话七' })
  const done = await a.startRun(s.id, { requestId: 'req-00007', inputHash: 'h7', content: '完成', staleAfterMs: STALE })
  expect(await a.completeRun(done.run.id, reply('第一次'), done.run.claim)).toBe(true)
  expect(await a.completeRun(done.run.id, reply('第二次'), done.run.claim)).toBe(false)
  expect(await a.failRun(done.run.id, 'late', done.run.claim)).toBe(false)
  expect(await a.getRun(s.id, done.run.id)).toMatchObject({ status: 'completed', reply: { content: '第一次' }, errorCode: null })
  const failed = await a.startRun(s.id, { requestId: 'req-00008', inputHash: 'h8', content: '失败', staleAfterMs: STALE })
  expect(await a.failRun(failed.run.id, 'timeout', failed.run.claim)).toBe(true)
  expect(await a.failRun(failed.run.id, 'again', failed.run.claim)).toBe(false)
  expect(await a.completeRun(failed.run.id, reply('迟到'), failed.run.claim)).toBe(false)
  expect(await a.getRun(s.id, failed.run.id)).toMatchObject({ status: 'failed', reply: null, errorCode: 'timeout' })
})
