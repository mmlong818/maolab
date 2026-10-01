import type { MainlineCourse } from './domain.js'
import { attachGenerationSession, generationInputHash, markTeacherAccepted } from './generation-session.js'
import { markPageContentReady } from './planning/revision-lifecycle.js'
import { findMainlineCourseSnapshot, saveMainlineCourseIfUnchanged } from './store.js'
import { teachingQualityInputHash } from './teaching-quality-audit.js'

export interface TeacherAcceptancePersistence {
  findSnapshot(courseId: string): Promise<{ course: MainlineCourse; updatedAt: number } | undefined>
  saveIfUnchanged(course: MainlineCourse, expectedUpdatedAt: number): Promise<boolean>
}

export class TeacherAcceptanceError extends Error {
  constructor(
    readonly code: 'COURSE_NOT_FOUND' | 'NOT_AWAITING_ACCEPTANCE' | 'NOT_PUBLISHED' | 'PAGE_NOT_FOUND' | 'VERSION_CONFLICT' | 'PAGES_NOT_ACCEPTED',
    message: string,
  ) {
    super(message)
    this.name = 'TeacherAcceptanceError'
  }
}

export function createTeacherAcceptanceService(persistence: TeacherAcceptancePersistence) {
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
    reopen(courseId: string, expectedUpdatedAt: string, now = new Date().toISOString()) {
      return serialized(courseId, async () => {
        const { course, updatedAt } = await requireCourseSnapshot(persistence, courseId)
        const session = course.generationSession
        const audit = course.generationCourseAudit
        const acceptance = course.teacherAcceptance
        if (!session || session.status !== 'ready' || course.planning?.status !== 'ready' || !audit || !acceptance?.finalSignature) {
          throw new TeacherAcceptanceError('NOT_PUBLISHED', '只有已完成教师验收的课堂版本可以退回重新验收。')
        }
        if (session.updatedAt !== expectedUpdatedAt) {
          throw new TeacherAcceptanceError('VERSION_CONFLICT', '课程版本已经变化，请刷新后重试。')
        }
        if (
          audit.planRevisionId !== session.planRevisionId
          || audit.contentRevisionId !== course.pageContent?.contentRevisionId
          || acceptance.courseAuditId !== audit.id
        ) {
          throw new TeacherAcceptanceError('VERSION_CONFLICT', '课堂版本与当前机器审计不一致，不能沿用旧验收记录。')
        }
        const next: MainlineCourse = {
          ...course,
          planning: { ...course.planning, status: 'review' },
          qualityStatus: 'draft',
          generationSession: { ...session, status: 'awaiting-teacher-acceptance', updatedAt: now },
          teacherAcceptance: {
            schemaVersion: acceptance.schemaVersion,
            courseId: acceptance.courseId,
            planRevisionId: acceptance.planRevisionId,
            courseAuditId: audit.id,
            pages: [],
          },
        }
        await saveAcceptanceResult(persistence, next, updatedAt)
        return next
      })
    },

    acceptPage(courseId: string, pageId: string, expectedUpdatedAt: string, now = new Date().toISOString()) {
      return serialized(courseId, async () => {
        const { course, updatedAt } = await requireCourseSnapshot(persistence, courseId)
        const { session, audit, acceptance } = acceptanceContext(course, expectedUpdatedAt)
        const job = session.jobs.find(candidate => candidate.pageId === pageId)
        if (!job?.checkpoint) throw new TeacherAcceptanceError('PAGE_NOT_FOUND', '当前生成会话中不存在这张已通过投影片。')
        const nextPage = {
          pageId,
          contentRevisionId: job.checkpoint.contentRevisionId,
          renderEvidenceId: job.checkpoint.renderEvidenceId,
          acceptedAt: now,
        }
        const pages = [...acceptance.pages.filter(item => item.pageId !== pageId), nextPage]
          .sort((left, right) => session.jobs.findIndex(job => job.pageId === left.pageId) - session.jobs.findIndex(job => job.pageId === right.pageId))
        const next = { ...course, teacherAcceptance: { ...acceptance, courseAuditId: audit.id, pages } }
        await saveAcceptanceResult(persistence, next, updatedAt)
        return next
      })
    },

    publish(courseId: string, expectedUpdatedAt: string, now = new Date().toISOString()) {
      return serialized(courseId, async () => {
        const { course, updatedAt } = await requireCourseSnapshot(persistence, courseId)
        const { session, audit, acceptance } = acceptanceContext(course, expectedUpdatedAt)
        const acceptedByPage = new Map(acceptance.pages.map(item => [item.pageId, item]))
        const missing = session.jobs.filter(job => {
          const accepted = acceptedByPage.get(job.pageId)
          return !accepted || !job.checkpoint
            || accepted.contentRevisionId !== job.checkpoint.contentRevisionId
            || accepted.renderEvidenceId !== job.checkpoint.renderEvidenceId
        })
        if (missing.length > 0) {
          throw new TeacherAcceptanceError('PAGES_NOT_ACCEPTED', `还有 ${missing.length} 张投影片未按当前版本逐页验收。`)
        }
        const finalSignature = generationInputHash({
          courseId,
          planRevisionId: session.planRevisionId,
          courseAuditId: audit.id,
          pages: acceptance.pages.map(item => ({ pageId: item.pageId, contentRevisionId: item.contentRevisionId, renderEvidenceId: item.renderEvidenceId })),
        })
        const readySession = markTeacherAccepted(session, now)
        const signed = attachGenerationSession({
          ...course,
          teacherAcceptance: { ...acceptance, finalSignature, acceptedAt: now },
        }, readySession)
        const ready = markPageContentReady(signed)
        await saveAcceptanceResult(persistence, ready, updatedAt)
        return ready
      })
    },
  }
}

