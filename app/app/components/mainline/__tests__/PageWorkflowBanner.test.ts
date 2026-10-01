import { describe, expect, it } from 'vitest'
import type { TeachingQualityAuditRecord } from '@/lib/mainline'
import { teachingAuditPresentation } from '../PageWorkflowBanner.js'

const audit: TeachingQualityAuditRecord = {
  schemaVersion: 'mainline-teaching-quality-audit-v1', id: 'teaching-1', courseId: 'course-1',
  planRevisionId: 'plan-1', contentRevisionId: 'content-1', generationCourseAuditId: 'course-audit-1',
  inputHash: 'input-current', standards: [], findings: [], status: 'passed', auditedAt: '2026-09-22T00:00:00.000Z',
}

describe('PageWorkflowBanner teaching-audit state', () => {
  it('marks a teaching pass stale after the student page content revision changes', () => {
    expect(teachingAuditPresentation(audit, {
      planRevisionId: 'plan-1', contentRevisionId: 'content-2', generationCourseAuditId: 'course-audit-1', generationStatus: 'rendering',
      inputHash: 'input-current',
    })).toBe('stale')
  })

  it('keeps a signed current teaching pass current', () => {
    expect(teachingAuditPresentation(audit, {
      planRevisionId: 'plan-1', contentRevisionId: 'content-1', generationCourseAuditId: 'course-audit-1', generationStatus: 'awaiting-teacher-acceptance',
      inputHash: 'input-current',
    })).toBe('current')
  })

  it('marks a legacy pass without an input signature stale', () => {
    const legacy = { ...audit }
    delete legacy.inputHash

    expect(teachingAuditPresentation(legacy, {
      planRevisionId: 'plan-1', contentRevisionId: 'content-1', generationCourseAuditId: 'course-audit-1', generationStatus: 'ready',
      inputHash: 'input-current',
    })).toBe('stale')
  })

  it('marks a pass stale when the current course review input changes without a revision change', () => {
    expect(teachingAuditPresentation(audit, {
      planRevisionId: 'plan-1', contentRevisionId: 'content-1', generationCourseAuditId: 'course-audit-1', generationStatus: 'ready',
      inputHash: 'input-after-source-refresh',
    })).toBe('stale')
  })
})
