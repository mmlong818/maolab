import { COURSE_ARTIFACT_URL_PREFIX } from '@maolab/domain'
import { expect, test } from 'vitest'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import {
  COURSE_ARTIFACT_PREFIX, courseArtifactUrl, parseCourseArtifactPath, parseProjectionRenderDataPath,
  PROJECTION_RENDER_CONTRACT, projectionRenderDataPath, projectionRenderUrl,
} from '../src/render-contract.js'
import { createCourseGenerationServices } from '../src/services/generation.js'
import { planProjectionExport, ProjectionExportNotReadyError, sanitizeExportFilename } from '../src/services/projection.js'
import { buildRenderingCourse, goldenExportCourse, RENDER_FIXTURE_PAGES } from '../src/testing/render-fixtures.js'

const goodMetrics = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 0, occupiedAreaRatio: 0.35 }
const png = Buffer.from('fake-png')
const store = () => createMainlineCourseStore(createMemoryCourseDocuments())

test('render contract addresses round-trip and agree with the domain artifact prefix', () => {
  expect(PROJECTION_RENDER_CONTRACT).toBe(1)
  expect(COURSE_ARTIFACT_PREFIX).toBe(COURSE_ARTIFACT_URL_PREFIX)
  expect(projectionRenderUrl('http://web:8080/', 'c 1', 2)).toBe('http://web:8080/prep/render/?course=c+1&page=2&export=1')
  expect(parseProjectionRenderDataPath(projectionRenderDataPath('课程/1'))).toBe('课程/1')
  expect(parseProjectionRenderDataPath('/api/prep/render/')).toBeUndefined()
  expect(parseProjectionRenderDataPath('/api/prep/render/%E0%A4%A/')).toBeUndefined()
  const id = `ar_${'a'.repeat(40)}`
  expect(courseArtifactUrl(id)).toBe(`/api/prep/artifacts/${id}`)
  expect(parseCourseArtifactPath(courseArtifactUrl(id))).toBe(id)
  expect(parseCourseArtifactPath(`${courseArtifactUrl(id)}/`)).toBe(id)
  expect(parseCourseArtifactPath('/api/prep/artifacts/../secret')).toBeUndefined()
  expect(parseCourseArtifactPath('/api/prep/artifacts/ar_short')).toBeUndefined()
})

test('the fixture course reaches rendering with every page waiting for a screenshot', async () => {
  const s = store()
  const course = await buildRenderingCourse(s, 'course-fixture')
  expect(course.generationSession!.status).toBe('rendering')
  expect(course.generationSession!.jobs.map((job) => job.status)).toEqual(Array(RENDER_FIXTURE_PAGES).fill('content-ready'))
})

test('the render runner opens the injected render page and keeps the evidence address it is given', async () => {
  const s = store()
  await buildRenderingCourse(s, 'course-render')
  const urls: string[] = []
  const evidenceUrl = courseArtifactUrl(`ar_${'b'.repeat(40)}`)
  const services = createCourseGenerationServices(s, {
    render: {
      pageUrl: projectionRenderUrl,
      capture: async (url) => { urls.push(url); return { screenshot: png, metrics: goodMetrics } },
      writeEvidence: async () => evidenceUrl,
    },
  })
  const first = await services.render!.runNext('course-render', 'http://web.test')
  expect(urls).toEqual(['http://web.test/prep/render/?course=course-render&page=1&export=1'])
  expect(first.done).toBe(false)
  expect(JSON.stringify(first)).not.toContain('"blocking"')
  expect((await s.findMainlineCourse('course-render'))!.pageRenderEvidence![0]).toMatchObject({ pageId: 'page-1', screenshotPath: evidenceUrl })
  const second = await services.render!.runNext('course-render', 'http://web.test')
  expect(second.done).toBe(true)
  expect((await s.findMainlineCourse('course-render'))!.generationSession!.status).toBe('course-audit')
})

test('without an injected page url the runner keeps the maolab address', async () => {
  const s = store()
  await buildRenderingCourse(s, 'course-legacy')
  const urls: string[] = []
  const services = createCourseGenerationServices(s, {
    render: { capture: async (url) => { urls.push(url); return { screenshot: png, metrics: goodMetrics } }, writeEvidence: async () => 'x' },
  })
  await services.render!.runNext('course-legacy', 'http://old.test')
  expect(urls).toEqual(['http://old.test/mainline/course-legacy/render?export=1&page=1'])
})

test('export planning takes pages and teacher scripts from the stored course and serves the class-time course', () => {
  const course = goldenExportCourse()
  const before = JSON.stringify(course)
  const plan = planProjectionExport(course, Date.parse('2026-10-14T08:00:00+08:00'))
  expect(plan.pageCount).toBe(6)
  expect(plan.notes).toHaveLength(6)
  expect(plan.notes.every((note) => note.length > 0)).toBe(true)
  expect(plan.title).toBe(course.topic)
  expect(plan.filename).toBe(`${sanitizeExportFilename(course.topic)}.pptx`)
  expect(plan.renderCourse.id).toBe(course.id)
  expect(JSON.stringify(course)).toBe(before)   // 上课时卡司只在内存里套用，不改入参
})

test('a course that has not passed the release gate cannot be exported', async () => {
  const s = store()
  const rendering = await buildRenderingCourse(s, 'course-not-ready')
  const error = (() => { try { planProjectionExport(rendering); return undefined } catch (e) { return e } })()
  expect(error).toBeInstanceOf(ProjectionExportNotReadyError)
  expect(error).toMatchObject({ code: 'NOT_READY' })
  expect((error as ProjectionExportNotReadyError).blockers.length).toBeGreaterThan(0)
})

test('export file names drop characters Windows and browsers refuse', () => {
  expect(sanitizeExportFilename('光的折射：入射角/折射角?')).toBe('光的折射：入射角折射角')
  expect(sanitizeExportFilename('  ')).toBe('course')
  expect(sanitizeExportFilename('a\\b')).toBe('ab')
  expect(planProjectionExport({ ...goldenExportCourse(), topic: '光\\折射' }).filename).toBe('光折射.pptx')
})
