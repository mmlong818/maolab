import { describe, expect, it } from 'vitest'
import { pickCastPreset } from '../generation/cast-preset.js'
import { compileLessonFromKps } from '../generation/compile-lesson.js'
import type { MainlineCourse } from '../domain.js'
import { auditPresentationAntipatterns, TYPED_SLOT_KEYS } from '../presentation-antipatterns.js'
import { MASTER_TRAITS, pickMasterRouted } from '../presentation/master-routing.js'

/**
 * 呈现反模式目录测试。
 * 这份目录查的是「内容正确但呈现被浪费」——闸门全绿也可能发生,
 * 所以每条规则都必须证明它抓得到自己声称抓的东西,且不误伤正常课。
 */

function baseCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
  return compileLessonFromKps({
    kps: [{ id: 'kp-1', canonicalName: '二力平衡', knowledgeType: 'conceptual' }],
    gradeBand: 'middle-school',
    subject: 'physics',
    preset,
  })
}

function multiKpCourse(): MainlineCourse {
  const { preset } = pickCastPreset({ gradeBand: 'middle-school', subject: 'physics' })
  return compileLessonFromKps({
    kps: [
      { id: 'kp-1', canonicalName: '二力平衡', knowledgeType: 'conceptual' },
      { id: 'kp-2', canonicalName: '合力', knowledgeType: 'conceptual' },
    ],
    gradeBand: 'middle-school',
    subject: 'physics',
    preset,
  })
}

/** 取一幕并覆盖若干字段,便于构造场景。 */
function withScene(course: MainlineCourse, patch: Partial<MainlineCourse['scenes'][number]>): MainlineCourse {
  const scenes = [...course.scenes]
  scenes[0] = { ...scenes[0]!, ...patch }
  return { ...course, scenes }
}

describe('R1 · 近似槽键(专属渲染器静默失效)', () => {
  it.each([
    ['forceVector', 'forceVectors'],
    ['ForceVectors', 'forceVectors'],
    ['timelineEvent', 'timelineEvents'],
    ['opticScene', 'opticsScene'],
  ])('%s 被判为疑似 %s 的笔误', (typo, expected) => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, [typo]: 'mg|重力|50|N|270|gravity' } })
    const findings = auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'near-miss-slot-key')

    expect(findings.length).toBe(1)
    expect(findings[0]!.message).toContain(expected)
    expect(findings[0]!.severity).toBe('high')
  })

  it('正确的槽键不报', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, forceVectors: 'mg|重力|50|N|270|gravity' } })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'near-miss-slot-key')).toEqual([])
  })

  it('与专属槽键毫不相干的自定义槽不报(避免噪音)', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, takeaway: '本课结论' } })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'near-miss-slot-key')).toEqual([])
  })

  it('空值的近似键不报(没内容就没有被浪费的呈现)', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, forceVector: '   ' } })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'near-miss-slot-key')).toEqual([])
  })
})

describe('R2 · 专属槽存在但解析为空', () => {
  it('opticsScene 只有注释和空行 → 报「解析不出有效数据」', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, opticsScene: '# 待补\n\n  \n' } })
    const findings = auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'typed-slot-parses-empty')

    expect(findings.length).toBe(1)
    expect(findings[0]!.message).toContain('opticsScene')
    expect(findings[0]!.consequence).toContain('落空')
  })

  it('forceVectors 内容缺分隔符 → 报', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, forceVectors: '重力向下\n支持力向上' } })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'typed-slot-parses-empty').length).toBe(1)
  })

  it('内容合法时不报', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, forceVectors: 'mg|重力|50|N|270|gravity' } })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'typed-slot-parses-empty')).toEqual([])
  })

  it('槽不存在时不报(没写不等于写坏)', () => {
    expect(auditPresentationAntipatterns(baseCourse()).filter(f => f.ruleId === 'typed-slot-parses-empty')).toEqual([])
  })
})

