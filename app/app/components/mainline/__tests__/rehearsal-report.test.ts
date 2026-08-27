import { describe, expect, it } from 'vitest'
import { repairTargetForWeakness } from '../../../lib/mainline/rehearsal/repair-target'
import { pickCastPreset } from '../../../lib/mainline/generation/cast-preset'
import { compileLessonFromKps } from '../../../lib/mainline/generation/compile-lesson'
import type { MainlineCourse } from '../../../lib/mainline/domain'
import type { RehearsalWeakness } from '../../../lib/mainline/rehearsal/types'
import { rehearsalMasteryEvidenceText } from '../rehearsal/mastery-evidence'

const MISCONCEPTIONS = [
  '海岸线形状相似就能单独证明大陆漂移',
  '板块运动速度快到可以直接用肉眼观察',
  '大陆漂移只发生在过去，现在已经停止',
] as const

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'geography' })
  return compileLessonFromKps({
    kps: [{
      id: 'kp-drift',
      canonicalName: '大陆漂移与板块运动',
      knowledgeType: 'conceptual',
      misconceptions: [...MISCONCEPTIONS],
    }],
    gradeBand: 'middle-school',
    subject: 'geography',
    preset,
  })
}

function weakness(text: string = MISCONCEPTIONS[2]): RehearsalWeakness {
  return {
    sceneId: 'scene-where-question-appeared',
    kind: 'unanswered-question',
    detail: '学生提出了课程尚未处理的教材误区。',
    evidence: { from: 'misconception', kpId: 'kp-drift', text },
  }
}

describe('repairTargetForWeakness', () => {
  it('旧课辨析页没有有效溯源时，优先让教师在该页重新确认误区', () => {
    const course = makeCourse()
    const contrast = course.scenes.find(scene => scene.sceneType === 'contrast')!
    const staleCourse: MainlineCourse = {
      ...course,
      scenes: course.scenes.map(scene => scene.id === contrast.id
        ? { ...scene, misconceptionSource: '旧教材里的失效误区', misconceptionSources: ['旧教材里的失效误区'] }
        : scene),
    }

    expect(repairTargetForWeakness(staleCourse, weakness(), {
      'kp-drift': MISCONCEPTIONS,
    })).toEqual({ sceneId: contrast.id, misconception: MISCONCEPTIONS[2] })
  })

  it('辨析页已有有效任务时，把新增误区送到可扩展的 AI 核查页', () => {
    const course = makeCourse()
    const verify = course.scenes.find(scene => scene.sceneType === 'ai-verify')!
    const newlyAdded = '教材后来补充的新误区'

    expect(repairTargetForWeakness(course, weakness(newlyAdded), {
      'kp-drift': [...MISCONCEPTIONS, newlyAdded],
    })).toEqual({ sceneId: verify.id, misconception: newlyAdded })
  })

  it('没有教材元数据或可承载页面时，不伪造可自动修正的入口', () => {
    const course = makeCourse()
    const original = weakness()
    expect(repairTargetForWeakness(course, original, {})).toEqual({ sceneId: original.sceneId })

    const withoutHandlers: MainlineCourse = {
      ...course,
      scenes: course.scenes.filter(scene => scene.sceneType !== 'contrast' && scene.sceneType !== 'ai-verify'),
    }
    expect(repairTargetForWeakness(withoutHandlers, original, {
      'kp-drift': MISCONCEPTIONS,
    })).toEqual({ sceneId: original.sceneId })
  })

  it('辨析页已处理另一条误区且没有 AI 核查页时，不用替换旧任务冒充修复', () => {
    const course = makeCourse()
    const withoutVerify: MainlineCourse = {
      ...course,
      scenes: course.scenes.filter(scene => scene.sceneType !== 'ai-verify'),
    }
    const original = weakness(MISCONCEPTIONS[2])

    expect(repairTargetForWeakness(withoutVerify, original, {
      'kp-drift': MISCONCEPTIONS,
    })).toEqual({ sceneId: original.sceneId })
  })
})

describe('排练掌握度证据文案', () => {
  it('四种来源不再统称为真实作答', () => {
    expect(rehearsalMasteryEvidenceText(0.4, 'verified')).toContain('已验证作答掌握度')
    expect(rehearsalMasteryEvidenceText(0.4, 'provisional-self-assessment')).toContain('暂定自评掌握度')
    expect(rehearsalMasteryEvidenceText(0.4, 'seeded-demo')).toContain('非真实作答')
    expect(rehearsalMasteryEvidenceText(0.4, 'legacy-unattributed')).toContain('来源未确认')
  })
})
