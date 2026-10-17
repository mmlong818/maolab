import { afterAll, beforeAll, expect, test } from 'vitest'
import { applyCourseDdl } from '../src/course-documents.ts'
import { ExportError, PgExports, type ExportBuild } from '../src/exports.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
const SCHEMA = 'domain_test_exports'
const A = 'domain_test_exports_a'
const B = 'domain_test_exports_b'
let clock = 1_000
const store = new PgExports(pool, { schema: SCHEMA, now: () => clock++ })
const a = store.forOwner(A)
const b = store.forOwner(B)

let builds = 0
const build = (pageCount = 3) => async (version: number): Promise<ExportBuild> => {
  builds += 1
  return { artifactId: `ar_${String(version).padStart(40, '0')}`, sha256: 'a'.repeat(64), bytes: 1000 + version, pageCount }
}

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

test('one active package per teacher and revision family; the id satisfies the course-package id rule', async () => {
  const first = await a.ensureActivePackage('fam-1')
  const again = await a.ensureActivePackage('fam-1')
  expect(again.packageId).toBe(first.packageId)
  expect(first.packageId).toMatch(/^pk_[A-Za-z0-9_-]{8,61}$/)
  expect(first).toMatchObject({ owner: A, familyId: 'fam-1', status: 'active' })
  expect((await a.ensureActivePackage('fam-2')).packageId).not.toBe(first.packageId)
  expect(await a.activePackageFor('fam-1')).toMatchObject({ packageId: first.packageId })
  expect(await b.activePackageFor('fam-1')).toBeUndefined()
})

test('versions count up from 1; the same signature again is unchanged and does not build', async () => {
  const pkg = await a.ensureActivePackage('fam-v')
  const v1 = await a.appendVersion(pkg.packageId, { sourceCourseId: 'c-1', signature: 'sig-1', build: build() })
  expect(v1).toMatchObject({ kind: 'created', version: { version: 1, sourceCourseId: 'c-1', signature: 'sig-1', pageCount: 3 } })
  const before = builds
  const same = await a.appendVersion(pkg.packageId, { sourceCourseId: 'c-1', signature: 'sig-1', build: build() })
  expect(same).toMatchObject({ kind: 'unchanged', version: { version: 1 } })
  expect(builds).toBe(before)
  const v2 = await a.appendVersion(pkg.packageId, { sourceCourseId: 'c-2', signature: 'sig-2', build: build(4) })
  expect(v2).toMatchObject({ kind: 'created', version: { version: 2, sourceCourseId: 'c-2', pageCount: 4 } })
})

test('two concurrent exports of the same course make one version', async () => {
  const pkg = await a.ensureActivePackage('fam-race')
  const slow = (version: number) => new Promise<ExportBuild>((r) => setTimeout(() => r({ artifactId: `ar_${'1'.repeat(40)}`, sha256: 'b'.repeat(64), bytes: 9, pageCount: 2 + version - 1 }), 50))
  const [x, y] = await Promise.all([
    a.appendVersion(pkg.packageId, { sourceCourseId: 'c-r', signature: 'sig-r', build: slow }),
    a.appendVersion(pkg.packageId, { sourceCourseId: 'c-r', signature: 'sig-r', build: slow }),
  ])
  expect([x.kind, y.kind].sort()).toEqual(['created', 'unchanged'])
  const [listed] = await a.list({ familyId: 'fam-race' })
  expect(listed!.versions.map((v) => v.version)).toEqual([1])
})

test('a build that is not committed (lost race) is discarded; the committed one never is (final review Minor 3)', async () => {
  const pkg = await a.ensureActivePackage('fam-discard')
  let n = 0
  const discarded: string[] = []
  const slow = () => new Promise<ExportBuild>((r) => { const id = `ar_${String(++n).padStart(40, '7')}`; setTimeout(() => r({ artifactId: id, sha256: 'c'.repeat(64), bytes: 9, pageCount: 2 }), 50) })
  const input = { sourceCourseId: 'c-d', signature: 'sig-d', build: slow, discard: async (b: ExportBuild) => { discarded.push(b.artifactId) } }
  const [x, y] = await Promise.all([a.appendVersion(pkg.packageId, input), a.appendVersion(pkg.packageId, input)])
  const committed = [x, y].find((o) => o.kind === 'created')!.version.artifactId
  expect(discarded).toHaveLength(1)
  expect(discarded[0]).not.toBe(committed)
  // 同字节（同一产物 id）时不丢：丢了就把已提交版本的包删了
  const same = { sourceCourseId: 'c-e', signature: 'sig-e', build: async () => ({ artifactId: `ar_${'8'.repeat(40)}`, sha256: 'd'.repeat(64), bytes: 9, pageCount: 2 }), discard: async (b: ExportBuild) => { discarded.push(b.artifactId) } }
  const pkg2 = await a.ensureActivePackage('fam-discard-same')
  await Promise.all([a.appendVersion(pkg2.packageId, same), a.appendVersion(pkg2.packageId, same)])
  expect(discarded).toHaveLength(1)
})

test('recall: the package refuses new versions, a new export gets a new package id, recall twice keeps the first', async () => {
  const pkg = await a.ensureActivePackage('fam-r')
  await a.appendVersion(pkg.packageId, { sourceCourseId: 'c-1', signature: 'sig-1', build: build() })
  const recalled = await a.recall(pkg.packageId, { reason: '内容有误', artifactId: 'ar_recall_one' })
  expect(recalled).toMatchObject({ status: 'recalled', recallReason: '内容有误', recallArtifactId: 'ar_recall_one' })
  expect(recalled.recalledAt).toBeTypeOf('number')
  const twice = await a.recall(pkg.packageId, { artifactId: 'ar_recall_two' })
  expect(twice).toMatchObject({ recallArtifactId: 'ar_recall_one', recallReason: '内容有误' })
  await expect(a.appendVersion(pkg.packageId, { sourceCourseId: 'c-2', signature: 'sig-2', build: build() })).rejects.toMatchObject({ code: 'RECALLED' })
  expect(await a.activePackageFor('fam-r')).toBeUndefined()
  const fresh = await a.ensureActivePackage('fam-r')
  expect(fresh.packageId).not.toBe(pkg.packageId)
})

test('another teacher cannot see, extend or recall the package', async () => {
  const pkg = await a.ensureActivePackage('fam-iso')
  await a.appendVersion(pkg.packageId, { sourceCourseId: 'c-1', signature: 'sig-1', build: build() })
  expect(await b.list()).toEqual([])
  expect(await b.get(pkg.packageId)).toBeUndefined()
  await expect(b.appendVersion(pkg.packageId, { sourceCourseId: 'c-1', signature: 'sig-x', build: build() })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await expect(b.recall(pkg.packageId, { artifactId: 'ar_x' })).rejects.toBeInstanceOf(ExportError)
  expect((await a.get(pkg.packageId))?.status).toBe('active')
})

test('list returns packages newest first with their versions in order', async () => {
  const listed = await a.list({ familyId: 'fam-v' })
  expect(listed).toHaveLength(1)
  expect(listed[0]!.versions.map((v) => v.version)).toEqual([1, 2])
})

test('versions are immutable', async () => {
  await expect(pool.query(`update ${SCHEMA}.package_export_versions set page_count = 99`)).rejects.toThrow(/immutable/)
})