describe('R3 · 同一句话由多个层级重复承担(视觉所有者)', () => {
  it('标题与板书出现同一句长文本 → 报', () => {
    const course = baseCourse()
    const line = '物体受到的合力为零时保持静止或匀速直线运动'
    const patched = withScene(course, { visualFocus: line, boardText: [line, '其它要点'] })
    const findings = auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'layer-duplication')

    expect(findings.length).toBe(1)
    expect(findings[0]!.severity).toBe('medium')
  })

  it('标点与空格差异不影响判定(规范化后比较)', () => {
    const course = baseCourse()
    const patched = withScene(course, {
      visualFocus: '合力为零时物体保持静止或匀速直线运动',
      boardText: ['「合力为零时，物体保持静止或匀速直线运动。」'],
    })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'layer-duplication').length).toBe(1)
  })

  it('短标题不报(短语复用是正常的,不是重复承担)', () => {
    const course = baseCourse()
    const patched = withScene(course, { visualFocus: '二力平衡', boardText: ['二力平衡的四个条件'] })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'layer-duplication')).toEqual([])
  })

  it('标题与板书各说各的 → 不报', () => {
    const course = baseCourse()
    const patched = withScene(course, {
      visualFocus: '二力平衡需要满足哪四个条件',
      boardText: ['同物体、同直线、大小相等、方向相反'],
    })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'layer-duplication')).toEqual([])
  })
})

describe('R4 · 单知识点开场标题重复', () => {
  it('大标题与唯一知识点标题逐字相同 → 报', () => {
    const course = baseCourse()
    const source = course.scenes[0]!
    const title = course.sourceMaterial[0]!.title
    const patched = withScene(course, { visualFocus: title })
    const findings = auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'intro-title-duplication')

    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({ sceneType: 'source-reading', sceneNumber: 1, severity: 'medium' })
  })

  it('大标题与知识点目录提供不同信息时不报', () => {
    const course = baseCourse()
    const patched = withScene(course, { visualFocus: '先预测：怎样判断物体是否平衡' })
    expect(auditPresentationAntipatterns(patched).filter(f => f.ruleId === 'intro-title-duplication')).toEqual([])
  })
})

describe('R5 · 单知识点开场命中低密度母版', () => {
  it('路由到 airy 母版时给出空间利用提醒', () => {
    const original = baseCourse()
    const source = original.scenes[0]!
    let course: MainlineCourse | undefined
    for (let i = 0; i < 100; i++) {
      const candidate: MainlineCourse = {
        ...original,
        id: `sparse-intro-${i}`,
        scenes: original.scenes.map((scene, sceneIndex) => ({ ...scene, id: `sparse-intro-${i}-scene-${sceneIndex}` })),
      }
      const index = pickMasterRouted(candidate, candidate.scenes[0]!, 'source-reading')
      if (MASTER_TRAITS['source-reading'][index]?.density === 'airy') {
        course = candidate
        break
      }
    }

    expect(course).toBeDefined()
    expect(auditPresentationAntipatterns(course!).filter(f => f.ruleId === 'sparse-intro-master')).toHaveLength(1)
    expect(source.sceneType).toBe('source-reading')
  })

  it('多知识点开场不按此规则报空间空置', () => {
    expect(auditPresentationAntipatterns(multiKpCourse()).filter(f => f.ruleId === 'sparse-intro-master')).toEqual([])
  })
})

describe('目录整体', () => {
  it('正常课不产出任何反模式(避免整份清单因噪音失信)', () => {
    expect(auditPresentationAntipatterns(multiKpCourse())).toEqual([])
  })

  it('按严重度排序:high 在前', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const line = '物体受到的合力为零时保持静止或匀速直线运动'
    const patched = withScene(course, {
      visualFocus: line,
      boardText: [line],
      contentSlots: { ...scene.contentSlots, forceVector: 'mg|重力|50|N|270|gravity' },
    })
    const findings = auditPresentationAntipatterns(patched)
    expect(findings.length).toBeGreaterThan(1)
    expect(findings[0]!.severity).toBe('high')
  })

  it('每条 finding 都带后果与建议(不写后果的诊断没有行动力)', () => {
    const course = baseCourse()
    const scene = course.scenes[0]!
    const patched = withScene(course, { contentSlots: { ...scene.contentSlots, forceVector: 'mg|重力|50|N|270|gravity' } })
    for (const f of auditPresentationAntipatterns(patched)) {
      expect(f.consequence.length).toBeGreaterThan(0)
      expect(f.suggestion.length).toBeGreaterThan(0)
      expect(f.sceneId.length).toBeGreaterThan(0)
      expect(f.evidence.length).toBeGreaterThan(0)
      expect(f.evidence[0]!.reportPath).toMatch(/^docs\/real-check\/.+\.md$/)
      expect(f.evidence[0]!.caseSummary.length).toBeGreaterThan(0)
    }
  })

  it('TYPED_SLOT_KEYS 无重复项(与派发器同步时容易粘贴重复)', () => {
    expect(new Set(TYPED_SLOT_KEYS).size).toBe(TYPED_SLOT_KEYS.length)
  })
})
