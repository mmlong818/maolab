import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../domain.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  saveMainlineCourse: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
  saveMainlineCourse: mocks.saveMainlineCourse,
}))

vi.mock('../presentation/style-packs.js', () => ({
  resolveStylePackById: (id: string) => id === 'blueprint' ? { id } : null,
}))

import { PATCH } from '../../../api/v2/mainline/style/[courseId]/route.js'

function reviewedCourse(): MainlineCourse {
  return {
    id: 'course-1', stylePackId: 'ink-academy', qualityStatus: 'passed',
    planning: { planRevisionId: 'plan-1', status: 'ready', pages: [{ id: 'page-1', order: 1 }] },
    pageContent: { planRevisionId: 'plan-1', contentRevisionId: 'content-1', pages: [{ pageId: 'page-1' }] },
    generationSession: {
      schemaVersion: 'mainline-generation-session-v1', id: 'session-1', courseId: 'course-1', planRevisionId: 'plan-1', status: 'ready',
      createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:01:00.000Z',
      jobs: [{
        pageId: 'page-1', order: 1, planRevisionId: 'plan-1', attempt: 1, status: 'passed', inputHash: 'input-1', diagnostics: [], updatedAt: '2026-09-22T00:01:00.000Z',
        contentCheckpoint: { pageId: 'page-1', planRevisionId: 'plan-1', inputHash: 'input-1', contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1', createdAt: '2026-09-22T00:01:00.000Z' },
        checkpoint: { pageId: 'page-1', planRevisionId: 'plan-1', inputHash: 'input-1', contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1', renderEvidenceId: 'render-1', createdAt: '2026-09-22T00:01:00.000Z' },
      }],
    },
    factAudit: { contentRevisionId: 'content-1' }, pageRenderEvidence: [{ id: 'render-1' }],
    generationCourseAudit: { id: 'audit-1' }, teachingQualityAudit: { id: 'teaching-1', status: 'passed' },
    teacherAcceptance: { schemaVersion: 'mainline-teacher-acceptance-v1', courseId: 'course-1', planRevisionId: 'plan-1', courseAuditId: 'audit-1', pages: [], finalSignature: 'signed' },
  } as unknown as MainlineCourse
}

describe('style replacement invalidation route', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clears old proof before saving the newly styled course for rendering', async () => {
    const course = reviewedCourse()
    mocks.findMainlineCourse.mockResolvedValue(course)

    const response = await PATCH(
      new NextRequest(`http://localhost/api/v2/mainline/style/${course.id}`, {
        method: 'PATCH', body: JSON.stringify({ stylePackId: 'blueprint' }),
      }),
      { params: Promise.resolve({ courseId: course.id }) },
    )

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ ok: true, invalidated: true, generationStatus: 'rendering' })
    expect(mocks.saveMainlineCourse).toHaveBeenCalledWith(expect.objectContaining({
      stylePackId: 'blueprint', qualityStatus: 'draft', planning: expect.objectContaining({ status: 'review' }),
      generationSession: expect.objectContaining({ status: 'rendering' }),
    }))
    const saved = mocks.saveMainlineCourse.mock.calls[0]![0] as MainlineCourse
    expect(saved).not.toHaveProperty('factAudit')
    expect(saved).not.toHaveProperty('pageRenderEvidence')
    expect(saved).not.toHaveProperty('generationCourseAudit')
    expect(saved).not.toHaveProperty('teachingQualityAudit')
    expect(saved).not.toHaveProperty('teacherAcceptance')
  })
})
