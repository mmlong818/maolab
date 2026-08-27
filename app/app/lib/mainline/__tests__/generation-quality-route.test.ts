import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findMainlineCourse: vi.fn(),
  saveMainlineCourse: vi.fn(),
  fillScenes: vi.fn(),
  factAuditCourse: vi.fn(),
  repairFactIssuesUntilStable: vi.fn(),
  auditMainlineCourse: vi.fn(),
  blockingQualityIssues: vi.fn(),
  regenerateScene: vi.fn(),
}))

vi.mock('../store.js', () => ({
  findMainlineCourse: mocks.findMainlineCourse,
  saveMainlineCourse: mocks.saveMainlineCourse,
}))

vi.mock('../readiness.js', () => ({
  auditCourseReleaseReadiness: () => ({ ready: false }),
}))

vi.mock('../generation/fill-scenes.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../generation/fill-scenes.js')>()
  return { ...actual, fillScenes: mocks.fillScenes }
})

vi.mock('../generation/fact-audit.js', () => ({
  factAuditCourse: mocks.factAuditCourse,
}))

vi.mock('../generation/fact-repair.js', () => ({
  repairFactIssuesUntilStable: mocks.repairFactIssuesUntilStable,
}))

vi.mock('../quality-gates.js', () => ({
  auditMainlineCourse: mocks.auditMainlineCourse,
  blockingQualityIssues: mocks.blockingQualityIssues,
}))

vi.mock('../edit/scene-regen.js', () => ({
  regenerateScene: mocks.regenerateScene,
}))

import { PracticeGenerationQualityError, SceneGenerationQualityError } from '../generation/fill-scenes.js'
import { POST as fillCourse } from '../../../api/v2/mainline/fill/[courseId]/route.js'
import { POST as regenerateCourseScene } from '../../../api/v2/mainline/scene/[courseId]/[sceneId]/regen/route.js'

const course = {
  id: 'course-quality-test',
  scenes: [
    { id: 'scene-opening', sceneType: 'source-reading' },
    { id: 'scene-practice', sceneType: 'practice' },
    { id: 'scene-visual', sceneType: 'visual-observation' },
  ],
}

const failure = () => new PracticeGenerationQualityError(
  'scene-practice',
  3,
  ['题面引用了未提供的作答材料，学生无法独立完成。'],
)

const genericFailure = () => new SceneGenerationQualityError(
  'scene-visual',
  'visual-observation',
  3,
  ['缺少专属页面核心槽 contentSlots.panelATitle'],
)

describe('生成质量失败接口', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findMainlineCourse.mockResolvedValue(course)
    mocks.auditMainlineCourse.mockReturnValue([])
    mocks.blockingQualityIssues.mockReturnValue([])
  })

  it('待复核教师编辑页会保持阻断,接口计数与保存状态一致', async () => {
    const pendingCourse = {
      ...course,
      qualityStatus: 'blocked',
      scenes: course.scenes.map(scene => scene.id === 'scene-practice'
        ? { ...scene, editedByTeacher: true }
        : scene),
      factAudit: { pendingSceneIds: ['scene-practice'] },
    }
    const fact = {
      auditedSceneIds: [],
      requiredSceneIds: [],
      unverifiedSceneIds: [],
      consistencyAuditedSceneIds: [],
      consistencyConflictCount: 0,
      auditedSceneCount: 0,
      fatalCount: 0,
      issues: [],
    }
    mocks.findMainlineCourse.mockResolvedValue(pendingCourse)
    mocks.fillScenes.mockResolvedValue({ course: pendingCourse, failedScenes: [] })
    mocks.factAuditCourse.mockResolvedValue(fact)
    mocks.repairFactIssuesUntilStable.mockResolvedValue({
      course: pendingCourse,
      fact,
      trace: { maxAttempts: 2, attempts: [], stoppedReason: 'no-repairable-issues' },
    })

    const response = await fillCourse(
      new NextRequest('http://localhost/api/v2/mainline/fill/course-quality-test', { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )
    const body = await response.json()
    const saved = mocks.saveMainlineCourse.mock.calls[0]?.[0]

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ qualityStatus: 'blocked', blockingCount: 1 })
    expect(body.factAudit).toMatchObject({ pendingScenes: 1 })
    expect(saved).toMatchObject({
      qualityStatus: 'blocked',
      factAudit: { pendingSceneIds: ['scene-practice'] },
    })
  })

  it('整课生成返回可重试的 422，并且不保存半成品', async () => {
    mocks.fillScenes.mockRejectedValue(failure())

    const response = await fillCourse(
      new NextRequest('http://localhost/api/v2/mainline/fill/course-quality-test', { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      code: 'PRACTICE_QUALITY_RETRY_EXHAUSTED',
      retryable: true,
      sceneId: 'scene-practice',
      sceneNo: 2,
    })
    expect(body.error).toContain('第 2 页')
    expect(body.error).toContain('本次未保存')
    expect(body.reasons).toEqual(['题面引用了未提供的作答材料，学生无法独立完成。'])
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('单页重生成返回可重试的 422，并且不覆盖原课程', async () => {
    mocks.regenerateScene.mockRejectedValue(failure())

    const response = await regenerateCourseScene(
      new NextRequest('http://localhost/api/v2/mainline/scene/course-quality-test/scene-practice/regen', { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id, sceneId: 'scene-practice' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      code: 'PRACTICE_QUALITY_RETRY_EXHAUSTED',
      retryable: true,
      sceneId: 'scene-practice',
      sceneNo: 2,
    })
    expect(body.error).toContain('请直接重试本页生成')
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('整课生成的通用页面槽位失败也返回 422，并且不保存半成品', async () => {
    mocks.fillScenes.mockRejectedValue(genericFailure())

    const response = await fillCourse(
      new NextRequest('http://localhost/api/v2/mainline/fill/course-quality-test', { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id }) },
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      code: 'SCENE_CONTENT_QUALITY_RETRY_EXHAUSTED',
      retryable: true,
      sceneId: 'scene-visual',
      sceneNo: 3,
    })
    expect(body.error).toContain('第 3 页页面内容')
    expect(body.error).toContain('本次未保存')
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })

  it('单页通用页面槽位失败也不会覆盖原课程', async () => {
    mocks.regenerateScene.mockRejectedValue(genericFailure())

    const response = await regenerateCourseScene(
      new NextRequest('http://localhost/api/v2/mainline/scene/course-quality-test/scene-visual/regen', { method: 'POST' }),
      { params: Promise.resolve({ courseId: course.id, sceneId: 'scene-visual' }) },
    )
    const body = await response.json()

    expect(response.status).toBe(422)
    expect(body).toMatchObject({
      code: 'SCENE_CONTENT_QUALITY_RETRY_EXHAUSTED',
      retryable: true,
      sceneId: 'scene-visual',
      sceneNo: 3,
    })
    expect(body.error).toContain('请直接重试本页生成')
    expect(mocks.saveMainlineCourse).not.toHaveBeenCalled()
  })
})
