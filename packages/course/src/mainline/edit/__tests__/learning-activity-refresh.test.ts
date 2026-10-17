import { describe, expect, it } from 'vitest'
import type { LessonScene, MainlineCourse } from '../../domain.js'
import { studentActionLeavesEvidence, workedExampleActionHasSelfExplanation } from '../../learning-action.js'
import { GOLDEN_MAINLINE_COURSES } from '../../samples.js'
import {
  learningActivityRepairPlan,
  refreshCourseLearningActivities,
} from '../learning-activity-refresh.js'

function legacyCourse(): MainlineCourse {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
  const visual = course.scenes.find(scene => scene.sceneType === 'visual-observation')!
  const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
  const worked: LessonScene = {
    ...structuredClone(visual),
    id: 'legacy-worked-example',
    sceneType: 'worked-example',
    contentSlots: { problem: '完整题面', steps: '第一步；第二步' },
    teacherScript: '请跟着屏幕步骤完成这道例题，再核对最后答案是否一致。',
    studentAction: '跟随步骤抄写完整过程',
  }
  source.contentSlots = { leakedConclusion: '这是不应在预测前展示的完整结论。' }
  source.teacherScript = '先阅读完整讲解，再进入后续页面。'
  source.studentAction = '阅读屏幕上的学习目标'
  visual.studentAction = '沿路径观察画面变化'
  recap.studentAction = '沿路径逐字复述并背诵屏幕结论'
  return { ...course, qualityStatus: 'passed', scenes: [...course.scenes, worked] }
}

describe('refreshCourseLearningActivities · 存量学习活动深化', () => {
  it('一次消除开场、例题、收束和纯观看动作的四类存量问题', () => {
    const course = legacyCourse()
    expect(learningActivityRepairPlan(course).sceneIds).toHaveLength(4)

    const result = refreshCourseLearningActivities(course)
    const source = result.course.scenes.find(scene => scene.sceneType === 'source-reading')!
    const worked = result.course.scenes.find(scene => scene.id === 'legacy-worked-example')!
    const visual = result.course.scenes.find(scene => scene.sceneType === 'visual-observation')!
    const recap = result.course.scenes.find(scene => scene.sceneType === 'recap')!

    expect(result.refreshedSceneIds).toHaveLength(4)
    expect(learningActivityRepairPlan(result.course).total).toBe(0)
    expect(source.contentSlots).toEqual({
      topic: course.topic,
      learningPath: expect.any(String),
      openingQuestion: expect.any(String),
    })
    expect(source.contentSlots).not.toHaveProperty('leakedConclusion')
    expect(source.studentAction).toMatch(/预测|提取|限时/)
    expect(source.teacherScript).toMatch(/证据|核对|纠错/)
    expect(workedExampleActionHasSelfExplanation(worked.studentAction)).toBe(true)
    expect(studentActionLeavesEvidence(visual.studentAction)).toBe(true)
    expect(recap.studentAction).toMatch(/解释|新例子|迁移|修正/)
  })

  it.each([
    ['review', /闭卷|不看资料|回忆|提取/, /核对|纠错/],
    ['exam-prep', /限时|诊断/, /核查|错因|边界/],
  ] as const)('同步深化 %s 课程的先作答后反馈开场', (phase, actionPattern, scriptPattern) => {
    const course = legacyCourse()
    course.lessonPhase = phase
    const source = course.scenes.find(scene => scene.sceneType === 'source-reading')!
    source.studentAction = '先听老师完整讲解'
    source.teacherScript = '请先看完整答案，再做一次复习。'

    expect(learningActivityRepairPlan(course).sceneIds).toContain(source.id)
    const refreshed = refreshCourseLearningActivities(course).course.scenes.find(scene => scene.id === source.id)!
    expect(refreshed.studentAction).toMatch(actionPattern)
    expect(refreshed.teacherScript).toMatch(scriptPattern)
  })

  it('只改学习活动字段，保留板书、图片、角色、声线、结构与事实核查', () => {
    const course = legacyCourse()
    const protectedCourse = {
      goals: course.goals,
      learningFragments: course.learningFragments,
      beats: course.beats,
      castProfiles: course.castProfiles,
      selectedTeacher: course.selectedTeacher,
      peerRoleProfile: course.peerRoleProfile,
      factAudit: course.factAudit,
      scenes: course.scenes.map(scene => ({
        id: scene.id,
        boardText: scene.boardText,
        imageUrl: scene.imageUrl,
        characterLayer: scene.characterLayer,
        voiceCue: scene.voiceCue,
        sceneType: scene.sceneType,
        kpId: scene.kpId,
      })),
    }

    const result = refreshCourseLearningActivities(course)

    expect({
      goals: result.course.goals,
      learningFragments: result.course.learningFragments,
      beats: result.course.beats,
      castProfiles: result.course.castProfiles,
      selectedTeacher: result.course.selectedTeacher,
      peerRoleProfile: result.course.peerRoleProfile,
      factAudit: result.course.factAudit,
      scenes: result.course.scenes.map(scene => ({
        id: scene.id,
        boardText: scene.boardText,
        imageUrl: scene.imageUrl,
        characterLayer: scene.characterLayer,
        voiceCue: scene.voiceCue,
        sceneType: scene.sceneType,
        kpId: scene.kpId,
      })),
    }).toEqual(protectedCourse)
  })

  it('教师手改页不进入自动迁移，其他安全页面仍可处理', () => {
    const course = legacyCourse()
    const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
    recap.editedByTeacher = true
    const originalAction = recap.studentAction
    const plan = learningActivityRepairPlan(course)

    expect(plan.teacherEditedSceneIds).toEqual([recap.id])
    expect(plan.sceneIds).not.toContain(recap.id)
    const result = refreshCourseLearningActivities(course)
    expect(result.course.scenes.find(scene => scene.id === recap.id)?.studentAction).toBe(originalAction)
  })

  it('没有目标问题时保持课程对象不变', () => {
    const course = legacyCourse()
    const repaired = refreshCourseLearningActivities(course).course
    const second = refreshCourseLearningActivities(repaired)

    expect(second.refreshedSceneIds).toEqual([])
    expect(second.course).toBe(repaired)
  })
})