function acceptanceContext(course: MainlineCourse, expectedUpdatedAt: string) {
  const session = course.generationSession
  const audit = course.generationCourseAudit
  const teachingQualityAudit = course.teachingQualityAudit
  const acceptance = course.teacherAcceptance
  if (!session || session.status !== 'awaiting-teacher-acceptance' || !audit || !acceptance) {
    throw new TeacherAcceptanceError('NOT_AWAITING_ACCEPTANCE', '整课机器审计通过后才能逐页验收。')
  }
  if (session.updatedAt !== expectedUpdatedAt) {
    throw new TeacherAcceptanceError('VERSION_CONFLICT', '验收期间课程版本已经变化，请刷新后重试。')
  }
  if (
    !course.planning
    || audit.courseId !== course.id
    || audit.planRevisionId !== course.planning.planRevisionId
    || audit.planRevisionId !== session.planRevisionId
    || audit.contentRevisionId !== course.pageContent?.contentRevisionId
    || acceptance.courseId !== course.id
    || acceptance.planRevisionId !== audit.planRevisionId
    || acceptance.courseAuditId !== audit.id
  ) {
    throw new TeacherAcceptanceError('VERSION_CONFLICT', '整课审计或正文版本已经变化，旧验收记录不能继续使用。')
  }
  if (
    !teachingQualityAudit
    || teachingQualityAudit.status !== 'passed'
    || teachingQualityAudit.courseId !== course.id
    || teachingQualityAudit.planRevisionId !== audit.planRevisionId
    || teachingQualityAudit.contentRevisionId !== audit.contentRevisionId
    || teachingQualityAudit.generationCourseAuditId !== audit.id
    || !teachingQualityAudit.inputHash
    || teachingQualityAudit.inputHash !== teachingQualityInputHash(course)
  ) {
    throw new TeacherAcceptanceError('VERSION_CONFLICT', '当前版本缺少与整课机器审计完全匹配的 AI 教学审查通过记录。')
  }
  return { session, audit, acceptance, teachingQualityAudit }
}

async function requireCourseSnapshot(
  persistence: TeacherAcceptancePersistence,
  courseId: string,
): Promise<{ course: MainlineCourse; updatedAt: number }> {
  const snapshot = await persistence.findSnapshot(courseId)
  if (!snapshot) throw new TeacherAcceptanceError('COURSE_NOT_FOUND', `课程不存在：${courseId}`)
  return snapshot
}

async function saveAcceptanceResult(
  persistence: TeacherAcceptancePersistence,
  course: MainlineCourse,
  expectedUpdatedAt: number,
): Promise<void> {
  if (!await persistence.saveIfUnchanged(course, expectedUpdatedAt)) {
    throw new TeacherAcceptanceError('VERSION_CONFLICT', '验收或发布期间课程发生变化，本次结果未写入。')
  }
}

export const teacherAcceptanceService = createTeacherAcceptanceService({
  findSnapshot: findMainlineCourseSnapshot,
  saveIfUnchanged: saveMainlineCourseIfUnchanged,
})
