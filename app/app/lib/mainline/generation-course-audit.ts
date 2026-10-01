import type { MainlineCourse } from './domain.js'
import {
  attachGenerationSession,
  generationInputHash,
  markCourseAuditPassed,
  type GenerationCourseAuditRecord,
  type GenerationSession,
} from './generation-session.js'
import { auditCoursePageContentState } from './planning/page-content-audit.js'
import { factAuditPageContentCourse } from './planning/page-content-fact-audit.js'
import { lessonPresentationPages } from './presentation/presentation-pages.js'
import { findMainlineCourseSnapshot, saveMainlineCourseIfUnchanged } from './store.js'
import { buildTeachingQualityAudit, type TeachingQualityReviewOutput } from './teaching-quality-audit.js'

export interface GenerationCourseAuditDependencies {
  findSnapshot(courseId: string): Promise<{ course: MainlineCourse; updatedAt: number } | undefined>
  saveIfUnchanged(course: MainlineCourse, expectedUpdatedAt: number): Promise<boolean>
  auditFacts(course: MainlineCourse): Promise<{ course: MainlineCourse; teachingQualityReview?: TeachingQualityReviewOutput }>
}

export class GenerationCourseAuditError extends Error {
  constructor(
    readonly code: 'COURSE_NOT_FOUND' | 'SESSION_NOT_FOUND' | 'SESSION_NOT_READY' | 'AUDIT_BLOCKED' | 'SESSION_CONFLICT',
    message: string,
  ) {
    super(message)
    this.name = 'GenerationCourseAuditError'
  }
}

