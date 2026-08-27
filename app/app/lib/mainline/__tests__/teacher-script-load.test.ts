import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../generation/cast-preset.js'
import { compileLessonFromKps } from '../generation/compile-lesson.js'
import {
  estimateTeacherScriptSeconds,
  resolveSceneDuration,
  teacherScriptLoadFor,
  teacherScriptPromptBudget,
} from '../teacher-script-load.js'

function makeCourse() {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'math' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-load', canonicalName: '一次函数', knowledgeType: 'conceptual' }],
    gradeBand: 'middle-school',
    subject: 'math',
    preset,
  })
}

describe('teacher script load', () => {
  it('按口语化后的中文、英文、数字和停顿估算，而不是按源码字符数', () => {
    expect(estimateTeacherScriptSeconds('讲'.repeat(160))).toBeCloseTo(40, 5)

    const formulaSource = String.raw`观察 \(\frac{12}{3}=4\)，再说出理由。`
    expect(formulaSource.length).toBeGreaterThan(20)
    expect(estimateTeacherScriptSeconds(formulaSource)).toBeLessThan(10)
  })

  it('逐幕语速只改变预计耗时，不改变讲稿文本', () => {
    const script = '讲'.repeat(160)
    expect(estimateTeacherScriptSeconds(script, 'slow')).toBeGreaterThan(40)
    expect(estimateTeacherScriptSeconds(script, 'fast')).toBeLessThan(40)
  })

  it('新课按逐幕时长保留 20% 学生活动时间', () => {
    const course = makeCourse()
    const scene = course.scenes.find(candidate => candidate.sceneType === 'visual-observation')!
    expect(scene.durationTargetSec).toBe(35)

    expect(teacherScriptLoadFor(course, scene, '讲'.repeat(112))).toMatchObject({
      sceneDurationSec: 35,
      speechBudgetSec: 28,
      reservedStudentSec: 7,
      durationSource: 'scene',
      overBudget: false,
    })
    expect(teacherScriptLoadFor(course, scene, '讲'.repeat(113)).overBudget).toBe(true)
    expect(teacherScriptPromptBudget(course, scene)).toMatchObject({
      estimatedSpeechBudgetSec: 28,
      suggestedMinCharacters: 60,
      suggestedMaxCharacters: 100,
    })
  })

  it('存量课缺逐页时长时沿用片段均摊，只拦讲稿超过整页的确定问题', () => {
    const course = makeCourse()
    const scene = course.scenes.find(candidate => candidate.sceneType === 'concept-build')!
    const fragment = course.learningFragments.find(item => item.sceneIds.includes(scene.id))!
    for (const id of fragment.sceneIds) {
      delete course.scenes.find(candidate => candidate.id === id)!.durationTargetSec
    }

    const duration = resolveSceneDuration(course, scene)
    expect(duration.source).toBe('fragment-estimate')
    expect(duration.seconds).toBeGreaterThan(0)
    scene.voiceCue = { ...scene.voiceCue, pace: 'medium' }
    expect(teacherScriptLoadFor(course, scene, '讲'.repeat(Math.max(1, Math.floor(duration.seconds * 4) - 1))).overBudget).toBe(false)
    expect(teacherScriptLoadFor(course, scene, '讲'.repeat(Math.ceil(duration.seconds * 4) + 1)).overBudget).toBe(true)
  })
})
