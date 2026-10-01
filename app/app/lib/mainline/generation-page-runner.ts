import type { MainlineCourse } from './domain.js'
import { ZodError } from 'zod'
import {
  attachGenerationSession,
  completePageContent,
  failPageGeneration,
  generationInputHash,
  startPageGeneration,
  type GenerationFailureKind,
  type GenerationSession,
  type PageContentCheckpoint,
} from './generation-session.js'
import { findMainlineCourse, saveMainlineCourse } from './store.js'
import {
  fillOnePlannedPageWithDefaultLLM,
  PageContentGenerationQualityError,
} from './planning/page-content-generator.js'
import { auditGeneratedPageFacts } from './planning/page-content-page-audit.js'
import {
  PAGE_CONTENT_SCHEMA_VERSION,
  type CoursePageContentState,
  type GeneratedLessonPage,
} from './planning/page-content-contract.js'
import type { LessonPagePlan } from './planning/page-contract.js'
import { fillImages } from './generation/fill-images.js'

export interface GenerationPagePersistence {
  find(courseId: string): Promise<MainlineCourse | undefined>
  save(course: MainlineCourse): Promise<void>
}

export interface GenerationPageRunnerDependencies {
  persistence: GenerationPagePersistence
  generate(input: {
    course: MainlineCourse
    planPage: LessonPagePlan
    priorPages: readonly GeneratedLessonPage[]
    qualityFeedback: readonly string[]
  }): Promise<GeneratedLessonPage>
  auditFacts(course: MainlineCourse, page: GeneratedLessonPage): Promise<{ revisionId: string }>
  prepareVisual?(course: MainlineCourse, page: GeneratedLessonPage, planPage: LessonPagePlan): Promise<GeneratedLessonPage>
}

export interface RunNextPageResult {
  session: GenerationSession
  page?: GeneratedLessonPage
  done: boolean
}

export class GenerationPageRunError extends Error {
  constructor(
    readonly code: 'COURSE_NOT_FOUND' | 'SESSION_NOT_FOUND' | 'SESSION_NOT_GENERATING' | 'SESSION_CONFLICT',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationPageRunError'
  }
}