export function createGenerationCourseAuditor(dependencies: GenerationCourseAuditDependencies) {
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

  async function saveAuditResult(course: MainlineCourse, expectedUpdatedAt: number): Promise<void> {
    if (!await dependencies.saveIfUnchanged(course, expectedUpdatedAt)) {
      throw new GenerationCourseAuditError('SESSION_CONFLICT', '整课审计期间课程发生变化，本次结果未写入。')
    }
  }

  return {
    run(courseId: string, now = new Date().toISOString()) {
      return serialized(courseId, async () => {
        const snapshot = await dependencies.findSnapshot(courseId)
        if (!snapshot) throw new GenerationCourseAuditError('COURSE_NOT_FOUND', `课程不存在：${courseId}`)
        const { course, updatedAt: expectedUpdatedAt } = snapshot
        const session = course.generationSession
        if (!session || !course.planning || !course.pageContent) {
          throw new GenerationCourseAuditError('SESSION_NOT_FOUND', '课程缺少生成会话、页面计划或正文。')
        }
        if (session.status !== 'course-audit' || session.jobs.some(job => job.status !== 'passed')) {
          throw new GenerationCourseAuditError('SESSION_NOT_READY', '所有投影片通过真实画面检查后才能执行整课审计。')
        }
        assertCurrentRenderEvidence(course, session)
        const reviewed = await dependencies.auditFacts(course)
        const audited = reviewed.course
        const blockingContent = auditCoursePageContentState(audited.planning!, audited.pageContent!, audited.sourceMaterial)
          .filter(issue => issue.severity === 'blocking')
        const factAudit = audited.factAudit
        const factBlocking = factAudit?.issues.filter(issue => issue.severity === 'blocking') ?? []
        const unverified = factAudit?.unverifiedSceneIds ?? []
        const pending = factAudit?.pendingSceneIds ?? []
        if (!factAudit || factAudit.contentRevisionId !== audited.pageContent!.contentRevisionId || blockingContent.length || factBlocking.length || unverified.length || pending.length) {
          await saveAuditResult({ ...audited, qualityStatus: 'blocked' }, expectedUpdatedAt)
          const count = blockingContent.length + factBlocking.length + unverified.length + pending.length + (factAudit ? 0 : 1)
          const detail = [...blockingContent.map(issue => issue.message), ...factBlocking.map(issue => issue.message)].slice(0, 3).join('；')
          throw new GenerationCourseAuditError('AUDIT_BLOCKED', `整课审计发现 ${count} 个阻断项，请修正后重新检查。${detail ? ` ${detail}` : ''}`)
        }

        const pageIds = audited.pageContent!.pages.map(page => page.pageId)
        const presentationIds = lessonPresentationPages(audited).map(page => page.id)
        if (!sameOrderedIds(pageIds, presentationIds)) {
          await saveAuditResult({ ...audited, qualityStatus: 'blocked' }, expectedUpdatedAt)
          throw new GenerationCourseAuditError('AUDIT_BLOCKED', '备课、课堂、缩略图或导出使用的投影片序列与正文不一致。')
        }
        const renderEvidenceIds = session.jobs.map(job => job.checkpoint!.renderEvidenceId)
        const record: GenerationCourseAuditRecord = {
          schemaVersion: 'mainline-course-audit-v1',
          id: generationInputHash({ courseId, planRevisionId: session.planRevisionId, contentRevisionId: audited.pageContent!.contentRevisionId, renderEvidenceIds, pageIds }),
          courseId,
          planRevisionId: session.planRevisionId,
          contentRevisionId: audited.pageContent!.contentRevisionId,
          renderEvidenceIds,
          pageIds,
          factAuditAt: factAudit.auditedAt ?? now,
          passedAt: now,
        }
        const teachingQualityAudit = buildTeachingQualityAudit(audited, record, reviewed.teachingQualityReview, now)
        if (teachingQualityAudit.status !== 'passed') {
          await saveAuditResult({
            ...audited,
            generationCourseAudit: record,
            teachingQualityAudit,
            qualityStatus: 'blocked',
          }, expectedUpdatedAt)
          const blocking = teachingQualityAudit.findings.filter(item => item.severity === 'blocking').length
          const insufficient = teachingQualityAudit.findings.filter(item => item.severity === 'insufficient-evidence').length
          throw new GenerationCourseAuditError(
            'AUDIT_BLOCKED',
            blocking > 0
              ? `标准依据的 AI 教学审查发现 ${blocking} 个阻断项，请根据报告逐页修正后重审。`
              : `标准依据的 AI 教学审查缺少 ${insufficient} 项可核验证据，当前不能标记为 AI 审查通过。`,
          )
        }
        const completed = markCourseAuditPassed(session, now)
        const next = attachGenerationSession({
          ...audited,
          generationCourseAudit: record,
          teachingQualityAudit,
          teacherAcceptance: {
            schemaVersion: 'mainline-teacher-acceptance-v1',
            courseId,
            planRevisionId: session.planRevisionId,
            courseAuditId: record.id,
            pages: [],
          },
          qualityStatus: 'draft',
        }, completed)
        await saveAuditResult(next, expectedUpdatedAt)
        return { course: next, session: completed, audit: record }
      })
    },
  }
}

function assertCurrentRenderEvidence(course: MainlineCourse, session: GenerationSession): void {
  const evidenceById = new Map((course.pageRenderEvidence ?? []).map(item => [item.id, item]))
  for (const job of session.jobs) {
    const checkpoint = job.checkpoint
    const evidence = checkpoint && evidenceById.get(checkpoint.renderEvidenceId)
    if (!checkpoint || !evidence || evidence.pageId !== job.pageId || evidence.contentRevisionId !== checkpoint.contentRevisionId) {
      throw new GenerationCourseAuditError('SESSION_NOT_READY', `第 ${job.order} 页缺少与当前正文匹配的真实画面证据。`)
    }
    if (evidence.issues.some(issue => issue.severity === 'blocking')) {
      throw new GenerationCourseAuditError('SESSION_NOT_READY', `第 ${job.order} 页的真实画面仍有阻断问题。`)
    }
  }
}

function sameOrderedIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

export const generationCourseAuditor = createGenerationCourseAuditor({
  findSnapshot: findMainlineCourseSnapshot,
  saveIfUnchanged: saveMainlineCourseIfUnchanged,
  // This user-triggered audit must make one external model request at most.
  auditFacts: course => factAuditPageContentCourse(course, { maxAttempts: 1 }),
})
