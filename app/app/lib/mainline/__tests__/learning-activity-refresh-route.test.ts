import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  saveMainlineCourse: vi.fn(),
  learningActivityRepairPlan: vi.fn(),
  refreshCourseLearningActivities: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
  saveMainlineCourse: mocks.saveMainlineCourse,
}))

vi.mock('../edit/learning-activity-refresh.js', () => ({
  LearningActivityRefreshIncompleteError: class LearningActivityRefreshIncompleteError extends Error {
    readonly code = 'LEARNING_ACTIVITY_REFRESH_INCOMPLETE'
    constructor(readonly sceneIds: readonly string[]) { super('incomplete') }
  },
  learningActivityRepairPlan: mocks.learningActivityRepairPlan,
  refreshCourseLearningActivities: mocks.refreshCourseLearningActivities,
}))

import { POST } from '../../../api/v2/mainline/refresh-learning-activities/[courseId]/route.js'

function request(courseId: string) {
  return new NextRequest(`http://localhost/api/v2/mainline/refresh-learning-activities/${courseId}`, { method: 'POST' })
}

describe('学习活动深化接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.learningActivityRepairPlan.mockReturnValue({ sceneIds: [], teacherEditedSceneIds: [], total: 0 })
  })

  it('课程不存在时返回 404', async () => {
    mocks.findMainlineCourse.mockResolvedValue(undefined)
    const response = await POST(request('missing'), { params: Promise.resolve({ courseId: 'missing' }) })
    expect(response.status).toBe(404)
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('只有教师手改目标时拒绝自动覆盖', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.learningActivityRepairPlan.mockReturnValue({ sceneIds: [], teacherEditedSceneIds: ['scene-edited'], total: 0 })
    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.teacherEditedSceneIds).toEqual(['scene-edited'])
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('完成迁移且课程未变化时只保存一次', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const refreshed = { ...course, qualityStatus: 'blocked' as const }
    const sceneId = course.scenes[0]!.id
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.learningActivityRepairPlan.mockReturnValue({ sceneIds: [sceneId], teacherEditedSceneIds: [], total: 1 })
    mocks.refreshCourseLearningActivities.mockReturnValue({ course: refreshed, refreshedSceneIds: [sceneId], issues: [] })

    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.refreshedSceneIds).toEqual([sceneId])
    expect(mocks.saveMainlineCourse).toHaveBeenCalledTimes(1)
    expect(mocks.saveMainlineCourse).toHaveBeenCalledWith(refreshed)
  })

  it('迁移期间课程被修改时整批拒绝保存', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const changed = { ...course, topic: `${course.topic}（教师刚修改）` }
    const sceneId = course.scenes[0]!.id
    mocks.findMainlineCourse.mockResolvedValueOnce(course).mockResolvedValueOnce(changed)
    mocks.learningActivityRepairPlan.mockReturnValue({ sceneIds: [sceneId], teacherEditedSceneIds: [], total: 1 })
    mocks.refreshCourseLearningActivities.mockReturnValue({ course, refreshedSceneIds: [sceneId], issues: [] })

    const response = await POST(request(course.id), { params: Promise.resolve({ courseId: course.id }) })
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.code).toBe('COURSE_CHANGED_DURING_ACTIVITY_REFRESH')
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })
})