export function createGenerationPageRunner(dependencies: GenerationPageRunnerDependencies) {
  const queues = new Map<string, Promise<void>>()

  async function serialized<T>(courseId: string, operation: () => Promise<T>): Promise<T> {
    const previous = queues.get(courseId) ?? Promise.resolve()
    let release!: () => void
    const current = new Promise<void>(resolve => { release = resolve })
    const tail = previous.then(() => current)
    queues.set(courseId, tail)
    await previous
    try {
      return await operation()
    } finally {
      release()
      if (queues.get(courseId) === tail) queues.delete(courseId)
    }
  }

  return {
    runNext(courseId: string, now = new Date().toISOString()): Promise<RunNextPageResult> {
      return serialized(courseId, async () => {
        const course = await requireCourse(dependencies.persistence, courseId)
        const planning = course.planning
        const session = course.generationSession
        if (!planning || !session) {
          throw new GenerationPageRunError('SESSION_NOT_FOUND', '课程尚未确认页面计划或创建生成会话。')
        }
        if (session.planRevisionId !== planning.planRevisionId) {
          throw new GenerationPageRunError('SESSION_CONFLICT', '页面计划已变化，不能继续使用旧生成会话。')
        }
        if (session.status === 'rendering' || session.status === 'course-audit') {
          return { session, done: true }
        }
        if (planning.status !== 'plan-approved') {
          throw new GenerationPageRunError('SESSION_CONFLICT', '页面计划已变化，不能继续使用旧生成会话。')
        }
        if (session.status !== 'generating') {
          throw new GenerationPageRunError('SESSION_NOT_GENERATING', `当前生成会话状态为 ${session.status}。`)
        }
        const nextJob = session.jobs.find(job => job.status === 'queued')
        if (!nextJob) {
          const blocked = session.jobs.find(job => job.status === 'blocked')
          if (blocked) throw new GenerationPageRunError('SESSION_NOT_GENERATING', `页面 ${blocked.order} 未通过，需先局部恢复。`)
          throw new GenerationPageRunError('SESSION_CONFLICT', '没有可执行的下一页，但生成会话尚未结束。')
        }
        const planPage = planning.pages.find(page => page.id === nextJob.pageId)
        if (!planPage) throw new GenerationPageRunError('SESSION_CONFLICT', '生成任务对应的计划页面不存在。')
        const priorPages = orderedGeneratedPages(course, session, planPage.order)
        const inputHash = pageInputHash(course, planPage, priorPages)
        const running = startPageGeneration(session, planPage.id, inputHash, now)
        await dependencies.persistence.save(attachGenerationSession(course, running))

        try {
          const qualityFeedback = nextJob.diagnostics
            .filter(item => item.kind === 'validation_error' || item.kind === 'source_error')
            .slice(-2)
            .map(item => item.message)
          const generatedPage = await dependencies.generate({ course, planPage, priorPages, qualityFeedback })
          assertGeneratedPageMatchesPlan(generatedPage, planPage, planning.planRevisionId)
          const page = dependencies.prepareVisual
            ? await dependencies.prepareVisual(course, generatedPage, planPage)
            : generatedPage
          const factAudit = await dependencies.auditFacts(course, page)
          const contentRevisionId = generationInputHash({
            planRevisionId: planning.planRevisionId,
            page,
          })
          const checkpoint: PageContentCheckpoint = {
            pageId: page.pageId,
            planRevisionId: planning.planRevisionId,
            inputHash,
            contentRevisionId,
            factAuditRevisionId: factAudit.revisionId,
            createdAt: now,
          }
          const latest = await requireCourse(dependencies.persistence, courseId)
          assertStillRunning(latest, running, planning.planRevisionId)
          const completed = completePageContent(latest.generationSession!, checkpoint, now)
          const pageContent = upsertGeneratedPage(latest, page, completed)
          await dependencies.persistence.save(attachGenerationSession({
            ...latest,
            planning: completed.status === 'rendering'
              ? { ...planning, status: 'review' }
              : latest.planning!,
            pageContent,
            qualityStatus: 'draft',
          }, completed))
          return { session: completed, page, done: completed.status === 'rendering' }
        } catch (error) {
          await persistFailure(dependencies.persistence, courseId, running, error, now)
          throw error
        }
      })
    },
  }
}

function orderedGeneratedPages(course: MainlineCourse, session: GenerationSession, beforeOrder: number): GeneratedLessonPage[] {
  const byId = new Map((course.pageContent?.pages ?? []).map(page => [page.pageId, page]))
  return session.jobs
    .filter(job => job.order < beforeOrder && (job.status === 'content-ready' || job.status === 'passed'))
    .map(job => byId.get(job.pageId))
    .filter((page): page is GeneratedLessonPage => Boolean(page))
}

function pageInputHash(course: MainlineCourse, planPage: LessonPagePlan, priorPages: readonly GeneratedLessonPage[]): string {
  return generationInputHash({
    courseId: course.id,
    topic: course.topic,
    subject: course.subject,
    gradeBand: course.gradeBand,
    boundary: course.boundary,
    planRevisionId: course.planning?.planRevisionId,
    planPage,
    sources: course.sourceMaterial,
    priorPages,
  })
}

function upsertGeneratedPage(
  course: MainlineCourse,
  page: GeneratedLessonPage,
  session: GenerationSession,
): CoursePageContentState {
  const pages = [...(course.pageContent?.pages ?? []).filter(candidate => candidate.pageId !== page.pageId), page]
    .sort((left, right) => left.order - right.order)
  return {
    schemaVersion: PAGE_CONTENT_SCHEMA_VERSION,
    courseId: course.id,
    planRevisionId: session.planRevisionId,
    contentRevisionId: pageContentRevisionId(session),
    status: session.status === 'rendering' ? 'review' : 'generating',
    pages,
  }
}

