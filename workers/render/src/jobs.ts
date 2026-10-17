// 两类渲染任务（3b）。owner 只来自任务行（投递时已校验课程归属），从不来自页面或模型。
// render-page：一次推进生成会话一页，复用 3a 迁入的 createGenerationRenderRunner（证据合并经 CAS，冲突重读重放）。
// export-pptx：只导出通过发布判定的课程，逐页截图，讲稿进备注，导出件 7 天过期。
// 拦截层记下数据源抛错（InterceptLog.failed）时，本次截图不可信：不写证据、不出导出件，报可重试的 RENDER_DATA_FAILED。
import {
  courseArtifactUrl, createCourseGenerationServices, createMainlineCourseStore, GenerationRenderRunError, planProjectionExport, projectionRenderUrl,
  type CourseDocumentStore,
} from '@maolab/course'
import { EXPORT_RETENTION_MS, PPTX_CONTENT_TYPE, type CourseArtifactStore, type RenderJob, type RenderJobError } from '@maolab/domain'
import type { BrowserContext } from 'playwright-core'
import type { CaptureOptions, CapturedProjection } from './capture.ts'
import { classifyRenderError, RenderWorkerError } from './errors.ts'
import { installProjectionRoutes, type ProjectionDataSource } from './page-host.ts'
import { buildProjectionPptx } from './pptx.ts'

export interface RenderJobDeps {
  documentsFor(owner: string): CourseDocumentStore
  artifacts: CourseArtifactStore
  origin: string
  timeoutMs: number
  now(): number
  withContext<T>(fn: (context: BrowserContext) => Promise<T>): Promise<T>
  capture(context: BrowserContext, url: string, pageNumber: number, options: CaptureOptions): Promise<CapturedProjection>
  routes?(context: BrowserContext, origin: string, source: ProjectionDataSource): Promise<unknown>
}

export type JobOutcome = { ok: true; result: unknown } | { ok: false; error: RenderJobError }

export async function handleRenderJob(job: RenderJob, deps: RenderJobDeps): Promise<JobOutcome> {
  try {
    const result = job.kind === 'render-page' ? await renderPage(job, deps) : await exportPptx(job, deps)
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error: classifyRenderError(error) }
  }
}

/** routes 的返回值若是 InterceptLog（缺省的 installProjectionRoutes 就是），取它的 failed 列表 */
function failedList(log: unknown): string[] | undefined {
  if (typeof log !== 'object' || log === null) return undefined
  const failed = (log as { failed?: unknown }).failed
  return Array.isArray(failed) ? (failed as string[]) : undefined
}

/** 包一层采集：采集期间数据源新增了抛错记录，无论采集成功与否都改报 RENDER_DATA_FAILED */
async function captureChecked(log: unknown, run: () => Promise<CapturedProjection>): Promise<CapturedProjection> {
  const failed = failedList(log)
  const before = failed?.length ?? 0
  const check = () => {
    if (failed && failed.length > before) {
      throw new RenderWorkerError('RENDER_DATA_FAILED', '渲染页取数时课程或产物读取失败，本次截图作废，稍后重试。', true, { paths: failed.slice(before) })
    }
  }
  let shot: CapturedProjection
  try {
    shot = await run()
  } catch (error) {
    check()
    throw error
  }
  check()
  return shot
}

