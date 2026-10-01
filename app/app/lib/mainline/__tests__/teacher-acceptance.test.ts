import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { createTeacherAcceptanceService, TeacherAcceptanceError } from '../teacher-acceptance.js'
import { teachingQualityInputHash, teachingQualityStandards } from '../teaching-quality-audit.js'

function awaitingAcceptanceCourse(): MainlineCourse {
  const course = {
    id: 'course-1',
    topic: '测试课程', goals: [], sourceMaterial: [],
    qualityStatus: 'draft',
    planning: { planRevisionId: 'plan-1', status: 'review', pages: [{ id: 'page-1', order: 1 }] },
    pageContent: {
      planRevisionId: 'plan-1', contentRevisionId: 'content-1',
      pages: [{
        pageId: 'page-1', order: 1, purpose: 'explain', planRevisionId: 'plan-1', sourceRefs: [],
        content: { kind: 'explanation', title: '测试页面', coreStatement: '学生可见正文。', evidence: [], boundary: '测试边界。' },
        teacherCompanion: { script: '教师讲稿。', notes: [], pace: 'normal' },
      }],
    },
    generationSession: {
      schemaVersion: 'mainline-generation-session-v1', id: 'session-1', courseId: 'course-1', planRevisionId: 'plan-1',
      status: 'awaiting-teacher-acceptance', createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:01:00.000Z',
      jobs: [{
        pageId: 'page-1', order: 1, planRevisionId: 'plan-1', attempt: 1, status: 'passed', inputHash: 'input-1', diagnostics: [], updatedAt: '2026-09-22T00:01:00.000Z',
        checkpoint: { pageId: 'page-1', planRevisionId: 'plan-1', inputHash: 'input-1', contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1', renderEvidenceId: 'render-1', createdAt: '2026-09-22T00:01:00.000Z' },
      }],
    },
    generationCourseAudit: { id: 'audit-1', courseId: 'course-1', planRevisionId: 'plan-1', contentRevisionId: 'content-1' },
    teacherAcceptance: { schemaVersion: 'mainline-teacher-acceptance-v1', courseId: 'course-1', planRevisionId: 'plan-1', courseAuditId: 'audit-1', pages: [] },
    teachingQualityAudit: {
      schemaVersion: 'mainline-teaching-quality-audit-v1', id: 'teaching-old', courseId: 'course-1', planRevisionId: 'plan-1',
      contentRevisionId: 'old-content', generationCourseAuditId: 'audit-1', status: 'passed', standards: [], findings: [], auditedAt: '2026-09-22T00:00:00.000Z',
    },
  } as unknown as MainlineCourse
  course.teachingQualityAudit!.standards = teachingQualityStandards(course)
  return course
}

function persistenceFor(course: MainlineCourse, saveResult = true) {
  return {
    findSnapshot: async () => ({ course, updatedAt: 1 }),
    saveIfUnchanged: async () => saveResult,
  }
}

describe('teacher acceptance currentness gate', () => {
  it('rejects page acceptance when the passed teaching-quality audit belongs to old content', async () => {
    const course = awaitingAcceptanceCourse()
    const service = createTeacherAcceptanceService(persistenceFor(course))

    await expect(service.acceptPage(course.id, 'page-1', course.generationSession!.updatedAt))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' } satisfies Partial<TeacherAcceptanceError>)
  })

  it('accepts an unchanged current input and rejects source changes without revision changes', async () => {
    const course = awaitingAcceptanceCourse()
    course.teachingQualityAudit!.contentRevisionId = 'content-1'
    course.teachingQualityAudit!.inputHash = teachingQualityInputHash(course)
    const service = createTeacherAcceptanceService(persistenceFor(course))

    await expect(service.acceptPage(course.id, 'page-1', course.generationSession!.updatedAt)).resolves.toBeDefined()

    course.sourceMaterial.push({ kind: 'textbook', title: '新增来源', excerpt: '新的来源内容。' })
    await expect(service.acceptPage(course.id, 'page-1', course.generationSession!.updatedAt))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' } satisfies Partial<TeacherAcceptanceError>)
  })

  it('rejects a legacy teaching audit without an input signature', async () => {
    const course = awaitingAcceptanceCourse()
    course.teachingQualityAudit!.contentRevisionId = 'content-1'
    const service = createTeacherAcceptanceService(persistenceFor(course))

    await expect(service.acceptPage(course.id, 'page-1', course.generationSession!.updatedAt))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' } satisfies Partial<TeacherAcceptanceError>)
  })

  it('does not overwrite a concurrent semantic revision after acceptance checks pass', async () => {
    const course = awaitingAcceptanceCourse()
    course.teachingQualityAudit!.contentRevisionId = 'content-1'
    course.teachingQualityAudit!.inputHash = teachingQualityInputHash(course)
    const service = createTeacherAcceptanceService(persistenceFor(course, false))

    await expect(service.acceptPage(course.id, 'page-1', course.generationSession!.updatedAt))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' } satisfies Partial<TeacherAcceptanceError>)
  })
})
