import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { createMainlineCourseStore, createMemoryCourseDocuments, goldenExportCourse } from '@maolab/course'
import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { launchBrowser, withProjectionContext } from '../src/browser.ts'
import { captureProjection } from '../src/capture.ts'
import { handleRenderJob } from '../src/jobs.ts'
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
})
