import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  saveMainlineCourse: vi.fn(),
  findSeason: vi.fn(),
  practiceRepairPlan: vi.fn(),
  refreshProblemPractices: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
  saveMainlineCourse: mocks.saveMainlineCourse,
}))

vi.mock('../season-store.js', () => ({ findSeason: mocks.findSeason }))

vi.mock('../edit/practice-refresh.js', () => ({
  PracticeRefreshIncompleteError: class PracticeRefreshIncompleteError extends Error {
    readonly code = 'PRACTICE_REFRESH_INCOMPLETE'
    constructor(readonly sceneIds: readonly string[]) {
      super('incomplete')
    }
  },
  PracticeRefreshStructureError: class PracticeRefreshStructureError extends Error {
    readonly code = 'PRACTICE_REFRESH_STRUCTURE_INVALID'
  },
  practiceRepairPlan: mocks.practiceRepairPlan,
  refreshProblemPractices: mocks.refreshProblemPractices,
}))

import { POST } from '../../../api/v2/mainline/refresh-practices/[courseId]/route.js'
import { PracticeGenerationQualityError } from '../generation/fill-scenes.js'

function request(courseId: string) {
  return new NextRequest(`http://localhost/api/v2/mainline/refresh-practices/${courseId}`, { method: 'POST' })
}

describe('问题练习整批重生成接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.practiceRepairPlan.mockReturnValue({ sceneIds: [], missingFragmentIds: [], total: 0 })
  })

  it('课程不存在时返回 404', async () => {
    mocks.findMainlineCourse.mockResolvedValue(undefined)
    const response = await POST(request('missing'), { params: Promise.resolve({ courseId: 'missing' }) })

    expect(response.status).toBe(404)
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('没有问题练习时返回 409 且不调用模型或保存', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    mocks.findMainlineCourse.mockResolvedValue(course)
    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })

    expect(response.status).toBe(409)
    expect(mocks.refreshProblemPractices).not.toHaveBeenCalled()
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('全部问题页通过后只保存一次完整课程', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const repaired = { ...course, qualityStatus: 'blocked' as const }
    const sceneId = course.scenes[0]!.id
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.practiceRepairPlan.mockReturnValue({ sceneIds: [sceneId], missingFragmentIds: [], total: 1 })
    mocks.refreshProblemPractices.mockResolvedValue({
      course: repaired,
      regeneratedSceneIds: [sceneId],
      insertedSceneIds: [],
      issues: [],
    })

    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.regeneratedSceneIds).toEqual([sceneId])
    expect(body.insertedSceneIds).toEqual([])
    expect(mocks.saveMainlineCourse).toHaveBeenCalledTimes(1)
    expect(mocks.saveMainlineCourse).toHaveBeenCalledWith(repaired)
  })

  it('缺失练习补页并生成后仍只保存一次完整课程', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const repaired = { ...course, qualityStatus: 'blocked' as const }
    const fragmentId = 'fragment-kp-01'
    const insertedSceneId = 'repair-fragment-kp-01-practice'
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.practiceRepairPlan.mockReturnValue({ sceneIds: [], missingFragmentIds: [fragmentId], total: 1 })
    mocks.refreshProblemPractices.mockResolvedValue({
      course: repaired,
      regeneratedSceneIds: [insertedSceneId],
      insertedSceneIds: [insertedSceneId],
      issues: [],
    })

    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.insertedSceneIds).toEqual([insertedSceneId])
    expect(mocks.saveMainlineCourse).toHaveBeenCalledTimes(1)
    expect(mocks.saveMainlineCourse).toHaveBeenCalledWith(repaired)
  })

  it('任一生成步骤失败时不保存半修课程', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.practiceRepairPlan.mockReturnValue({ sceneIds: [course.scenes[0]!.id], missingFragmentIds: [], total: 1 })
    mocks.refreshProblemPractices.mockRejectedValue(new Error('model unavailable'))

    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })

    expect(response.status).toBe(500)
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('新增练习生成不合格时不显示不存在的第 0 页', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const fragmentId = 'fragment-kp-01'
    const insertedSceneId = 'repair-fragment-kp-01-practice'
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.practiceRepairPlan.mockReturnValue({ sceneIds: [], missingFragmentIds: [fragmentId], total: 1 })
    mocks.refreshProblemPractices.mockRejectedValue(new PracticeGenerationQualityError(
      insertedSceneId,
      3,
      ['题面仍缺少学生可见材料。'],
    ))

    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body.error).toContain('新增练习页练习内容连续 3 次未通过质量检查')
    expect(body.error).not.toContain('第 0 页')
    expect(body.sceneNo).toBeNull()
    expect(body.sceneId).toBe(insertedSceneId)
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('生成期间课程被其他编辑修改时拒绝覆盖新内容', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const changedCourse = { ...course, topic: `${course.topic}（教师刚修改）` }
    const sceneId = course.scenes[0]!.id
    mocks.findMainlineCourse
      .mockResolvedValueOnce(course)
      .mockResolvedValueOnce(changedCourse)
    mocks.practiceRepairPlan.mockReturnValue({ sceneIds: [sceneId], missingFragmentIds: [], total: 1 })
    mocks.refreshProblemPractices.mockResolvedValue({
      course: { ...course, qualityStatus: 'blocked' as const },
      regeneratedSceneIds: [sceneId],
      insertedSceneIds: [],
      issues: [],
    })

    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('COURSE_CHANGED_DURING_REFRESH')
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })
})
