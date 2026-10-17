import { afterAll, beforeAll, expect, test } from 'vitest'
import {
  ArtifactRejectedError, artifactIdFor, checkRenderSchema, courseAssetSinkFor, EXPORT_RETENTION_MS,
  PgCourseArtifacts, PPTX_CONTENT_TYPE, sha256Hex,
} from '../src/course-artifacts.ts'
import { applyCourseDdl } from '../src/course-documents.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
const SCHEMA = 'domain_test_artifacts'
const A = 'domain_test_artifact_a'
const B = 'domain_test_artifact_b'
const C = 'domain_test_artifact_c'
let clock = 10_000
const store = new PgCourseArtifacts(pool, { schema: SCHEMA, now: () => clock, maxBytes: 1024 })
const a = store.forOwner(A)
const b = store.forOwner(B)
const png = (n: number) => new Uint8Array([0x89, 0x50, 0x4e, 0x47, n])
const count = async (where: string, params: unknown[]) => (await pool.query(`select count(*)::int as n from ${SCHEMA}.artifacts where ${where}`, params)).rows[0].n as number

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query(`insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0), ($2, $2, 0, 0), ($3, $3, 0, 0) on conflict do nothing`, [A, B, C])
  await applyCourseDdl(pool, SCHEMA)
  await applyCourseDdl(pool, SCHEMA)
})
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = any($1)', [[A, B, C]])
  await pool.end()
})

test('0006 applies idempotently, is guarded by checkRenderSchema and links owners to accounts', async () => {
  await expect(checkRenderSchema(pool, SCHEMA)).resolves.toBeUndefined()
  await expect(checkRenderSchema(pool, 'domain_test_render_absent')).rejects.toThrow(/0006/)
  const fks = await pool.query(`select conname from pg_constraint where conname in ('fk_artifacts_owner', 'fk_render_jobs_owner', 'fk_render_jobs_course') and connamespace = $1::regnamespace order by 1`, [SCHEMA])
  expect(fks.rows.map((r) => r.conname)).toEqual(['fk_artifacts_owner', 'fk_render_jobs_course', 'fk_render_jobs_owner'])
  await expect(store.forOwner('domain_test_nobody').put({ bytes: png(0), contentType: 'image/png', kind: 'image' })).rejects.toMatchObject({ code: '23503' })
})

test('the same bytes are stored once per owner and kind and read back byte for byte', async () => {
  const first = await a.put({ bytes: png(1), contentType: 'image/png', kind: 'evidence', courseId: 'c-1' })
  const again = await a.put({ bytes: png(1), contentType: 'image/png', kind: 'evidence', courseId: 'c-1' })
  expect(again.id).toBe(first.id)
  expect(first).toMatchObject({ owner: A, sha256: sha256Hex(png(1)), kind: 'evidence', contentType: 'image/png', byteSize: 5, courseId: 'c-1', createdAt: 10_000, expiresAt: null })
  expect(first.id).toBe(artifactIdFor(A, 'evidence', sha256Hex(png(1))))
  expect(first.id).toMatch(/^ar_[0-9a-f]{40}$/)
  expect([...(await a.get(first.id))!.bytes]).toEqual([...png(1)])
  expect(await count('owner = $1 and kind = $2', [A, 'evidence'])).toBe(1)
  expect((await a.put({ bytes: png(1), contentType: 'image/png', kind: 'image' })).id).not.toBe(first.id)
})

test('owners never see, read, or delete each other\'s artifacts', async () => {
  const mine = await a.put({ bytes: png(2), contentType: 'image/png', kind: 'image' })
  expect(await b.get(mine.id)).toBeUndefined()
  expect(await b.head(mine.id)).toBeUndefined()
  expect(await b.delete(mine.id)).toBe(false)
  expect(await a.head(mine.id)).toMatchObject({ id: mine.id })
  const theirs = await b.put({ bytes: png(2), contentType: 'image/png', kind: 'image' })
  expect(theirs.id).not.toBe(mine.id)
  expect(await a.delete(mine.id)).toBe(true)
  expect(await b.head(theirs.id)).toMatchObject({ owner: B })
})

test('exports expire and are purged; a re-put only ever extends the expiry', async () => {
  clock = 20_000
  const pptx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x01])
  const first = await a.put({ bytes: pptx, contentType: PPTX_CONTENT_TYPE, kind: 'export', expiresAt: clock + EXPORT_RETENTION_MS })
  const earlier = await a.put({ bytes: pptx, contentType: PPTX_CONTENT_TYPE, kind: 'export', expiresAt: 25_000 })
  expect(earlier.expiresAt).toBe(first.expiresAt)
  clock = first.expiresAt! + 1
  expect(await a.get(first.id)).toBeUndefined()
  expect(await store.purgeExpired()).toBe(1)
  expect(await count('id = $1', [first.id])).toBe(0)
  const permanent = await a.put({ bytes: png(3), contentType: 'image/png', kind: 'image' })
  expect((await a.put({ bytes: png(3), contentType: 'image/png', kind: 'image', expiresAt: clock + 1 })).expiresAt).toBeNull()
  expect(await store.purgeExpired()).toBe(0)
  expect(await a.head(permanent.id)).toBeDefined()
})

test('oversized, empty, unknown-type and unknown-kind inputs are refused before touching the database', async () => {
  const refused = async (input: Parameters<typeof a.put>[0]) => a.put(input).then(() => undefined, (e: unknown) => e)
  expect(await refused({ bytes: new Uint8Array(1025), contentType: 'image/png', kind: 'image' })).toMatchObject({ code: 'ARTIFACT_TOO_LARGE' })
  expect(await refused({ bytes: new Uint8Array(0), contentType: 'image/png', kind: 'image' })).toMatchObject({ code: 'ARTIFACT_INPUT' })
  expect(await refused({ bytes: png(4), contentType: 'text/html', kind: 'image' })).toMatchObject({ code: 'ARTIFACT_TYPE' })
  expect(await refused({ bytes: png(4), contentType: 'image/png', kind: 'script' as never })).toBeInstanceOf(ArtifactRejectedError)
  expect(await count('owner = $1 and byte_size in (0, 1025)', [A])).toBe(0)
})

test('the asset sink stores images under the course and returns the artifact address', async () => {
  const url = await courseAssetSinkFor(a, 'c-grid').put({ bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), contentType: 'image/svg+xml', name: 'grid.svg' })
  expect(url).toMatch(/^\/api\/prep\/artifacts\/ar_[0-9a-f]{40}$/)
  expect(await a.head(url.slice('/api/prep/artifacts/'.length))).toMatchObject({ kind: 'image', courseId: 'c-grid', contentType: 'image/svg+xml' })
})

test('deleting the account deletes its artifacts', async () => {
  await store.forOwner(C).put({ bytes: png(6), contentType: 'image/png', kind: 'image' })
  expect(await count('owner = $1', [C])).toBe(1)
  await pool.query('delete from account.users where username = $1', [C])
  expect(await count('owner = $1', [C])).toBe(0)
})
