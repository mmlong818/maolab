import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import type { FillLLMCall } from '../../generation/fill-scenes.js'
import { regenerateScene } from '../scene-regen.js'
import type { MainlineCourse } from '../../domain.js'

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  // conceptual 骨架:source-reading, visual-observation, concept-build, contrast, recap
  return compileLessonFromKps({
    kps: [{ id: 'kp-1', canonicalName: '消息文体特征' }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
}

const OK_CONTENT = {
  contentSlots: { statement: '消息文体有明确的结构层次', example: '标题概括事件，导语浓缩要素，主体补充细节' },
  visualFocus: '教学对象',
  narrationAnchor: '教学对象',
  boardText: ['板书 1', '板书 2'],
  teacherScript: '这是重新生成的讲解内容,包含足够字数满足 schema 的最小长度要求 80 字,内含 教学对象 锚点词,不再引发兜底逻辑补全。',
  studentAction: '学生跟读并复述',
  evidenceOnScreen: ['e1', 'e2'],
}

function makeMockLLM(fillOutput: unknown = OK_CONTENT, factClaims: unknown[] = []): FillLLMCall {
  return async ({ system }) => {
    if (system.includes('事实核查官')) return { claims: factClaims }
    return fillOutput
  }
}

describe('regenerateScene', () => {
  it('只重生成目标 scene 的内容字段,结构字段不变,editedByTeacher 清除', async () => {
    const course = makeCourse()
    const target = course.scenes[2]! // concept-build
    const before = { ...target }

    const result = await regenerateScene(course, target.id, { llm: makeMockLLM() })
    if ('error' in result) throw new Error('unexpected error')

    const regenerated = result.course.scenes.find(s => s.id === target.id)!
    expect(regenerated.teacherScript).toBe(OK_CONTENT.teacherScript)
    expect(regenerated.editedByTeacher).toBe(false)
    expect(regenerated.sceneType).toBe(before.sceneType)
    expect(regenerated.dialogueLayout).toBe(before.dialogueLayout)
    expect(regenerated.characterLayer).toEqual(before.characterLayer)
    // 其余 scene 原样不动
    course.scenes.filter(s => s.id !== target.id).forEach(original => {
      const untouched = result.course.scenes.find(s => s.id === original.id)!
      expect(untouched).toEqual(original)
    })
  })

  it('注入前面幕和紧邻后一幕的已有内容作为上下文(跨幕一致性对策)', async () => {
    const course = makeCourse()
    const target = course.scenes[2]! // 前面有 scenes[0],[1];后面有 scenes[3]
    const capturedUsers: string[] = []
    const spyLLM: FillLLMCall = async ({ system, user }) => {
      if (system.includes('事实核查官')) return { claims: [] }
      capturedUsers.push(user)
      return OK_CONTENT
    }
    await regenerateScene(course, target.id, { llm: spyLLM })
    expect(capturedUsers).toHaveLength(1)
    const user = capturedUsers[0]!
    expect(user).toContain('前面已生成的幕')
    expect(user).toContain('后面已经定稿的幕')
    // 紧邻后一幕(scenes[3], contrast)的板书内容应出现在上下文里
    const nextScene = course.scenes[3]!
    const nextFact = Object.entries(nextScene.contentSlots)[0]
    expect(user).toContain(nextFact![0])
  })

  it('本幕重生成命中 FATAL 事实核查:qualityStatus=blocked,不放行', async () => {
    const course = makeCourse()
    const target = course.scenes[2]! // concept-build,断言密集幕型全查
    const fatalClaim = { claim: '示例错误断言', verdict: 'fatal', evidence: '与教材不符', fix: '按教材改正' }

    const result = await regenerateScene(course, target.id, { llm: makeMockLLM(OK_CONTENT, [fatalClaim]) })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.qualityStatus).toBe('blocked')
    expect(result.course.factAudit?.fatalCount).toBe(1)
    expect(result.course.factAudit?.auditedSceneIds).toContain(target.id)
    expect(result.issues.some(i => i.severity === 'blocking' && i.message.includes('FATAL'))).toBe(true)
  })

  it('scene 不存在时返回 error', async () => {
    const course = makeCourse()
    const result = await regenerateScene(course, 'no-such-scene', { llm: makeMockLLM() })
    expect(result).toEqual({ error: 'scene not found: no-such-scene' })
  })
})
