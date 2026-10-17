import { buildReadyFixtureCourse, createMainlineCourseStore, createMemoryCourseDocuments, packageContentOf, packageDraftOf, PREP_FIXTURE_KP_IDS, type CourseDocumentStore } from '@maolab/course'
import { generateSigningKeyPair, publicKeysFromPem, readPackage, readPng, ALLOWED_PNG_CHUNKS, signingKeyFromPem } from '@maolab-core/course-package'
import type { ExportBuild, ExportVersion, OwnerExports, RenderJob } from '@maolab/domain'
import type { BrowserContext } from 'playwright-core'
import { expect, test } from 'vitest'
import type { CaptureOptions, CapturedProjection } from '../src/capture.ts'
import { handleRenderJob, type RenderJobDeps } from '../src/jobs.ts'
import { stripPng, type PackagingDeps } from '../src/package-export.ts'
import { createMemoryArtifacts } from './helpers/memory-artifacts.ts'
import { pngWithChunk, solidPng } from './helpers/png.ts'

const OWNER = 'teacher-a'
const ORIGIN = 'http://web.test'
const NOW = Date.parse('2026-10-17T08:00:00+08:00')
const PACKAGE_ID = 'pk_testpackage0001'
const keys = generateSigningKeyPair()
const publicKeys = publicKeysFromPem([keys.publicKeyPem])
const goodMetrics = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 0, occupiedAreaRatio: 0.35 }

/** PgExports 的内存版（同语义：同签名 unchanged 且不打包；撤回拒绝） */
function memoryExports(): Pick<OwnerExports, 'get' | 'appendVersion' | 'list'> & { versions: ExportVersion[]; recalled: boolean } {
  const state = { versions: [] as ExportVersion[], recalled: false }
  return {
    get versions() { return state.versions },
    get recalled() { return state.recalled },
    set recalled(v: boolean) { state.recalled = v },
    async list() { return [{ packageId: PACKAGE_ID, owner: OWNER, familyId: 'fam', status: state.recalled ? 'recalled' as const : 'active' as const, createdAt: NOW, versions: state.versions }] },
    async get(id) { return id === PACKAGE_ID ? { packageId: PACKAGE_ID, owner: OWNER, familyId: 'fam', status: state.recalled ? 'recalled' : 'active', createdAt: NOW } : undefined },
    async appendVersion(id, input) {
      if (id !== PACKAGE_ID) throw Object.assign(new Error('nf'), { code: 'NOT_FOUND' })
      const last = state.versions.at(-1)
      if (last?.signature === input.signature) return { kind: 'unchanged', version: last }
      const version = (last?.version ?? 0) + 1
      const built: ExportBuild = await input.build(version)
      const row: ExportVersion = { packageId: id, version, sourceCourseId: input.sourceCourseId, signature: input.signature, createdAt: NOW, ...built }
      state.versions.push(row)
      return { kind: 'created', version: row }
    },
  }
}

async function harness(options: { signing?: boolean; identifiers?: string[]; screenshot?: () => Buffer } = {}) {
  const documents = new Map<string, CourseDocumentStore>()
  const documentsFor = (owner: string) => { let d = documents.get(owner); if (!d) { d = createMemoryCourseDocuments(); documents.set(owner, d) } return d }
  const { courseId } = await buildReadyFixtureCourse(documentsFor(OWNER))
  const artifacts = createMemoryArtifacts(() => NOW)
  const exports = memoryExports()
  const urls: string[] = []
  const packaging: PackagingDeps = {
    signingKey: options.signing === false ? undefined : signingKeyFromPem(keys.privateKeyPem),
    coreVersion: '0.1.0',
    exportsFor: () => exports,
    identifiersOf: async () => [OWNER, ...(options.identifiers ?? [])],
    datasetVersion: async () => '2026-10-01T00:00:00Z',
    knowledgePoints: async (ids) => ids.map((id) => ({ id, subject: '语文', gradeBand: '初中' as const })),
  }
  const deps: RenderJobDeps = {
    documentsFor, artifacts, origin: ORIGIN, timeoutMs: 1_000, now: () => NOW,
    withContext: async (fn) => fn({} as BrowserContext),
    routes: async () => undefined,
    capture: async (_c, url, _n, _o: CaptureOptions): Promise<CapturedProjection> => { urls.push(url); return { screenshot: options.screenshot?.() ?? solidPng(1920, 1080), metrics: goodMetrics } },
    packaging,
  }
  const course = (await createMainlineCourseStore(documentsFor(OWNER)).findMainlineCourse(courseId))!
  return { deps, artifacts, exports, urls, courseId, course, store: createMainlineCourseStore(documentsFor(OWNER)) }
}

const job = (courseId: string, payload: Record<string, unknown> = { packageId: PACKAGE_ID }): RenderJob => ({
  id: `rj_pkg_${courseId}`, owner: OWNER, courseId, kind: 'export-package', requestKey: 'k', payload, status: 'running', attempts: 1, maxAttempts: 3,
  availableAt: NOW, leaseHolder: 'w', leaseExpiresAt: NOW + 1_000, result: null, error: null, createdAt: NOW, updatedAt: NOW, finishedAt: null,
})

type PackageResult = { packageId: string; version: number; artifactId: string; url: string; filename: string; bytes: number; sha256: string; pageCount: number; unchanged: boolean }

