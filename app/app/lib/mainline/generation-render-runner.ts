import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { MainlineCourse } from './domain.js'
import { evidenceBlocksPage, renderIssues, type ProjectionRenderMetrics } from './generation-render-evidence.js'
import { attachGenerationSession, completePageGeneration, type GenerationSession, type PageRenderEvidence } from './generation-session.js'
import { findMainlineCourse, saveMainlineCourse } from './store.js'

interface CapturedProjection {
  screenshot: Buffer
  metrics: ProjectionRenderMetrics
}

export interface GenerationRenderDependencies {
  find(courseId: string): Promise<MainlineCourse | undefined>
  save(course: MainlineCourse): Promise<void>
  capture(url: string, pageNumber: number): Promise<CapturedProjection>
  writeEvidence(courseId: string, pageId: string, evidenceId: string, screenshot: Buffer): Promise<string>
}

export class GenerationRenderRunError extends Error {
  constructor(
    readonly code: 'COURSE_NOT_FOUND' | 'SESSION_NOT_FOUND' | 'SESSION_NOT_RENDERING' | 'SESSION_CONFLICT' | 'RENDER_BLOCKED',
    message: string,
    readonly evidence?: PageRenderEvidence,
  ) {
    super(message)
    this.name = 'GenerationRenderRunError'
  }
}

export function createGenerationRenderRunner(dependencies: GenerationRenderDependencies) {
  const queues = new Map<string, Promise<void>>()
  async function serialized<T>(courseId: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(courseId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => current)
    queues.set(courseId, tail)
    await previous
    try { return await operation() } finally {
      release()
      if (queues.get(courseId) === tail) queues.delete(courseId)
    }
  }

  return {
    runNext(courseId: string, origin: string, now = new Date().toISOString()) {
      return serialized(courseId, async () => {
        const course = await dependencies.find(courseId)
        if (!course) throw new GenerationRenderRunError('COURSE_NOT_FOUND', `课程不存在：${courseId}`)
        const session = course.generationSession
        if (!course.planning || !session) throw new GenerationRenderRunError('SESSION_NOT_FOUND', '课程没有可渲染的生成会话。')
        if (session.status === 'course-audit') return { session, done: true }
        if (session.status !== 'rendering') throw new GenerationRenderRunError('SESSION_NOT_RENDERING', `当前会话状态为 ${session.status}。`)
        if (course.planning.planRevisionId !== session.planRevisionId || course.pageContent?.planRevisionId !== session.planRevisionId) {
          throw new GenerationRenderRunError('SESSION_CONFLICT', '计划或正文版本已变化，旧会话不能继续渲染。')
        }
        const job = session.jobs.find(candidate => candidate.status === 'content-ready')
        if (!job?.contentCheckpoint) throw new GenerationRenderRunError('SESSION_CONFLICT', '没有带正文检查点的待渲染页面。')
        const page = course.pageContent.pages.find(candidate => candidate.pageId === job.pageId)
        if (!page) throw new GenerationRenderRunError('SESSION_CONFLICT', `页面 ${job.pageId} 的正文不存在。`)

        const expectedUpdatedAt = session.updatedAt
        const captured = await dependencies.capture(
          `${origin}/mainline/${encodeURIComponent(courseId)}/render?export=1&page=${job.order}`,
          job.order,
        )
        const screenshotSha256 = createHash('sha256').update(captured.screenshot).digest('hex')
        const evidenceId = createHash('sha256').update([
          courseId, job.pageId, session.planRevisionId, job.contentCheckpoint.contentRevisionId, screenshotSha256,
        ].join('\n')).digest('hex')
        const screenshotPath = await dependencies.writeEvidence(courseId, job.pageId, evidenceId, captured.screenshot)
        const evidence: PageRenderEvidence = {
          schemaVersion: 'mainline-page-render-v1',
          id: evidenceId,
          courseId,
          pageId: job.pageId,
          planRevisionId: session.planRevisionId,
          contentRevisionId: job.contentCheckpoint.contentRevisionId,
          screenshotPath,
          screenshotSha256,
          viewport: { width: 1920, height: 1080 },
          metrics: {
            minimumFontPx: captured.metrics.minimumFontPx,
            clippedElementCount: captured.metrics.clippedElementCount,
            overlappingTextCount: captured.metrics.overlappingTextCount,
            brokenImageCount: captured.metrics.brokenImageCount,
            visualElementCount: captured.metrics.visualElementCount,
            occupiedAreaRatio: captured.metrics.occupiedAreaRatio,
          },
          issues: renderIssues(captured.metrics, {
            visualRequired: jobRequiresRenderedVisual(course, job.pageId),
          }),
          createdAt: now,
        }
        const latest = await dependencies.find(courseId)
        if (!latest?.generationSession || latest.generationSession.updatedAt !== expectedUpdatedAt) {
          throw new GenerationRenderRunError('SESSION_CONFLICT', '截图期间课程已变化，本次证据未绑定到课程。', evidence)
        }
        const evidenceList = [
          ...(latest.pageRenderEvidence ?? []).filter(item => item.pageId !== job.pageId),
          evidence,
        ]
        if (evidenceBlocksPage(evidence)) {
          await dependencies.save({ ...latest, pageRenderEvidence: evidenceList })
          throw new GenerationRenderRunError('RENDER_BLOCKED', evidence.issues.filter(issue => issue.severity === 'blocking').map(issue => issue.message).join('；'), evidence)
        }
        const checkpoint = {
          ...job.contentCheckpoint,
          renderEvidenceId: evidence.id,
          createdAt: now,
        }
        const completed = completePageGeneration(latest.generationSession, checkpoint, now)
        const next = attachGenerationSession({ ...latest, pageRenderEvidence: evidenceList }, completed)
        await dependencies.save(next)
        return { session: completed, evidence, done: completed.status === 'course-audit' }
      })
    },
  }
}

