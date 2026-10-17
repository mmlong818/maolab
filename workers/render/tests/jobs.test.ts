import JSZip from 'jszip'
import { buildRenderingCourse, createMainlineCourseStore, createMemoryCourseDocuments, goldenExportCourse, planProjectionExport, projectionRenderUrl, type CourseDocumentStore } from '@maolab/course'
import { EXPORT_RETENTION_MS, PPTX_CONTENT_TYPE, type RenderJob, type RenderJobKind } from '@maolab/domain'
import type { BrowserContext } from 'playwright-core'
import { expect, test } from 'vitest'
import { ProjectionPageError, type CaptureOptions, type CapturedProjection } from '../src/capture.ts'
import { handleRenderJob, type RenderJobDeps } from '../src/jobs.ts'
import { createMemoryArtifacts } from './helpers/memory-artifacts.ts'
import { solidPng } from './helpers/png.ts'

const OWNER = 'teacher-a'
const ORIGIN = 'http://web.test'
const NOW = Date.parse('2026-10-14T08:00:00+08:00')
const goodMetrics = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 0, occupiedAreaRatio: 0.35 }

function harness() {
  const documents = new Map<string, CourseDocumentStore>()
  const documentsFor = (owner: string) => { let d = documents.get(owner); if (!d) { d = createMemoryCourseDocuments(); documents.set(owner, d) } return d }
  const artifacts = createMemoryArtifacts(() => NOW)
  const urls: string[] = []
  const settles: string[] = []
  const served: unknown[] = []
  let capture = async (url: string, _n: number, options: CaptureOptions): Promise<CapturedProjection> => {
    urls.push(url)
    settles.push(options.settle)
    return { screenshot: solidPng(16, 9), metrics: goodMetrics }
  }
  const deps: RenderJobDeps = {
    documentsFor, artifacts, origin: ORIGIN, timeoutMs: 1_000, now: () => NOW,
    withContext: async (fn) => fn({} as BrowserContext),
    routes: async (_context, _origin, source) => { served.push(await source.course()) },
    capture: (_context, url, n, options) => capture(url, n, options),
  }
  return {
    deps, artifacts, urls, settles, served,
    store: (owner = OWNER) => createMainlineCourseStore(documentsFor(owner)),
    setCapture(fn: typeof capture) { capture = fn },
  }
}
const P1 = { pageId: 'page-1' }
const job = (kind: RenderJobKind, courseId: string, payload: Record<string, unknown> = {}, owner = OWNER): RenderJob => ({
  id: `rj_${kind}_${courseId}`, owner, courseId, kind, requestKey: 'k', payload, status: 'running', attempts: 1, maxAttempts: 3,
  availableAt: NOW, leaseHolder: 'w', leaseExpiresAt: NOW + 1_000, result: null, error: null, createdAt: NOW, updatedAt: NOW, finishedAt: null,
})

test('render-page opens the render page, stores the screenshot as evidence and advances the session', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-render')
  const out = await handleRenderJob(job('render-page', 'c-render', P1), t.deps)
  expect(out).toEqual({ ok: true, result: { done: false, blocked: false, pageId: 'page-1', evidenceId: expect.any(String), issues: expect.any(Array) } })
  expect(t.urls).toEqual([projectionRenderUrl(ORIGIN, 'c-render', 1)])
  expect(t.settles).toEqual(['gate'])
  const course = (await t.store().findMainlineCourse('c-render'))!
  expect(t.served).toHaveLength(1)
  const evidence = course.pageRenderEvidence![0]!
  expect(evidence.screenshotPath).toMatch(/^\/api\/prep\/artifacts\/ar_[0-9a-f]{40}$/)
  expect(await t.artifacts.forOwner(OWNER).head(evidence.screenshotPath.split('/').pop()!)).toMatchObject({ kind: 'evidence', contentType: 'image/png', courseId: 'c-render' })
  expect(course.generationSession!.jobs.map((j) => j.status)).toEqual(['passed', 'content-ready'])
})

