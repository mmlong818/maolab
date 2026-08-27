import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  recordPracticeAttempt: vi.fn(),
  savedPracticeSceneIds: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
}))

vi.mock('../mastery-store.js', () => ({
  recordPracticeAttempt: mocks.recordPracticeAttempt,
  savedPracticeSceneIds: mocks.savedPracticeSceneIds,
}))

import { GET, POST } from '../../../api/v2/mainline/response/route.js'

const PRACTICE_SNAPSHOT = {
  task: '判断甲、乙两车是否相对运动，并说明依据。',
  feedback: '比较两个时刻的相对位置；位置关系变化即可判定相对运动。',
}
const FOLLOW_UP = {
  label: '把这条依据迁移出去',
  message: '引用学生依据与成功标准的下一步。',
  basis: 'student-reflection-and-success-criterion',
}

function request(practiceSnapshot = PRACTICE_SNAPSHOT, sessionId = 'session-route-test') {
  return new NextRequest('http://localhost/api/v2/mainline/response', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      courseId: 'course-1',
      sessionId,
      sceneId: 'scene-1',
      kpId: 'kp-1',
      practiceSnapshot,
      outcome: 'correct',
      confidence: 'high',
      attemptText: '原答案。',
      reflectionText: '关键依据是相对位置随时间变化。',
    }),
  })
}

function course(sceneType = 'practice', withGoal = true) {
  return {
    scenes: [{ id: 'scene-1', sceneType, kpId: 'kp-1', contentSlots: PRACTICE_SNAPSHOT }],
    goals: withGoal
      ? [{ id: 'goal-1', kpId: 'kp-1', successSignal: '能说明判断依据并得出结论。' }]
      : [],
  }
}

