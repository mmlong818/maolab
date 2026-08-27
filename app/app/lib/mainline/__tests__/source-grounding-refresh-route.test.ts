import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  saveMainlineCourse: vi.fn(),
  resolveCurrentCourseGroundings: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
  saveMainlineCourse: mocks.saveMainlineCourse,
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
  })

  it('有来源节点时保存刷新后的课程并返回覆盖结果', async () => {
    const course = legacyCourse()
    const kpId = course.sourceMaterial[0]!.kpId!
    mocks.findMainlineCourse.mockResolvedValue(course)
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
    expect(mocks.saveMainlineCourse).toHaveBeenCalledTimes(1)
    expect(mocks.saveMainlineCourse.mock.calls[0]?.[0].sourceMaterial[0]).toMatchObject({
      kpId,
      citation: expect.stringContaining('leaf-1'),
    })
    expect(mocks.saveMainlineCourse.mock.calls[0]?.[0].sourceMaterial[0].excerpt).toBeUndefined()
  })

  it('知识点索引没有定位时返回 409 且不保存', async () => {
    const course = legacyCourse()
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.resolveCurrentCourseGroundings.mockResolvedValue({ byKp: {}, coverage: { ...coverage, metadataOnlyKps: 0 } })

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-source-grounding/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )

    expect(response.status).toBe(409)
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })
})