test('a blocked page finishes the job with blocked = true and leaves the page waiting', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-blocked')
  t.setCapture(async () => ({ screenshot: solidPng(16, 9), metrics: { ...goodMetrics, minimumFontPx: 12 } }))
  const out = await handleRenderJob(job('render-page', 'c-blocked', P1), t.deps)
  expect(out).toMatchObject({ ok: true, result: { blocked: true, pageId: 'page-1', issues: expect.arrayContaining([expect.objectContaining({ code: 'font-size', severity: 'blocking' })]) } })
  const course = (await t.store().findMainlineCourse('c-blocked'))!
  expect(course.generationSession!.jobs[0]!.status).toBe('content-ready')
  expect(course.pageRenderEvidence).toHaveLength(1)
})

test('a job naming a page that is already rendered is skipped without a screenshot', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-skip')
  await handleRenderJob(job('render-page', 'c-skip', { pageId: 'page-1' }), t.deps)
  const again = await handleRenderJob(job('render-page', 'c-skip', { pageId: 'page-1' }), t.deps)
  expect(again).toEqual({ ok: true, result: { skipped: true, pageId: 'page-1', status: 'passed' } })
  expect(t.urls).toHaveLength(1)
})

test('someone else\'s course is not found and not retried', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-private')
  expect(await handleRenderJob(job('render-page', 'c-private', P1, 'teacher-b'), t.deps)).toMatchObject({ ok: false, error: { code: 'COURSE_NOT_FOUND', retryable: false } })
  expect(await handleRenderJob(job('export-pptx', 'c-private', {}, 'teacher-b'), t.deps)).toMatchObject({ ok: false, error: { code: 'COURSE_NOT_FOUND', retryable: false } })
  expect(t.urls).toEqual([])
})

test('a missing course fails with COURSE_NOT_FOUND before any browser context is opened (T8 e)', async () => {
  const t = harness()
  let contexts = 0
  const deps: RenderJobDeps = { ...t.deps, withContext: async (fn) => { contexts += 1; return fn({} as BrowserContext) } }
  expect(await handleRenderJob(job('render-page', 'c-missing', P1), deps)).toMatchObject({ ok: false, error: { code: 'COURSE_NOT_FOUND', retryable: false } })
  expect(await handleRenderJob(job('export-pptx', 'c-missing'), deps)).toMatchObject({ ok: false, error: { code: 'COURSE_NOT_FOUND', retryable: false } })
  expect(contexts).toBe(0)
  expect(t.served).toEqual([])
})

test('a render-page job whose pageId is unknown or missing fails with PAGE_NOT_FOUND and screenshots nothing (final review I1)', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-unknown')
  for (const payload of [{ pageId: 'page-from-an-old-session' }, {}, { pageId: '' }, { pageId: 3 }]) {
    expect(await handleRenderJob(job('render-page', 'c-unknown', payload), t.deps)).toMatchObject({ ok: false, error: { code: 'PAGE_NOT_FOUND', retryable: false } })
  }
  expect(t.urls).toEqual([])
  expect(t.served).toEqual([])
  const course = (await t.store().findMainlineCourse('c-unknown'))!
  expect(course.generationSession!.jobs.map((j) => j.status)).toEqual(['content-ready', 'content-ready'])
  expect(t.artifacts.all()).toEqual([])
})

test('timeouts and internal errors are retryable, page errors are not, and internal messages stay generic', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-errors')
  t.setCapture(async () => { throw new ProjectionPageError('RENDER_TIMEOUT', '超时') })
  expect(await handleRenderJob(job('render-page', 'c-errors', P1), t.deps)).toMatchObject({ ok: false, error: { code: 'RENDER_TIMEOUT', retryable: true } })
  t.setCapture(async () => { throw new ProjectionPageError('RENDER_PAGE_ERROR', '渲染页报错：渲染数据版本不符') })
  expect(await handleRenderJob(job('render-page', 'c-errors', P1), t.deps)).toMatchObject({ ok: false, error: { code: 'RENDER_PAGE_ERROR', retryable: false } })
  t.setCapture(async () => { throw new Error('Target closed at C:\\secret\\path') })
  const internal = await handleRenderJob(job('render-page', 'c-errors', P1), t.deps)
  expect(internal).toMatchObject({ ok: false, error: { code: 'RENDER_INTERNAL', retryable: true } })
  expect(JSON.stringify(internal)).not.toContain('secret')
})

