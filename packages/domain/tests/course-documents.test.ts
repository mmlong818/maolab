import { afterAll, beforeAll, expect, test } from 'vitest'
import { applyCourseDdl, checkCourseSchema, CourseOwnerMismatchError, PgCourseDocuments } from '../src/course-documents.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
const SCHEMA = 'domain_test_course'
const A = 'domain_test_teacher_a'
const B = 'domain_test_teacher_b'
let clock = 1_000
const docs = new PgCourseDocuments(pool, { schema: SCHEMA, now: () => clock })
const a = docs.forOwner(A)
const b = docs.forOwner(B)
const payload = (topic: string) => ({ id: 'ignored-by-store', topic, 'z-last-key': 1, nested: { 中文: '勾股定理', list: [3, 1, 2], empty: {} }, qualityStatus: 'draft' })

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query(`insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0), ($2, $2, 0, 0) on conflict do nothing`, [A, B])
  await applyCourseDdl(pool, SCHEMA)
  await applyCourseDdl(pool, SCHEMA)
})
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = any($1)', [[A, B]])
  await pool.end()
})

test('0005 is idempotent, guarded by checkCourseSchema and links owners to accounts', async () => {
  await expect(checkCourseSchema(pool, SCHEMA)).resolves.toBeUndefined()
  await expect(checkCourseSchema(pool, 'domain_test_course_absent')).rejects.toThrow(/0005/)
  const fk = await pool.query(`select 1 from pg_constraint where conname = 'fk_documents_owner' and conrelid = to_regclass($1)`, [`${SCHEMA}.documents`])
  expect(fk.rowCount).toBe(1)
  await expect(docs.forOwner('domain_test_nobody').save('course', { id: 'orphan', title: 't', status: 'draft', payload: {} })).rejects.toMatchObject({ code: '23503' })
})

test('payload round-trips byte for byte, key order included', async () => {
  const written = payload('勾股定理')
  await a.save('course', { id: 'c-roundtrip', title: '勾股定理', status: 'draft', payload: written })
  const row = (await a.find('course', 'c-roundtrip'))!
  expect(JSON.stringify(row.payload)).toBe(JSON.stringify(written))
  expect(Object.keys(row.payload as object)).toEqual(['id', 'topic', 'z-last-key', 'nested', 'qualityStatus'])
  expect(row).toMatchObject({ owner: A, kind: 'course', origin: 'prep', title: '勾股定理', status: 'draft', createdAt: 1_000, updatedAt: 1_000 })
})

test('updatedAt is monotonic even when the clock stands still or goes back', async () => {
  clock = 2_000
  const v1 = await a.save('course', { id: 'c-version', title: 't', status: 'draft', payload: payload('v1') })
  const v2 = await a.save('course', { id: 'c-version', title: 't', status: 'draft', payload: payload('v2') })
  clock = 1_500
  const v3 = await a.save('course', { id: 'c-version', title: 't', status: 'passed', payload: payload('v3') })
  expect([v1, v2, v3]).toEqual([2_000, 2_001, 2_002])
  expect((await a.find('course', 'c-version'))!).toMatchObject({ createdAt: 2_000, updatedAt: 2_002, status: 'passed' })
})

test('saveIfUnchanged is a compare-and-set that never inserts missing rows', async () => {
  clock = 3_000
  expect(await a.saveIfUnchanged('course', { id: 'c-cas', title: 't', status: 'draft', payload: payload('new') }, 0)).toBe(false)
  expect(await a.find('course', 'c-cas')).toBeUndefined()
  await a.save('course', { id: 'c-cas', title: 't', status: 'draft', payload: payload('new') })
  const current = (await a.find('course', 'c-cas'))!.updatedAt
  expect(await a.saveIfUnchanged('course', { id: 'c-cas', title: 't', status: 'draft', payload: payload('stale') }, current - 1)).toBe(false)
  expect(((await a.find('course', 'c-cas'))!.payload as { topic: string }).topic).toBe('new')
  expect(await a.saveIfUnchanged('course', { id: 'c-cas', title: 't', status: 'draft', payload: payload('fresh') }, current)).toBe(true)
  expect(((await a.find('course', 'c-cas'))!.payload as { topic: string }).topic).toBe('fresh')
})

test('saveIfUnchanged after a delete returns false and does not bring the row back', async () => {
  clock = 3_500
  const v = await a.save('course', { id: 'c-gone', title: 't', status: 'draft', payload: payload('kept') })
  expect(await a.delete('course', 'c-gone')).toBe(true)
  expect(await a.saveIfUnchanged('course', { id: 'c-gone', title: 't', status: 'draft', payload: payload('revived') }, v)).toBe(false)
  expect(await a.find('course', 'c-gone')).toBeUndefined()
  expect((await pool.query(`select count(*)::int as n from ${SCHEMA}.documents where id = 'c-gone'`)).rows[0].n).toBe(0)
})

test('owners cannot see, overwrite, compare-and-set or delete each other, and kinds never mix', async () => {
  clock = 4_000
  await a.save('course', { id: 'c-private', title: 'A 的课', status: 'draft', payload: payload('A') })
  const before = JSON.stringify(await a.find('course', 'c-private'))
  expect(await b.find('course', 'c-private')).toBeUndefined()
  expect((await b.list('course')).map((row) => row.id)).toEqual([])
  await expect(b.save('course', { id: 'c-private', title: '抢写', status: 'draft', payload: payload('B') })).rejects.toBeInstanceOf(CourseOwnerMismatchError)
  expect(await b.saveIfUnchanged('course', { id: 'c-private', title: '抢写', status: 'draft', payload: payload('B') }, 4_000)).toBe(false)
  expect(await b.delete('course', 'c-private')).toBe(false)
  expect(JSON.stringify(await a.find('course', 'c-private'))).toBe(before)
  expect(await a.find('season', 'c-private')).toBeUndefined()
  await expect(a.save('season', { id: 'c-private', title: '季', status: 'active', payload: {} })).rejects.toBeInstanceOf(CourseOwnerMismatchError)
})

test('list is newest first per owner and kind; delete removes', async () => {
  clock = 5_000
  await a.save('season', { id: 's-1', title: '季一', status: 'active', payload: { id: 's-1' } })
  clock = 5_001
  await a.save('season', { id: 's-2', title: '季二', status: 'active', payload: { id: 's-2' } })
  expect((await a.list('season')).map((row) => row.id)).toEqual(['s-2', 's-1'])
  expect(await a.delete('season', 's-1')).toBe(true)
  expect((await a.list('season')).map((row) => row.id)).toEqual(['s-2'])
})