describe('POST /api/v2/mainline/response', () => {
  beforeEach(() => {
    mocks.findMainlineCourse.mockReset()
    mocks.recordPracticeAttempt.mockReset()
    mocks.savedPracticeSceneIds.mockReset()
  })

  it('读取正式练习完成状态时只返回服务端核对过的幕编号', async () => {
    mocks.findMainlineCourse.mockResolvedValue(course())
    mocks.savedPracticeSceneIds.mockResolvedValue(['scene-1'])

    const response = await GET(new NextRequest('http://localhost/api/v2/mainline/response?courseId=course-1&sessionId=session-route-test'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ savedSceneIds: ['scene-1'] })
    expect(mocks.savedPracticeSceneIds).toHaveBeenCalledWith('course-1', 'session-route-test', [{
      sceneId: 'scene-1',
      task: PRACTICE_SNAPSHOT.task,
      feedback: PRACTICE_SNAPSHOT.feedback,
    }])
  })

  it('读取正式练习状态时拒绝缺少课程编号或不存在的课程', async () => {
    const missing = await GET(new NextRequest('http://localhost/api/v2/mainline/response'))
    expect(missing.status).toBe(400)

    mocks.findMainlineCourse.mockResolvedValue(undefined)
    const absent = await GET(new NextRequest('http://localhost/api/v2/mainline/response?courseId=missing&sessionId=session-route-test'))
    expect(absent.status).toBe(404)
    expect(mocks.savedPracticeSceneIds).not.toHaveBeenCalled()
  })

  it('拒绝把非练习幕写入练习学情', async () => {
    mocks.findMainlineCourse.mockResolvedValue(course('concept-build'))

    const response = await POST(request())

    expect(response.status).toBe(400)
    expect(mocks.recordPracticeAttempt).not.toHaveBeenCalled()
  })

  it('拒绝缺少课堂会话编号的正式练习提交', async () => {
    const response = await POST(request(PRACTICE_SNAPSHOT, ''))

    expect(response.status).toBe(400)
    expect(mocks.findMainlineCourse).not.toHaveBeenCalled()
    expect(mocks.recordPracticeAttempt).not.toHaveBeenCalled()
  })

  it('缺少服务端成功标准时拒绝形成无法解释的掌握度', async () => {
    mocks.findMainlineCourse.mockResolvedValue(course('practice', false))

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(mocks.recordPracticeAttempt).not.toHaveBeenCalled()
  })

  it.each([
    ['题目', { task: '   ', feedback: PRACTICE_SNAPSHOT.feedback }],
    ['反馈', { task: PRACTICE_SNAPSHOT.task, feedback: '   ' }],
  ])('缺少服务端%s快照时拒绝形成无法追溯的掌握度', async (_label, contentSlots) => {
    mocks.findMainlineCourse.mockResolvedValue({
      ...course(),
      scenes: [{ id: 'scene-1', sceneType: 'practice', kpId: 'kp-1', contentSlots }],
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(mocks.recordPracticeAttempt).not.toHaveBeenCalled()
  })

  it('页面题目或反馈已被教师修改时拒绝把旧页面作答记到新内容上', async () => {
    mocks.findMainlineCourse.mockResolvedValue(course())

    const response = await POST(request({
      task: '学生打开页面时看到的旧题目。',
      feedback: PRACTICE_SNAPSHOT.feedback,
    }))

    expect(response.status).toBe(409)
    expect(mocks.recordPracticeAttempt).not.toHaveBeenCalled()
  })

  it('拒绝用“已订正”一类占位文字更新掌握度', async () => {
    mocks.findMainlineCourse.mockResolvedValue(course())
    const invalid = request()
    const body = await invalid.json() as Record<string, unknown>
    const response = await POST(new NextRequest('http://localhost/api/v2/mainline/response', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, outcome: 'incorrect', reflectionText: '已订正。' }),
    }))

    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: expect.stringContaining('原答从哪里开始偏离') })
    expect(mocks.recordPracticeAttempt).not.toHaveBeenCalled()
  })

  it('只保存服务端确认的内容与目标快照，并明确返回自评与暂定分数来源', async () => {
    mocks.findMainlineCourse.mockResolvedValue(course())
    mocks.recordPracticeAttempt.mockResolvedValue({
      score: 0.68,
      calibration: { kind: 'calibrated', delta: 0.18, label: '准确且有把握', message: '继续迁移。' },
      followUp: FOLLOW_UP,
      evidenceBasis: 'self-assessed-after-feedback',
      scoreStatus: 'provisional',
    })

    const response = await POST(request())
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mocks.recordPracticeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      practiceSnapshot: PRACTICE_SNAPSHOT,
      objectiveCriteria: [{
        objectiveId: 'goal-1',
        successSignal: '能说明判断依据并得出结论。',
        alignment: 'kp-specific',
      }],
    }))
    expect(payload).toMatchObject({
      followUp: FOLLOW_UP,
      evidenceBasis: 'self-assessed-after-feedback',
      scoreStatus: 'provisional',
    })
  })

  it('旧课只有一个总目标时保留降级来源后再写入', async () => {
    mocks.findMainlineCourse.mockResolvedValue({
      scenes: [{ id: 'scene-1', sceneType: 'practice', kpId: 'kp-1', contentSlots: PRACTICE_SNAPSHOT }],
      goals: [{ id: 'goal-total', successSignal: '能完成整课任务。' }],
    })
    mocks.recordPracticeAttempt.mockResolvedValue({
      score: 0.68,
      calibration: { kind: 'calibrated', delta: 0.18, label: '准确且有把握', message: '继续迁移。' },
      followUp: FOLLOW_UP,
      evidenceBasis: 'self-assessed-after-feedback',
      scoreStatus: 'provisional',
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(mocks.recordPracticeAttempt).toHaveBeenCalledWith(expect.objectContaining({
      objectiveCriteria: [{
        objectiveId: 'goal-total',
        successSignal: '能完成整课任务。',
        alignment: 'course-level-legacy',
      }],
    }))
  })
})
