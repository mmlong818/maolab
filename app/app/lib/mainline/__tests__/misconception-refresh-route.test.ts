import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  saveMainlineCourse: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
  saveMainlineCourse: mocks.saveMainlineCourse,
}))

import { POST } from '../../../api/v2/mainline/refresh-misconceptions/[courseId]/route.js'

function driftedCourse() {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  const scene = course.scenes[0]!
  scene.sceneType = 'ai-verify'
  scene.misconceptionSource = '把海岸线吻合当成大陆漂移的充分证据'
  scene.contentSlots = { aiClaim: '三角形内角和是二百度。', reveal: '核对证据链。' }
  return course
}

describe('误区说法校准接口', () => {
  beforeEach(() => vi.clearAllMocks())

  it('保存校准后的课程并返回仍需教师确认的页面', async () => {
    const course = driftedCourse()
    const unresolved = course.scenes[1]!
    unresolved.sceneType = 'contrast'
    delete unresolved.misconceptionSource
    delete unresolved.misconceptionSources
    mocks.findMainlineCourse.mockResolvedValue(course)

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-misconceptions/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.refreshedSceneIds).toEqual([course.scenes[0]!.id])
    expect(body.teacherReviewSceneIds).toContain(unresolved.id)
    expect(mocks.saveMainlineCourse).toHaveBeenCalledTimes(1)
  })

  it('只有未绑定页面时返回 409，且不保存', async () => {
    const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
    const scene = course.scenes[0]!
    scene.sceneType = 'contrast'
    delete scene.misconceptionSource
    delete scene.misconceptionSources
    mocks.findMainlineCourse.mockResolvedValue(course)

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-misconceptions/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )

    expect(response.status).toBe(409)
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })
})
