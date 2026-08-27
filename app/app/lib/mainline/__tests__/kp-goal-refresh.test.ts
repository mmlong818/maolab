import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MainlineCourse } from '../domain.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import { learningObjectivesFromAnnotations, type KpGoalMetadata } from '../edit/kp-goal-loader.js'
import {
  courseNeedsKpGoalRefresh,
  KpGoalRefreshError,
  refreshCourseKpGoals,
} from '../edit/kp-goal-refresh.js'
import { KP_GOAL_TRACE_ISSUE_MESSAGE } from '../quality-gates.js'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  saveMainlineCourse: vi.fn(),
  loadCurrentKpGoalMetadata: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
  saveMainlineCourse: mocks.saveMainlineCourse,
}))

vi.mock('../edit/kp-goal-loader.js', async importOriginal => {
  const original = await importOriginal<typeof import('../edit/kp-goal-loader.js')>()
  return { ...original, loadCurrentKpGoalMetadata: mocks.loadCurrentKpGoalMetadata }
})

import { POST } from '../../../api/v2/mainline/refresh-kp-goals/[courseId]/route.js'

const KP_1 = 'kp-observe'
const KP_2 = 'kp-perform'

function legacyMultiKpCourse(): MainlineCourse {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  course.sourceMaterial = [
    { kind: 'textbook', title: '观察月光意象', kpId: KP_1 },
    { kind: 'textbook', title: '解释动作与情感', kpId: KP_2 },
  ]
  course.goals = [{
    id: 'goal-kp-01',
    statement: '学生能说出本课主要内容。',
    successSignal: '学生能完成本课总复述。',
    nonGoals: ['不扩展作者生平'],
  }]
  course.learningFragments = [
    {
      id: 'fragment-intro',
      goalId: 'goal-kp-01',
      durationTargetSec: 70,
      sceneIds: ['jy-01-poem'],
      successSignal: '学生进入本课问题。',
    },
    {
      id: 'fragment-kp-01',
      goalId: 'goal-kp-01',
      durationTargetSec: 60,
      sceneIds: ['jy-02-moonlight'],
      successSignal: '学生能观察月光意象。',
      kpId: KP_1,
      skeletonId: 'frag-conceptual',
    },
    {
      id: 'fragment-kp-02',
      goalId: 'goal-kp-01',
      durationTargetSec: 60,
      sceneIds: ['jy-03-action'],
      successSignal: '学生能解释动作与情感。',
      kpId: KP_2,
      skeletonId: 'frag-conceptual',
    },
    {
      id: 'fragment-recap',
      goalId: 'goal-kp-01',
      durationTargetSec: 70,
      sceneIds: ['jy-04-recap'],
      successSignal: '学生完成全课复述。',
    },
  ]
  return course
}

function metadata(): Record<string, KpGoalMetadata> {
  return {
    [KP_1]: {
      id: KP_1,
      canonicalName: '观察月光意象',
      learningObjectives: ['理解月光意象', '能从诗句中圈出月光意象并说明依据'],
    },
    [KP_2]: {
      id: KP_2,
      canonicalName: '解释动作与情感',
      learningObjectives: ['能解释“举头—低头”如何表现思乡情感'],
    },
  }
}

describe('逐知识点目标重建', () => {
  it('保留原总目标和全部页面，只新增目标并改绑对应片段', () => {
    const course = legacyMultiKpCourse()
    const originalGoal = structuredClone(course.goals[0])
    const result = refreshCourseKpGoals(course, metadata())

    expect(courseNeedsKpGoalRefresh(course)).toBe(true)
    expect(result.createdGoals).toHaveLength(2)
    expect(result.course.goals[0]).toEqual(originalGoal)
    expect(result.createdGoals[0]).toMatchObject({
      id: 'goal-kp-01-refreshed-1',
      kpId: KP_1,
      statement: '能从诗句中圈出月光意象并说明依据',
    })
    expect(result.createdGoals[1]).toMatchObject({
      id: 'goal-kp-02',
      kpId: KP_2,
    })
    expect(result.course.learningFragments.find(fragment => fragment.kpId === KP_1)?.goalId)
      .toBe('goal-kp-01-refreshed-1')
    expect(result.course.learningFragments.find(fragment => fragment.kpId === KP_2)?.goalId)
      .toBe('goal-kp-02')
    expect(result.course.learningFragments.find(fragment => fragment.id === 'fragment-intro')?.goalId)
      .toBe('goal-kp-01')
    expect(result.course.learningFragments.find(fragment => fragment.id === 'fragment-recap')?.goalId)
      .toBe('goal-kp-01')
    expect(result.course.sourceMaterial).toBe(course.sourceMaterial)
    expect(result.course.scenes).toBe(course.scenes)
    expect(result.course.beats).toBe(course.beats)
    expect(result.issues.some(issue => issue.message === KP_GOAL_TRACE_ISSUE_MESSAGE)).toBe(false)
  })

  it('索引标题不一致时整批失败且不改输入课程', () => {
    const course = legacyMultiKpCourse()
    const before = JSON.stringify(course)
    const mismatched = metadata()
    mismatched[KP_2] = { ...mismatched[KP_2]!, canonicalName: '另一个知识点' }

    expect(() => refreshCourseKpGoals(course, mismatched)).toThrow(KpGoalRefreshError)
    expect(JSON.stringify(course)).toBe(before)
  })

  it('知识点片段缺失时拒绝创建没有教学承接的目标', () => {
    const course = legacyMultiKpCourse()
    course.learningFragments = course.learningFragments.filter(fragment => fragment.kpId !== KP_2)

    expect(() => refreshCourseKpGoals(course, metadata())).toThrow(/目标重建条件不完整/)
  })
})

describe('知识点目标元数据解析', () => {
  it('只保留 annotations 中非空的学习目标文本', () => {
    expect(learningObjectivesFromAnnotations(JSON.stringify({
      learningObjectives: { value: [' 能解释现象 ', '', 42, '会完成计算'] },
    }))).toEqual(['能解释现象', '会完成计算'])
    expect(learningObjectivesFromAnnotations('{bad-json')).toEqual([])
  })
})

describe('逐知识点目标重建接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('全部条件通过后一次保存，并返回重建数量', async () => {
    const course = legacyMultiKpCourse()
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.loadCurrentKpGoalMetadata.mockReturnValue(metadata())

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-kp-goals/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ ok: true, createdGoalCount: 2 })
    expect(mocks.saveMainlineCourse).toHaveBeenCalledTimes(1)
  })

  it('重建期间课程发生变化时返回 409 且不覆盖', async () => {
    const course = legacyMultiKpCourse()
    mocks.findMainlineCourse
      .mockResolvedValueOnce(course)
      .mockResolvedValueOnce({ ...course, topic: '教师刚刚修改的标题' })
    mocks.loadCurrentKpGoalMetadata.mockReturnValue(metadata())

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-kp-goals/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )

    expect(response.status).toBe(409)
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('索引目标缺失时返回具体原因且不保存', async () => {
    const course = legacyMultiKpCourse()
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.loadCurrentKpGoalMetadata.mockReturnValue({ [KP_1]: metadata()[KP_1] })

    const response = await POST(
      new NextRequest(`http://localhost/api/v2/mainline/refresh-kp-goals/${course.id}`, { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.reasons).toEqual(expect.arrayContaining([expect.stringContaining('当前索引中不存在')]))
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })
})