function pageContentRevisionId(session: GenerationSession): string {
  return generationInputHash(session.jobs.map(job => ({
    pageId: job.pageId,
    contentRevisionId: job.contentCheckpoint?.contentRevisionId ?? job.checkpoint?.contentRevisionId ?? '',
  })))
}

function assertGeneratedPageMatchesPlan(page: GeneratedLessonPage, planPage: LessonPagePlan, planRevisionId: string): void {
  if (page.pageId !== planPage.id || page.order !== planPage.order || page.planRevisionId !== planRevisionId) {
    throw new Error('单页生成结果擅自改变了页面 ID、顺序或计划版本。')
  }
}

function assertStillRunning(course: MainlineCourse, expected: GenerationSession, planRevisionId: string): void {
  const session = course.generationSession
  if (
    !session
    || session.id !== expected.id
    || session.updatedAt !== expected.updatedAt
    || course.planning?.planRevisionId !== planRevisionId
  ) {
    throw new GenerationPageRunError('SESSION_CONFLICT', '生成期间页面计划或会话已变化，旧结果未写入。')
  }
}

async function persistFailure(
  persistence: GenerationPagePersistence,
  courseId: string,
  expected: GenerationSession,
  error: unknown,
  now: string,
): Promise<void> {
  const latest = await persistence.find(courseId)
  if (
    !latest?.generationSession
    || latest.generationSession.updatedAt !== expected.updatedAt
    || latest.planning?.planRevisionId !== expected.planRevisionId
  ) return
  const kind = failureKind(error)
  const failed = failPageGeneration(
    latest.generationSession,
    expected.currentPageId!,
    kind,
    error instanceof Error ? error.message : String(error),
    now,
  )
  await persistence.save(attachGenerationSession(latest, failed))
}

function failureKind(error: unknown): GenerationFailureKind {
  if (error instanceof PageContentGenerationQualityError || error instanceof ZodError) return 'validation_error'
  if (error instanceof GenerationPageRunError && error.code === 'SESSION_CONFLICT') return 'conflict_error'
  const message = error instanceof Error ? error.message : String(error)
  if (/事实核查未通过|擅自改变了页面/.test(message)) return 'validation_error'
  if (/来源|source|引用/.test(message)) return 'source_error'
  if (/timeout|timed out|ECONN|fetch|network/i.test(message)) return 'transient_error'
  return 'model_error'
}

async function requireCourse(persistence: GenerationPagePersistence, courseId: string): Promise<MainlineCourse> {
  const course = await persistence.find(courseId)
  if (!course) throw new GenerationPageRunError('COURSE_NOT_FOUND', `课程不存在：${courseId}`)
  return course
}

export const generationPageRunner = createGenerationPageRunner({
  persistence: { find: findMainlineCourse, save: saveMainlineCourse },
  generate: ({ course, planPage, priorPages, qualityFeedback }) => fillOnePlannedPageWithDefaultLLM({
    course,
    planPage,
    planRevisionId: course.planning!.planRevisionId,
    priorPages,
    maxPageAttempts: 3,
    qualityFeedback,
  }),
  auditFacts: auditGeneratedPageFacts,
  prepareVisual: async (course, page, planPage) => {
    if (!planPage.visualSpec.required || planPage.visualSpec.form !== 'instructional-image') return page
    const pages = [
      ...(course.pageContent?.pages ?? []).filter(candidate => candidate.pageId !== page.pageId),
      page,
    ].sort((left, right) => left.order - right.order)
    const result = await fillImages({
      ...course,
      pageContent: {
        schemaVersion: PAGE_CONTENT_SCHEMA_VERSION,
        courseId: course.id,
        planRevisionId: course.planning!.planRevisionId,
        contentRevisionId: generationInputHash(pages),
        status: 'generating',
        pages,
      },
    })
    const prepared = result.course.pageContent?.pages.find(candidate => candidate.pageId === page.pageId)
    if (!prepared?.imageUrl?.trim()) {
      throw new Error(`页面 ${planPage.order} 需要教学图像，但图像生成失败。`)
    }
    return prepared
  },
})
