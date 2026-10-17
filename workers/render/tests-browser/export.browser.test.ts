import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createMainlineCourseStore, createMemoryCourseDocuments, goldenExportCourse, planProjectionExport, projectionRenderUrl } from '@maolab/course'
import { ALLOWED_PNG_CHUNKS, buildPackage, generateSigningKeyPair, publicKeysFromPem, readPackage, readPng, signingKeyFromPem } from '@maolab-core/course-package'
import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { launchBrowser, withProjectionContext } from '../src/browser.ts'
import { captureProjection } from '../src/capture.ts'
import { handleRenderJob } from '../src/jobs.ts'
import { stripPng } from '../src/package-export.ts'
import { installProjectionRoutes } from '../src/page-host.ts'
import { pngSize } from '../src/png.ts'
import { startStaticServer } from '../src/static-server.ts'
import { createMemoryArtifacts } from '../tests/helpers/memory-artifacts.ts'
import { browserForTests, noSandbox } from './helpers.ts'

const executablePath = browserForTests()
const FIXTURE = fileURLToPath(new URL('./fixture/', import.meta.url))

describe.skipIf(!executablePath)('export through a real browser', () => {
  let browser: Browser
  let server: Awaited<ReturnType<typeof startStaticServer>>
  beforeAll(async () => {
    server = await startStaticServer(FIXTURE)
    browser = await launchBrowser({ executablePath: executablePath!, noSandbox })
  })
  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  test('six 1920x1080 slides with notes', async () => {
    const documents = createMemoryCourseDocuments()
    const artifacts = createMemoryArtifacts()
    await createMainlineCourseStore(documents).saveMainlineCourse(goldenExportCourse('c-export'))
    const out = await handleRenderJob(
      { id: 'rj_x', owner: 'teacher-a', courseId: 'c-export', kind: 'export-pptx', requestKey: 'k', payload: {}, status: 'running', attempts: 1, maxAttempts: 3, availableAt: 0, leaseHolder: 'w', leaseExpiresAt: 1, result: null, error: null, createdAt: 0, updatedAt: 0, finishedAt: null },
      { documentsFor: () => documents, artifacts, origin: server.origin, timeoutMs: 30_000, now: Date.now, withContext: (fn) => withProjectionContext(browser, fn), capture: captureProjection },
    )
    expect(out.ok).toBe(true)
    const { artifactId } = (out as { result: { artifactId: string } }).result
    const zip = await JSZip.loadAsync((await artifacts.forOwner('teacher-a').get(artifactId))!.bytes)
    const media = Object.keys(zip.files).filter((name) => /^ppt\/media\/.+\.png$/.test(name))
    expect(media).toHaveLength(6)
    for (const name of media) expect(pngSize(await zip.file(name)!.async('nodebuffer'))).toEqual({ width: 1920, height: 1080 })
  })

  test('a real Chromium screenshot, after stripPng, is accepted as a course-package page (S4 review focus 1)', async () => {
    const course = goldenExportCourse('c-pkg')
    const plan = planProjectionExport(course, Date.now())
    const artifacts = createMemoryArtifacts()
    const raw = await withProjectionContext(browser, async (context) => {
      await installProjectionRoutes(context, server.origin, { courseId: 'c-pkg', course: async () => plan.renderCourse, artifact: (id) => artifacts.forOwner('teacher-a').get(id) })
      return (await captureProjection(context, projectionRenderUrl(server.origin, 'c-pkg', 1), 1, { timeoutMs: 30_000, settle: 'export' })).screenshot
    })
    const chunks = readPng(raw)!.chunks
    process.stderr.write(`chromium png chunks: ${[...new Set(chunks)].join(',')}
`)
    const png = stripPng(raw)
    expect(readPng(png)!.chunks.every((c) => ALLOWED_PNG_CHUNKS.has(c))).toBe(true)
    const keys = generateSigningKeyPair()
    const bytes = buildPackage({
      packageId: 'pk_browsertest01', version: 1, title: '浏览器截图', subject: '语文', gradeBand: '初中', kpIds: ['kp-1'],
      knowledgeDataset: { name: 'k12-knowledge-points', version: 'v' }, pages: [{ title: '第一页', text: '', png }], outline: '课程：浏览器截图（共 1 页）',
      exporter: { product: 'maolab', coreVersion: '0.1.0' }, identifiers: [],
    }, signingKeyFromPem(keys.privateKeyPem))
    expect(readPackage(bytes, { publicKeys: publicKeysFromPem([keys.publicKeyPem]) }).lesson.pages).toHaveLength(1)
  })
})