test('an accepted course becomes a signed package the study room can read, with the same pages and text as the class outline', async () => {
  const t = await harness()
  const out = await handleRenderJob(job(t.courseId), t.deps)
  expect(out.ok).toBe(true)
  const result = (out as { result: PackageResult }).result
  expect(result).toMatchObject({ packageId: PACKAGE_ID, version: 1, unchanged: false, url: `/api/prep/artifacts/${result.artifactId}` })
  expect(result.filename).toMatch(/-v1\.maolab-course\.zip$/)
  const stored = (await t.artifacts.forOwner(OWNER).get(result.artifactId))!
  expect(stored).toMatchObject({ kind: 'package', contentType: 'application/zip', expiresAt: null })
  const pkg = readPackage(new Uint8Array(stored.bytes), { publicKeys, identifiers: [OWNER] })
  const draft = packageDraftOf(t.course)
  if (!draft.ok) throw new Error('fixture not ready')
  const content = packageContentOf(draft.draft.snapshot)
  expect(pkg.manifest).toMatchObject({ packageId: PACKAGE_ID, version: 1, subject: '语文', gradeBand: '初中', pageCount: content.pages.length, kpIds: [...PREP_FIXTURE_KP_IDS], exporter: { product: 'maolab', coreVersion: '0.1.0' }, knowledgeDataset: { name: 'k12-knowledge-points', version: '2026-10-01T00:00:00Z' } })
  expect(pkg.lesson.pages.map((p) => p.title)).toEqual(content.pages.map((p) => p.title))
  expect(pkg.lesson.outline).toBe(content.outline)
  expect(t.urls).toHaveLength(content.pages.length)
  expect(result.pageCount).toBe(content.pages.length)
})

test('exporting the same accepted course again is unchanged: no screenshots, same artifact', async () => {
  const t = await harness()
  const first = (await handleRenderJob(job(t.courseId), t.deps)) as { result: PackageResult }
  const shots = t.urls.length
  const again = await handleRenderJob(job(t.courseId), t.deps)
  expect(again).toMatchObject({ ok: true, result: { unchanged: true, version: 1, artifactId: first.result.artifactId, url: first.result.url } })
  expect(t.urls).toHaveLength(shots)
})

test('without a signing key the job fails for good before any screenshot', async () => {
  const t = await harness({ signing: false })
  expect(await handleRenderJob(job(t.courseId), t.deps)).toMatchObject({ ok: false, error: { code: 'PACKAGE_SIGNING_UNCONFIGURED', retryable: false } })
  expect(t.urls).toEqual([])
})

test("text that contains the teacher's account details is refused by the privacy scan and nothing is stored", async () => {
  const probe = await harness()
  const draft = packageDraftOf(probe.course)
  if (!draft.ok) throw new Error('fixture not ready')
  const leaked = packageContentOf(draft.draft.snapshot).pages[0]!.title
  const t = await harness({ identifiers: [leaked] })
  const out = await handleRenderJob(job(t.courseId), t.deps)
  expect(out).toMatchObject({ ok: false, error: { code: 'PACKAGE_privacy', retryable: false } })
  // 终审 Minor 1：文字与元数据的校验在开浏览器之前做，不白截一整课
  expect(t.urls).toEqual([])
  expect(t.exports.versions).toEqual([])
  expect(t.artifacts.all().filter((a) => a.kind === 'package')).toEqual([])
})

test('a recalled package or a missing package id fails for good', async () => {
  const t = await harness()
  expect(await handleRenderJob(job(t.courseId, {}), t.deps)).toMatchObject({ ok: false, error: { code: 'PACKAGE_INPUT', retryable: false } })
  t.exports.recalled = true
  expect(await handleRenderJob(job(t.courseId), t.deps)).toMatchObject({ ok: false, error: { code: 'PACKAGE_RECALLED', retryable: false } })
})

test('screenshots carrying metadata chunks are re-encoded with allowed chunks only', async () => {
  const withMeta = pngWithChunk(solidPng(1920, 1080), 'iCCP', Buffer.from('icc\0\0profile'))
  expect(readPng(withMeta)!.chunks).toContain('iCCP')
  const stripped = stripPng(withMeta)
  expect(readPng(stripped)!.chunks.every((c) => ALLOWED_PNG_CHUNKS.has(c))).toBe(true)
  expect(readPng(stripped)).toMatchObject({ width: 1920, height: 1080 })
  const t = await harness({ screenshot: () => withMeta })
  expect(await handleRenderJob(job(t.courseId), t.deps)).toMatchObject({ ok: true })
})

test('a delayed job for an older revision cannot become the newest version once a newer revision is in the package (final review Minor 4)', async () => {
  const t = await harness()
  // 同族修订号 2 的课已导出为最新版本
  const newer = { ...t.course, id: 'newer-revision', revision: { familyId: t.course.revision?.familyId ?? t.course.id, revisionNo: 2, basedOnCourseId: t.course.id } }
  await t.store.saveMainlineCourse(newer as typeof t.course)
  t.exports.versions.push({ packageId: PACKAGE_ID, version: 1, sourceCourseId: 'newer-revision', signature: 'sig-newer', artifactId: 'ar_x', sha256: 'a'.repeat(64), bytes: 1, pageCount: 1, createdAt: NOW })
  expect(await handleRenderJob(job(t.courseId), t.deps)).toMatchObject({ ok: false, error: { code: 'PACKAGE_STALE_REVISION', retryable: false } })
  expect(t.urls).toEqual([])
  expect(t.exports.versions).toHaveLength(1)
})