test('navigation network errors (page origin unreachable) are retryable and keep only the net error name', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-net')
  t.setCapture(async () => { throw new Error('page.goto: net::ERR_CONNECTION_REFUSED at http://frontend-secret:8080/prep/render/?course=c-net&page=1') })
  const out = await handleRenderJob(job('render-page', 'c-net', P1), t.deps)
  expect(out).toMatchObject({ ok: false, error: { code: 'RENDER_NAVIGATION_FAILED', retryable: true, details: { net: 'ERR_CONNECTION_REFUSED' } } })
  expect(JSON.stringify(out)).not.toContain('secret')
})

test('export-pptx screenshots every presentation page in export mode, keeps teacher scripts as notes and stores an expiring export', async () => {
  const t = harness()
  const course = goldenExportCourse('c-export')
  await t.store().saveMainlineCourse(course)
  const out = await handleRenderJob(job('export-pptx', 'c-export'), t.deps)
  expect(out.ok).toBe(true)
  const result = (out as { result: { artifactId: string; url: string; pageCount: number; filename: string; expiresAt: number } }).result
  expect(result).toMatchObject({ pageCount: 6, url: `/api/prep/artifacts/${result.artifactId}`, expiresAt: NOW + EXPORT_RETENTION_MS })
  expect(result.filename.endsWith('.pptx')).toBe(true)
  expect(t.urls).toEqual([1, 2, 3, 4, 5, 6].map((n) => projectionRenderUrl(ORIGIN, 'c-export', n)))
  expect(t.settles).toEqual(Array(6).fill('export'))
  expect(t.served[0]).toEqual(planProjectionExport(course, NOW).renderCourse)
  const stored = (await t.artifacts.forOwner(OWNER).get(result.artifactId))!
  expect(stored).toMatchObject({ kind: 'export', contentType: PPTX_CONTENT_TYPE, courseId: 'c-export' })
  const zip = await JSZip.loadAsync(stored.bytes)
  expect(Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(6)
  const firstNote = planProjectionExport(course, NOW).notes[0]!
  expect(await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string')).toContain(firstNote.slice(0, 6))
})

test('export refuses a course that has not passed the release gate', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-draft')
  const out = await handleRenderJob(job('export-pptx', 'c-draft'), t.deps)
  expect(out).toMatchObject({ ok: false, error: { code: 'NOT_READY', retryable: false, details: { blockers: expect.any(Array) } } })
  expect(t.urls).toEqual([])
})

test('a job naming a page that is waiting but not next is requeued without a screenshot (Ruling [T8/T9/T12] PAGE_NOT_NEXT)', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-order')
  const out = await handleRenderJob(job('render-page', 'c-order', { pageId: 'page-2' }), t.deps)
  expect(out).toMatchObject({ ok: false, error: { code: 'PAGE_NOT_NEXT', retryable: true } })
  expect(t.urls).toEqual([])
  const course = (await t.store().findMainlineCourse('c-order'))!
  expect(course.generationSession!.jobs.map((j) => j.status)).toEqual(['content-ready', 'content-ready'])
})

test('a data source failure during capture is a retryable error and writes no evidence', async () => {
  const t = harness()
  await buildRenderingCourse(t.store(), 'c-failed')
  const log = { served: [] as string[], notFound: [] as string[], blocked: [] as string[], failed: [] as string[] }
  const deps: RenderJobDeps = { ...t.deps, routes: async () => log }
  // 产物取数抛错时页面只会看到坏图，门禁会误判为 blocking；必须在写证据前当作可重试错误
  t.setCapture(async () => { log.failed.push('/api/prep/artifacts/ar_0000000000000000000000000000000000000000'); return { screenshot: solidPng(16, 9), metrics: { ...goodMetrics, brokenImageCount: 1 } } })
  expect(await handleRenderJob(job('render-page', 'c-failed', P1), deps)).toMatchObject({ ok: false, error: { code: 'RENDER_DATA_FAILED', retryable: true } })
  const course = (await t.store().findMainlineCourse('c-failed'))!
  expect(course.pageRenderEvidence ?? []).toEqual([])
  expect(t.artifacts.all()).toEqual([])
  await t.store().saveMainlineCourse(goldenExportCourse('c-failed-export'))
  expect(await handleRenderJob(job('export-pptx', 'c-failed-export'), deps)).toMatchObject({ ok: false, error: { code: 'RENDER_DATA_FAILED', retryable: true } })
  expect(t.artifacts.all()).toEqual([])
})
