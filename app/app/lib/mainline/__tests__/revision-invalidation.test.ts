import { describe, expect, it } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { invalidateCourseReviewArtifacts } from '../revision-invalidation.js'

function reviewedCourse(): MainlineCourse {
  return {
    id: 'course-1',
    qualityStatus: 'passed',
    planning: {
      planRevisionId: 'plan-1', status: 'ready', pages: [{ id: 'page-1', order: 1 }],
    },
    pageContent: {
      planRevisionId: 'plan-1', contentRevisionId: 'content-1', pages: [{ pageId: 'page-1' }],
    },
    generationSession: {
      schemaVersion: 'mainline-generation-session-v1', id: 'session-1', courseId: 'course-1', planRevisionId: 'plan-1',
      status: 'ready', createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:01:00.000Z',
      jobs: [{
        pageId: 'page-1', order: 1, planRevisionId: 'plan-1', attempt: 1, status: 'passed', inputHash: 'input-1', diagnostics: [], updatedAt: '2026-09-22T00:01:00.000Z',
        contentCheckpoint: { pageId: 'page-1', planRevisionId: 'plan-1', inputHash: 'input-1', contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1', createdAt: '2026-09-22T00:01:00.000Z' },
        checkpoint: { pageId: 'page-1', planRevisionId: 'plan-1', inputHash: 'input-1', contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1', renderEvidenceId: 'render-1', createdAt: '2026-09-22T00:01:00.000Z' },
      }],
    },
    factAudit: { contentRevisionId: 'content-1' },
    pageRenderEvidence: [{ id: 'render-1' }],
    generationCourseAudit: { id: 'audit-1' },
    teachingQualityAudit: { id: 'teaching-1', status: 'passed' },
    teacherAcceptance: { courseId: 'course-1', planRevisionId: 'plan-1', courseAuditId: 'audit-1', pages: [], finalSignature: 'signed' },
  } as unknown as MainlineCourse
}

describe('course review invalidation', () => {
  it('template changes clear downstream proof and require fresh rendering', () => {
    const course = reviewedCourse()
    const next = invalidateCourseReviewArtifacts({ ...course, stylePackId: 'blueprint' }, '2026-09-22T01:00:00.000Z')

    expect(next.qualityStatus).toBe('draft')
    expect(next.planning?.status).toBe('review')
    expect(next.factAudit).toBeUndefined()
    expect(next.pageRenderEvidence).toBeUndefined()
    expect(next.generationCourseAudit).toBeUndefined()
    expect(next.teachingQualityAudit).toBeUndefined()
    expect(next.teacherAcceptance).toBeUndefined()
    expect(next.generationSession).toMatchObject({ status: 'rendering', updatedAt: '2026-09-22T01:00:00.000Z' })
    expect(next.generationSession?.jobs[0]).toMatchObject({ status: 'content-ready', contentCheckpoint: { contentRevisionId: 'content-1' } })
    expect(next.generationSession?.jobs[0]?.checkpoint).toBeUndefined()
  })
})