async function captureWithPlaywright(url: string, pageNumber: number): Promise<CapturedProjection> {
  const { chromium } = await import('playwright-core')
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  let lastError: unknown
  for (const executablePath of browserExecutables()) {
    try {
      browser = await chromium.launch({ executablePath, headless: true })
      break
    } catch (error) {
      lastError = error
    }
  }
  if (!browser) {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true })
    } catch (error) {
      throw lastError ?? error
    }
  }
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    await page.waitForFunction(expected => document.body.dataset.exportReady === String(expected), pageNumber, { timeout: 45_000 })
    const metrics = await page.evaluate(measureProjection)
    const screenshot = await page.screenshot({ type: 'png', fullPage: false })
    return { screenshot: Buffer.from(screenshot), metrics }
  } finally {
    await browser.close()
  }
}

function measureProjection(): ProjectionRenderMetrics {
  const stage = document.querySelector<HTMLElement>('[data-projection-stage="true"]')
  if (!stage) throw new Error('找不到真实投影片舞台。')
  const stageRect = stage.getBoundingClientRect()
  const visible = [...stage.querySelectorAll<HTMLElement>('*')].filter(element => {
    const style = getComputedStyle(element)
    const rect = element.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0
  })
  const textElements = visible.filter(element => {
    const ownText = [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    return ownText || element.tagName === 'TEXT'
  })
  const fonts = textElements.map(element => Number.parseFloat(getComputedStyle(element).fontSize)).filter(Number.isFinite)
  const clippedElementCount = visible.filter(element => {
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const outsideStage = rect.left < stageRect.left - 1 || rect.top < stageRect.top - 1 || rect.right > stageRect.right + 1 || rect.bottom > stageRect.bottom + 1
    const clipsX = style.overflowX !== 'visible' && element.scrollWidth > element.clientWidth + 1
    const clipsY = style.overflowY !== 'visible' && element.scrollHeight > element.clientHeight + 1
    const selfClipped = clipsX || clipsY
    return outsideStage || selfClipped
  }).length
  let overlappingTextCount = 0
  for (let leftIndex = 0; leftIndex < textElements.length; leftIndex += 1) {
    const left = textElements[leftIndex]!
    const a = left.getBoundingClientRect()
    for (let rightIndex = leftIndex + 1; rightIndex < textElements.length; rightIndex += 1) {
      const right = textElements[rightIndex]!
      if (left.contains(right) || right.contains(left)) continue
      const b = right.getBoundingClientRect()
      if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4) overlappingTextCount += 1
    }
  }
  const brokenImageCount = [...stage.querySelectorAll<HTMLImageElement>('img')].filter(image => !image.complete || image.naturalWidth === 0).length
  const visualElementCount = stage.querySelectorAll('img,svg,canvas,[data-testid*="graphic"],[data-testid*="diagram"],[data-testid*="plot"]').length
  const cells = new Set<string>()
  const meaningful = [...textElements, ...stage.querySelectorAll<HTMLElement>('img,svg,canvas')]
  for (const element of meaningful) {
    const rect = element.getBoundingClientRect()
    const x0 = Math.max(0, Math.floor(((rect.left - stageRect.left) / stageRect.width) * 48))
    const x1 = Math.min(47, Math.floor(((rect.right - stageRect.left) / stageRect.width) * 48))
    const y0 = Math.max(0, Math.floor(((rect.top - stageRect.top) / stageRect.height) * 27))
    const y1 = Math.min(26, Math.floor(((rect.bottom - stageRect.top) / stageRect.height) * 27))
    for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) cells.add(`${x}:${y}`)
  }
  return {
    stageWidth: stageRect.width,
    stageHeight: stageRect.height,
    minimumFontPx: fonts.length > 0 ? Math.min(...fonts) : null,
    clippedElementCount,
    overlappingTextCount,
    brokenImageCount,
    visualElementCount,
    occupiedAreaRatio: cells.size / (48 * 27),
  }
}

function browserExecutables(): string[] {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].filter((candidate): candidate is string => Boolean(candidate))
  return [...new Set(candidates.filter(existsSync))]
}

async function writeEvidence(courseId: string, pageId: string, evidenceId: string, screenshot: Buffer): Promise<string> {
  const directory = join(process.cwd(), 'data', 'render-evidence', safeSegment(courseId), safeSegment(pageId))
  await mkdir(directory, { recursive: true })
  const absolutePath = join(directory, `${evidenceId}.png`)
  await writeFile(absolutePath, screenshot)
  return relative(process.cwd(), absolutePath).replaceAll('\\', '/')
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_')
}

function jobRequiresRenderedVisual(course: MainlineCourse, pageId: string): boolean {
  const visual = course.planning?.pages.find(page => page.id === pageId)?.visualSpec
  return Boolean(visual?.required && visual.form !== 'source-text')
}

export const generationRenderRunner = createGenerationRenderRunner({
  find: findMainlineCourse,
  save: saveMainlineCourse,
  capture: captureWithPlaywright,
  writeEvidence,
})
