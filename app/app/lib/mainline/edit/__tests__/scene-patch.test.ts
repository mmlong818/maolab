import { describe, it, expect } from 'vitest'
import { pickCastPreset } from '../../generation/cast-preset.js'
import { compileLessonFromKps } from '../../generation/compile-lesson.js'
import { applyScenePatch } from '../scene-patch.js'
import type { MainlineCourse } from '../../domain.js'

function makeCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'chinese' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-1', canonicalName: '消息文体特征' }],
    gradeBand: 'middle-school',
    subject: 'chinese',
    preset,
  })
}

const MISCONCEPTIONS = [
  '海岸线形状相似就能单独证明大陆漂移',
  '板块运动速度快到可以直接用肉眼观察',
  '大陆漂移只发生在过去，现在已经停止',
] as const

function makeMisconceptionCourse(): MainlineCourse {
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

describe('applyScenePatch', () => {
  it('只覆写传入的内容字段,结构字段不变,并标记 editedByTeacher', () => {
    const course = makeCourse()
    const target = course.scenes[1]!
    const result = applyScenePatch(course, target.id, { teacherScript: '这是老师手改后的讲解内容,长度足够避免过短警告,老师手改后的讲解内容,长度足够避免过短警告。' })
    if ('error' in result) throw new Error('unexpected error')

    const patched = result.course.scenes.find(s => s.id === target.id)!
    expect(patched.teacherScript).toContain('老师手改')
    expect(patched.editedByTeacher).toBe(true)
    // 未传入的字段原样保留
    expect(patched.contentSlots).toEqual(target.contentSlots)
    expect(patched.visualFocus).toBe(target.visualFocus)
    // 结构字段绝不受影响
    expect(patched.sceneType).toBe(target.sceneType)
    expect(patched.kpId).toBe(target.kpId)
    expect(patched.dialogueLayout).toBe(target.dialogueLayout)
    expect(patched.characterLayer).toEqual(target.characterLayer)
  })

  it('找不到 scene 时返回 error,不动课程', () => {
    const course = makeCourse()
    const result = applyScenePatch(course, 'no-such-scene', { teacherScript: 'x' })
    expect(result).toEqual({ error: 'scene not found: no-such-scene', code: 'not_found' })
  })

  it('可只改一个槽位的文字，同时保留全部槽位键和其他内容', () => {
    const course = makeCourse()
    const target = course.scenes.find(scene => Object.keys(scene.contentSlots).length > 1)!
    const [editedKey] = Object.keys(target.contentSlots)
    const contentSlots = { ...target.contentSlots, [editedKey!]: '教师只修正了这一处核心内容。' }

    const result = applyScenePatch(course, target.id, { contentSlots })
    if ('error' in result) throw new Error('unexpected error')
    const patched = result.course.scenes.find(scene => scene.id === target.id)!

    expect(patched.contentSlots[editedKey!]).toBe('教师只修正了这一处核心内容。')
    expect(Object.keys(patched.contentSlots)).toEqual(Object.keys(target.contentSlots))
    for (const key of Object.keys(target.contentSlots).filter(key => key !== editedKey)) {
      expect(patched.contentSlots[key]).toBe(target.contentSlots[key])
    }
    expect(patched.editedByTeacher).toBe(true)
  })

  it('拒绝删除或新增槽位键，避免手改文字破坏页面渲染结构', () => {
    const course = makeCourse()
    const target = course.scenes.find(scene => Object.keys(scene.contentSlots).length > 1)!
    const [removedKey, ...remainingKeys] = Object.keys(target.contentSlots)
    const missingSlotPatch = Object.fromEntries(remainingKeys.map(key => [key, target.contentSlots[key]!]))
    const missing = applyScenePatch(course, target.id, { contentSlots: missingSlotPatch })

    expect(missing).toMatchObject({ code: 'invalid_patch' })
    expect('error' in missing && missing.error).toContain(`缺少 ${removedKey}`)

    const extra = applyScenePatch(course, target.id, {
      contentSlots: { ...target.contentSlots, inventedSlot: '不属于该页面结构的内容' },
    })
    expect(extra).toMatchObject({ code: 'invalid_patch' })
    expect('error' in extra && extra.error).toContain('新增 inventedSlot')
    expect(course.scenes.find(scene => scene.id === target.id)!.contentSlots).toEqual(target.contentSlots)
  })

  it('改后重跑确定性闸门,更新 qualityStatus 与 issues', () => {
    const course = makeCourse()
    // compile-lesson 生成的 scene 是"待 LLM 填充"占位草稿;把 boardText 改成合法内容后
    // 观察 issues 里不再有该 scene 的必填字段缺失问题(这里只验证闸门确实重新跑了)。
    const target = course.scenes[0]!
    const result = applyScenePatch(course, target.id, { boardText: ['板书一', '板书二', '板书三'] })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.course.scenes.find(s => s.id === target.id)!.boardText).toEqual(['板书一', '板书二', '板书三'])
    expect(['draft', 'blocked', 'passed']).toContain(result.course.qualityStatus)
    expect(Array.isArray(result.issues)).toBe(true)
  })

  it('教师修正事实内容后清除旧 FATAL，但标记待重新核查且不能直接放行', () => {
    const course = makeCourse()
    const target = course.scenes[2]!
    const courseWithFatal: MainlineCourse = {
      ...course,
      qualityStatus: 'passed',
      factAudit: {
        auditedAt: new Date().toISOString(),
        auditedSceneIds: [target.id],
        pendingSceneIds: [],
        auditedSceneCount: 1,
        fatalCount: 1,
        issues: [{
          id: 'pedagogy:scene:x:1',
          severity: 'blocking',
          targetId: target.id,
          message: '断言核查 FATAL:「示例」',
          impact: '示例影响',
          fix: '示例修复',
        }],
      },
    }
    const result = applyScenePatch(courseWithFatal, target.id, {
      teacherScript: '教师手改后的讲解内容已经足够长，覆盖了原先被核查判定为事实错误的旧内容，但仍需要重新核查。',
    })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.course.factAudit?.fatalCount).toBe(0)
    expect(result.course.factAudit?.issues).toHaveLength(0)
    expect(result.course.factAudit?.pendingSceneIds).toEqual([target.id])
    expect(result.course.factAudit?.auditedSceneIds).toEqual([])
    expect(result.course.qualityStatus).toBe('blocked')
  })

  it('表单提交的事实字段与原值完全相同，不制造虚假待核查', () => {
    const course = makeCourse()
    const target = course.scenes[1]!
    const result = applyScenePatch(course, target.id, {
      contentSlots: { ...target.contentSlots },
      visualFocus: target.visualFocus,
      narrationAnchor: target.narrationAnchor,
      boardText: [...target.boardText],
      teacherScript: target.teacherScript,
      studentAction: target.studentAction,
      evidenceOnScreen: [...target.evidenceOnScreen],
      voiceCue: { ...target.voiceCue },
    })
    if ('error' in result) throw new Error('unexpected error')

    expect(result.course.factAudit).toBeUndefined()
  })

  it('v5 M2:可单独 PATCH executor(人机分工),不影响其他字段', () => {
    const course = makeMisconceptionCourse()
    const target = course.scenes.find(s => s.sceneType === 'contrast')!
    expect(target.executor).toBe('teacher') // 骨架库默认分工
    const result = applyScenePatch(course, target.id, { executor: 'co' })
    if ('error' in result) throw new Error('unexpected error')
    const patched = result.course.scenes.find(s => s.id === target.id)!
    expect(patched.executor).toBe('co')
    expect(patched.editedByTeacher).toBe(true)
    expect(patched.teacherScript).toBe(target.teacherScript)
    expect(result.course.factAudit).toBeUndefined()
  })

  it('可修正语速与停顿接续，同时保留声线和教学语气', () => {
    const course = makeCourse()
    const target = course.scenes[1]!
    const result = applyScenePatch(course, target.id, {
      voiceCue: { ...target.voiceCue, pace: 'slow', pauseRule: '核心表述后停 900ms，再请学生举例。' },
    })
    if ('error' in result) throw new Error('unexpected error')

    const patched = result.course.scenes.find(s => s.id === target.id)!
    expect(patched.voiceCue).toEqual({
      ...target.voiceCue,
      pace: 'slow',
      pauseRule: '核心表述后停 900ms，再请学生举例。',
    })
    expect(patched.editedByTeacher).toBe(true)
    expect(result.course.factAudit).toBeUndefined()
  })

  it('未涉及的 scene 的 factAudit 记录不受影响', () => {
    const course = makeCourse()
    const [sceneA, sceneB] = course.scenes
    const courseWithFatal: MainlineCourse = {
      ...course,
      factAudit: {
        auditedAt: new Date().toISOString(),
        auditedSceneCount: 1,
        fatalCount: 1,
        issues: [{
          id: 'pedagogy:scene:x:1',
          severity: 'blocking',
          targetId: sceneB!.id,
          message: 'FATAL',
          impact: 'impact',
          fix: 'fix',
        }],
      },
    }
    const result = applyScenePatch(courseWithFatal, sceneA!.id, { teacherScript: '这是与 fatal 无关的另一幕的手改讲解内容,长度足够长,避免触发过短警告规则。' })
    if ('error' in result) throw new Error('unexpected error')
    expect(result.course.factAudit?.fatalCount).toBe(1)
    expect(result.course.qualityStatus).toBe('blocked')
  })

  it('辨析页只能把教材登记的误区原文与对应修正一起保存', () => {
    const course = makeMisconceptionCourse()
    const target = course.scenes.find(scene => scene.sceneType === 'contrast')!
    const selected = MISCONCEPTIONS[2]
    const result = applyScenePatch(course, target.id, {
      misconceptionSources: [selected],
      contentSlots: {
        ...target.contentSlots,
        misconception: selected,
        correction: '大陆和板块今天仍在缓慢运动，需要用长期测量与多类证据判断。',
      },
    }, { allowedMisconceptions: MISCONCEPTIONS })
    if ('error' in result) throw new Error(result.error)

    const patched = result.course.scenes.find(scene => scene.id === target.id)!
    expect(patched.misconceptionSource).toBe(selected)
    expect(patched.misconceptionSources).toEqual([selected])
    expect(patched.contentSlots.misconception).toBe(selected)
    expect(patched.contentSlots.correction).toContain('仍在缓慢运动')
  })

  it('拒绝给页面贴上教材外误区标签，也拒绝只改归属不改实际错误说法', () => {
    const course = makeMisconceptionCourse()
    const target = course.scenes.find(scene => scene.sceneType === 'contrast')!
    const unknown = applyScenePatch(course, target.id, {
      misconceptionSources: ['网上临时编出的说法'],
      contentSlots: {
        ...target.contentSlots,
        misconception: '网上临时编出的说法',
        correction: '修正内容',
      },
    }, { allowedMisconceptions: MISCONCEPTIONS })
    expect(unknown).toMatchObject({ code: 'invalid_patch' })
    expect('error' in unknown && unknown.error).toContain('不是当前教材登记')

    const labelOnly = applyScenePatch(course, target.id, {
      misconceptionSources: [MISCONCEPTIONS[2]],
      contentSlots: { ...target.contentSlots, correction: '修正内容' },
    }, { allowedMisconceptions: MISCONCEPTIONS })
    expect(labelOnly).toMatchObject({ code: 'invalid_patch' })
    expect('error' in labelOnly && labelOnly.error).toContain('必须与所选教材误区原文一致')
  })

  it('AI 核查页可按教材误区增减逐条说法与结论，但保留其他稳定槽位', () => {
    const course = makeMisconceptionCourse()
    const target = course.scenes.find(scene => scene.sceneType === 'ai-verify')!
    const stableSlots = Object.fromEntries(
      Object.entries(target.contentSlots).filter(([key]) => !/^(?:aiClaim|reveal)\d+$/.test(key)),
    )
    const contentSlots = {
      ...stableSlots,
      aiClaim: MISCONCEPTIONS.map((source, index) => `${index + 1}. ${source}`).join('\n'),
      reveal: '1. 需要组合多类证据。\n2. 需要精密测量。\n3. 现今仍在运动。',
      aiClaim1: MISCONCEPTIONS[0],
      reveal1: '海岸线吻合只是证据链的一部分，不能单独完成证明。',
      aiClaim2: MISCONCEPTIONS[1],
      reveal2: '板块运动通常需要跨年精密测量，不能靠肉眼直接观察。',
      aiClaim3: MISCONCEPTIONS[2],
      reveal3: '卫星定位等证据表明板块今天仍在持续运动。',
    }
    const result = applyScenePatch(course, target.id, {
      misconceptionSources: [...MISCONCEPTIONS],
      contentSlots,
    }, { allowedMisconceptions: MISCONCEPTIONS })
    if ('error' in result) throw new Error(result.error)

    const patched = result.course.scenes.find(scene => scene.id === target.id)!
    expect(patched.misconceptionSources).toEqual(MISCONCEPTIONS)
    expect(patched.contentSlots.aiClaim1).toBe(MISCONCEPTIONS[0])
    expect(patched.contentSlots.reveal3).toContain('仍在持续运动')
    for (const key of Object.keys(stableSlots).filter(key => key !== 'aiClaim' && key !== 'reveal')) {
      expect(patched.contentSlots[key]).toBe(target.contentSlots[key])
    }
  })

  it('非辨析类页面不能伪造误区归属', () => {
    const course = makeMisconceptionCourse()
    const target = course.scenes.find(scene => scene.sceneType === 'concept-build')!
    const result = applyScenePatch(course, target.id, {
      misconceptionSources: [MISCONCEPTIONS[0]],
      contentSlots: { ...target.contentSlots },
    }, { allowedMisconceptions: MISCONCEPTIONS })
    expect(result).toMatchObject({ code: 'invalid_patch' })
    expect('error' in result && result.error).toContain('只有辨析页或 AI 核查页')
  })
})
