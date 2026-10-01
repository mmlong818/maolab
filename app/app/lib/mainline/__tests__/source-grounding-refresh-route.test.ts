import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourseSnapshot: vi.fn(),
  saveMainlineCourseIfUnchanged: vi.fn(),
  resolveCurrentCourseGroundings: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourseSnapshot: mocks.findMainlineCourseSnapshot,
  saveMainlineCourseIfUnchanged: mocks.saveMainlineCourseIfUnchanged,
}))

vi.mock('../edit/source-grounding-loader.js', () => ({
  resolveCurrentCourseGroundings: mocks.resolveCurrentCourseGroundings,
}))

import { POST } from '../../../api/v2/mainline/refresh-source-grounding/[courseId]/route.js'

function legacyCourse() {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  const source = course.sourceMaterial[0]!
  course.sourceMaterial[0] = {
    kind: source.kind,
    title: source.title,
    kpId: source.kpId ?? 'kp-source-route',
    excerpt: '待 LLM 填充教材原文。',
  }
  return course
}

const coverage = {
  authoritativeExcerptKps: 0,
  aiExtractedKps: 0,
  unverifiedExcerptKps: 0,
  metadataOnlyKps: 1,
  unprovenancedKps: 0,
  matchedResourceKps: 0,
  matchedResources: 0,
  resourceCatalogAvailable: false,
}

describe('教材依据刷新接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.saveMainlineCourseIfUnchanged.mockResolvedValue(true)
  })

  it('有来源节点时保存刷新后的课程并返回覆盖结果', async () => {
    const course = {
      ...legacyCourse(),
      qualityStatus: 'passed',
      planning: { planRevisionId: 'plan-1', status: 'ready', pages: [] },
      generationSession: {
        schemaVersion: 'mainline-generation-session-v1', id: 'session-1', courseId: 'course-1', planRevisionId: 'plan-1',
        status: 'course-audit', createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:01:00.000Z', jobs: [],
      },
      factAudit: { id: 'fact-1' },
      generationCourseAudit: { id: 'course-audit-1' },
      teachingQualityAudit: { id: 'teaching-audit-1', status: 'passed' },
      teacherAcceptance: { finalSignature: 'signed' },
    } as unknown as MainlineCourse
    const kpId = course.sourceMaterial[0]!.kpId!
    const auditToken = course.generationSession!.updatedAt
    mocks.findMainlineCourseSnapshot.mockResolvedValue({ course, updatedAt: 101 })
    mocks.resolveCurrentCourseGroundings.mockResolvedValue({
      byKp: {
        [kpId]: {
          citation: '课程目录来源 pep-cn，节点 leaf-1（仅用于教材定位）',
          provenance: { source: 'pep-cn', externalId: 'leaf-1', evidenceStatus: 'curriculum-metadata' },
        },
      },
      coverage,
    })

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-source-grounding/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, refreshedKpIds: [kpId], clearedPlaceholderCount: 1, sourceCoverage: coverage })
    expect(mocks.saveMainlineCourseIfUnchanged).toHaveBeenCalledTimes(1)
    const saved = mocks.saveMainlineCourseIfUnchanged.mock.calls[0]?.[0] as MainlineCourse
    expect(saved.sourceMaterial[0]).toMatchObject({
      kpId,
      citation: expect.stringContaining('leaf-1'),
    })
    expect(saved.sourceMaterial[0]!.excerpt).toBeUndefined()
    expect(saved.qualityStatus).toBe('draft')
    expect(saved.factAudit).toBeUndefined()
    expect(saved.generationCourseAudit).toBeUndefined()
    expect(saved.teachingQualityAudit).toBeUndefined()
    expect(saved.teacherAcceptance).toBeUndefined()
    expect(saved.generationSession?.updatedAt).not.toBe(auditToken)
    expect(saved.generationSession?.status).toBe('generating')
  })

  it('知识点索引没有定位时返回 409 且不保存', async () => {
    const course = legacyCourse()
    mocks.findMainlineCourseSnapshot.mockResolvedValue({ course, updatedAt: 101 })
    mocks.resolveCurrentCourseGroundings.mockResolvedValue({ byKp: {}, coverage: { ...coverage, metadataOnlyKps: 0 } })

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-source-grounding/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )

    expect(response.status).toBe(409)
    expect(mocks.saveMainlineCourseIfUnchanged).not.toHaveBeenCalled()
  })

  it('returns 409 when the course changes while grounding is resolved', async () => {
    const course = legacyCourse()
    const kpId = course.sourceMaterial[0]!.kpId!
    mocks.findMainlineCourseSnapshot.mockResolvedValue({ course, updatedAt: 101 })
    mocks.resolveCurrentCourseGroundings.mockResolvedValue({
      byKp: { [kpId]: { citation: 'leaf-1', provenance: { source: 'index', evidenceStatus: 'authoritative-excerpt' } } },
      coverage,
    })
    mocks.saveMainlineCourseIfUnchanged.mockResolvedValue(false)

    const response = await POST(
      new NextRequest('http://localhost/api/v2/mainline/refresh-source-grounding/course-1', { method: 'POST' }),
      { params: Promise.resolve({ courseId: 'course-1' }) },
    )

    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ code: 'COURSE_CONFLICT' })
  })
})