async function renderPage(job: RenderJob, deps: RenderJobDeps): Promise<unknown> {
  const store = createMainlineCourseStore(deps.documentsFor(job.owner))
  const artifacts = deps.artifacts.forOwner(job.owner)
  // T8 (e)：课程不存在就不开浏览器上下文
  const course = await store.findMainlineCourse(job.courseId)
  if (!course) throw new GenerationRenderRunError('COURSE_NOT_FOUND', `课程不存在：${job.courseId}`)
  // 终审 I1：任务必须点名会话里存在的页。缺 pageId 或会话里没有这页（例如计划修订后旧任务指向旧会话）时，
  // 不能让 runNext 替别的页截图，直接不可重试地失败
  const wanted = typeof job.payload.pageId === 'string' && job.payload.pageId.trim() ? job.payload.pageId : undefined
  const sessionJobs = course.generationSession?.jobs
  const pageJob = wanted === undefined ? undefined : sessionJobs?.find((candidate) => candidate.pageId === wanted)
  if (!wanted || !pageJob) {
    throw new RenderWorkerError('PAGE_NOT_FOUND', wanted ? `生成会话里没有页面 ${wanted}。` : '渲染任务没有指定要截图的页面（payload.pageId）。', false, { pageId: wanted ?? null })
  }
  // 崩溃重跑：要截的页已经截过（证据已写、会话已推进），不再截下一页，也不重复写产物
  if (pageJob.status !== 'content-ready') return { skipped: true, pageId: wanted, status: pageJob.status }
  // Ruling [T8/T9/T12]：要截的页还在等，但会话下一张待截的是别的页——不替别的页截图，退避后重领
  const next = sessionJobs?.find((candidate) => candidate.status === 'content-ready')
  if (next && next.pageId !== wanted) {
    throw new RenderWorkerError('PAGE_NOT_NEXT', `页面 ${wanted} 还不是下一张待截图的页（下一张是 ${next.pageId}），稍后重试。`, true, { pageId: wanted, nextPageId: next.pageId })
  }
  const wantedOrder = pageJob.order
  const routes = deps.routes ?? installProjectionRoutes
  return deps.withContext(async (context) => {
    const log = await routes(context, deps.origin, {
      courseId: job.courseId,
      course: () => store.findMainlineCourse(job.courseId),
      artifact: (id) => artifacts.get(id),
    })
    const services = createCourseGenerationServices(store, {
      render: {
        pageUrl: projectionRenderUrl,
        capture: (url, pageNumber) => {
          // 上面检查之后会话若被别的任务推进，runNext 选中的页可能已不是要截的页：同样按 PAGE_NOT_NEXT 退回
          if (pageNumber !== wantedOrder) {
            return Promise.reject(new RenderWorkerError('PAGE_NOT_NEXT', `页面 ${wanted} 还不是下一张待截图的页，稍后重试。`, true, { pageId: wanted }))
          }
          return captureChecked(log, () => deps.capture(context, url, pageNumber, { timeoutMs: deps.timeoutMs, settle: 'gate' }))
        },
        writeEvidence: async (courseId, _pageId, _evidenceId, screenshot) =>
          courseArtifactUrl((await artifacts.put({ bytes: screenshot, contentType: 'image/png', kind: 'evidence', courseId })).id),
      },
    })
    try {
      const out = await services.render!.runNext(job.courseId, deps.origin, new Date(deps.now()).toISOString())
      const evidence = 'evidence' in out ? out.evidence : undefined
      return { done: out.done, blocked: false, ...(evidence ? { pageId: evidence.pageId, evidenceId: evidence.id, issues: evidence.issues } : {}) }
    } catch (error) {
      if (error instanceof GenerationRenderRunError && error.code === 'RENDER_BLOCKED' && error.evidence) {
        return { done: false, blocked: true, pageId: error.evidence.pageId, evidenceId: error.evidence.id, issues: error.evidence.issues }
      }
      throw error
    }
  })
}

async function exportPptx(job: RenderJob, deps: RenderJobDeps): Promise<unknown> {
  const store = createMainlineCourseStore(deps.documentsFor(job.owner))
  const artifacts = deps.artifacts.forOwner(job.owner)
  const course = await store.findMainlineCourse(job.courseId)
  if (!course) throw new GenerationRenderRunError('COURSE_NOT_FOUND', `课程不存在：${job.courseId}`)
  const plan = planProjectionExport(course, deps.now())
  const routes = deps.routes ?? installProjectionRoutes
  const slides = await deps.withContext(async (context) => {
    const log = await routes(context, deps.origin, { courseId: job.courseId, course: async () => plan.renderCourse, artifact: (id) => artifacts.get(id) })
    const shots: Array<{ png: Buffer; notes: string }> = []
    for (let pageNumber = 1; pageNumber <= plan.pageCount; pageNumber += 1) {
      const { screenshot } = await captureChecked(log, () =>
        deps.capture(context, projectionRenderUrl(deps.origin, job.courseId, pageNumber), pageNumber, { timeoutMs: deps.timeoutMs, settle: 'export' }))
      shots.push({ png: screenshot, notes: plan.notes[pageNumber - 1] ?? '' })
    }
    return shots
  })
  const pptx = await buildProjectionPptx({ title: plan.title, slides })
  const stored = await artifacts.put({ bytes: pptx, contentType: PPTX_CONTENT_TYPE, kind: 'export', courseId: job.courseId, expiresAt: deps.now() + EXPORT_RETENTION_MS })
  return { artifactId: stored.id, url: courseArtifactUrl(stored.id), filename: plan.filename, pageCount: plan.pageCount, bytes: stored.byteSize, sha256: stored.sha256, expiresAt: stored.expiresAt }
}
