import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../domain.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourseSnapshot: vi.fn(),
  saveMainlineCourseIfUnchanged: vi.fn(),
  fillImages: vi.fn(),
  applyGeneratedPageImageRevision: vi.fn(),
  retainCurrentPageFactAudit: {},
}))

vi.mock('../store.js', () => ({
  findMainlineCourseSnapshot: mocks.findMainlineCourseSnapshot,
  saveMainlineCourseIfUnchanged: mocks.saveMainlineCourseIfUnchanged,
}))
vi.mock('../generation/fill-images.js', () => ({ fillImages: mocks.fillImages }))
vi.mock('../page-image-revision.js', () => ({
  applyGeneratedPageImageRevision: mocks.applyGeneratedPageImageRevision,
  retainCurrentPageFactAudit: mocks.retainCurrentPageFactAudit,
}))

import { POST } from '../../../api/v2/mainline/fill-images/[courseId]/route.js'

function publishedCourse(): MainlineCourse {
  return {
    id: 'course-1', topic: '测试课程', qualityStatus: 'passed',
    planning: { planRevisionId: 'plan-1', status: 'ready', pages: [{ id: 'page-1', order: 1 }] },
    pageContent: {
      planRevisionId: 'plan-1', contentRevisionId: 'content-old',
      pages: [{ pageId: 'page-1', imageUrl: '/old.png' }],
    },
    generationCourseAudit: { id: 'audit-old' },
    teachingQualityAudit: { id: 'teaching-old', status: 'passed' },
    teacherAcceptance: { finalSignature: 'signed-old' },
  } as unknown as MainlineCourse
}

describe('fill-images revision route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveMainlineCourseIfUnchanged.mockResolvedValue(true)
  })

  it('routes changed page images through revision invalidation before saving', async () => {
    const course = publishedCourse()
    const filled = {
      ...course,
      pageContent: {
        ...course.pageContent!,
        pages: [{ ...course.pageContent!.pages[0]!, imageUrl: '/new.png', imagePrompt: 'new', imageAspect: '4:3' }],
      },
    }
    const invalidated = {
      ...filled,
      qualityStatus: 'draft' as const,
      pageContent: { ...filled.pageContent!, contentRevisionId: 'content-new' },
      generationCourseAudit: undefined,
      teachingQualityAudit: undefined,
      teacherAcceptance: undefined,
    }
    mocks.findMainlineCourseSnapshot.mockResolvedValue({ course, updatedAt: 101 })
    mocks.fillImages.mockResolvedValue({
      course: filled, filledSceneIds: ['page-1'], failedSceneIds: [], changedPageIds: ['page-1'],
    })
    mocks.applyGeneratedPageImageRevision.mockResolvedValue(invalidated)

    const response = await POST(
      new NextRequest('http://localhost/api/v2/mainline/fill-images/course-1?force=1', { method: 'POST' }),
      { params: Promise.resolve({ courseId: 'course-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.applyGeneratedPageImageRevision).toHaveBeenCalledWith(
      course,
      'page-1',
      { imageUrl: '/new.png', imagePrompt: 'new', imageAspect: '4:3' },
      mocks.retainCurrentPageFactAudit,
    )
    expect(mocks.saveMainlineCourseIfUnchanged).toHaveBeenCalledWith(invalidated, 101)
    await expect(response.json()).resolves.toMatchObject({ changedPageIds: ['page-1'], reviewRequired: true })
  })

  it('does not invalidate an unchanged forced image identity', async () => {
    const course = publishedCourse()
    mocks.findMainlineCourseSnapshot.mockResolvedValue({ course, updatedAt: 101 })
    mocks.fillImages.mockResolvedValue({
      course, filledSceneIds: ['page-1'], failedSceneIds: [], changedPageIds: [],
    })

    const response = await POST(
      new NextRequest('http://localhost/api/v2/mainline/fill-images/course-1?force=1', { method: 'POST' }),
      { params: Promise.resolve({ courseId: 'course-1' }) },
    )

    expect(response.status).toBe(200)
    expect(mocks.applyGeneratedPageImageRevision).not.toHaveBeenCalled()
    expect(mocks.saveMainlineCourseIfUnchanged).toHaveBeenCalledWith(course, 101)
    await expect(response.json()).resolves.toMatchObject({ changedPageIds: [], reviewRequired: false })
  })

  it('returns 409 without overwriting a course changed during image generation', async () => {
    const course = publishedCourse()
    mocks.findMainlineCourseSnapshot.mockResolvedValue({ course, updatedAt: 101 })
    mocks.fillImages.mockResolvedValue({ course, filledSceneIds: ['page-1'], failedSceneIds: [], changedPageIds: [] })
    mocks.saveMainlineCourseIfUnchanged.mockResolvedValue(false)

    const response = await POST(
      new NextRequest('http://localhost/api/v2/mainline/fill-images/course-1?force=1', { method: 'POST' }),
      { params: Promise.resolve({ courseId: 'course-1' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'COURSE_CONFLICT' })
  })
})
