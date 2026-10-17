import { describe, it, expect } from 'vitest'
import {
  DEFAULT_KP_KNOWLEDGE_TYPE,
  FRAGMENT_SKELETONS,
  fragmentSkeletonFor,
  planSkeleton,
} from '../skeleton-library.js'

describe('skeleton-library', () => {
  it('四种认知类型都有片段骨架,且每片段 1-5 幕(设计 §6.3)', () => {
    for (const skeleton of Object.values(FRAGMENT_SKELETONS)) {
      expect(skeleton.steps.length).toBeGreaterThanOrEqual(1)
      expect(skeleton.steps.length).toBeLessThanOrEqual(5)
      expect(skeleton.durationTargetSec).toBeGreaterThanOrEqual(45)
      expect(skeleton.durationTargetSec).toBeLessThanOrEqual(180)
      expect(skeleton.durationTargetSec).toBe(
        skeleton.steps.reduce((sum, step) => sum + step.durationTargetSec, 0),
      )
      for (const step of skeleton.steps) {
        expect(step.durationTargetSec).toBeGreaterThan(0)
        expect(step.durationTargetSec).toBeLessThanOrEqual(60)
      }
    }
  })

  it('每种知识点骨架都保留一页可保存原答与订正的独立练习', () => {
    for (const skeleton of Object.values(FRAGMENT_SKELETONS)) {
      expect(skeleton.steps.some(step => step.sceneType === 'practice'), skeleton.knowledgeType).toBe(true)
    }
  })

  it('无标注 KP 兜底到 conceptual 骨架', () => {
    expect(DEFAULT_KP_KNOWLEDGE_TYPE).toBe('conceptual')
    const skeleton = fragmentSkeletonFor({ id: 'kp-1', canonicalName: 'X' })
    expect(skeleton.id).toBe('frag-conceptual')
    expect(skeleton.steps.map(step => step.sceneType)).toEqual(['visual-observation', 'concept-build', 'practice'])
    expect(skeleton.successSignalTemplate('X')).toContain('新例中指出关键特征')
    expect(skeleton.successSignalTemplate('X')).not.toContain('误区')
  })

  it('薄弱加固:needsReinforcement 追加一幕加固再练,幕数实际加权(v4 M3)', () => {
    const base = fragmentSkeletonFor({ id: 'kp-1', canonicalName: 'X', knowledgeType: 'conceptual' })
    const reinforced = fragmentSkeletonFor({ id: 'kp-1', canonicalName: 'X', knowledgeType: 'conceptual', needsReinforcement: true })
    expect(reinforced.steps.length).toBe(base.steps.length + 1)
    expect(reinforced.steps.at(-1)).toEqual({ sceneType: 'practice', role: '薄弱加固再练', executor: 'ai', durationTargetSec: 40 })
    expect(reinforced.id).toBe('frag-conceptual-reinforced')
    expect(reinforced.teachingType).toContain('薄弱加固')
    expect(reinforced.durationTargetSec).toBeGreaterThan(base.durationTargetSec)
    expect(reinforced.durationTargetSec).toBe(
      reinforced.steps.reduce((sum, step) => sum + step.durationTargetSec, 0),
    )
    // 非薄弱不受影响
    expect(fragmentSkeletonFor({ id: 'kp-1', canonicalName: 'X', knowledgeType: 'conceptual' }).steps.length).toBe(base.steps.length)
  })

  it('arc = 进入话题 + 每 KP 一段(名称·教学形态) + 路径收束', () => {
    const plan = planSkeleton([
      { id: 'kp-1', canonicalName: '甲', knowledgeType: 'conceptual' },
      { id: 'kp-2', canonicalName: '乙', knowledgeType: 'procedural' },
    ], 'course-seed-1234')
    expect(plan.skeleton.arc).toEqual(['进入话题', '甲·观察建构', '乙·讲授跟做', '路径收束'])
    expect(plan.skeleton.arc.length).toBeGreaterThanOrEqual(3)
  })

  it('课级 knowledgeType:单型直用,混合型按出现顺序 + 连接', () => {
    const single = planSkeleton([{ id: 'k1', canonicalName: 'X', knowledgeType: 'factual' }], 'seed')
    expect(single.skeleton.knowledgeType).toBe('factual')
    const mixed = planSkeleton([
      { id: 'k1', canonicalName: 'X', knowledgeType: 'procedural' },
      { id: 'k2', canonicalName: 'Y', knowledgeType: 'conceptual' },
      { id: 'k3', canonicalName: 'Z', knowledgeType: 'procedural' },
    ], 'seed')
    expect(mixed.skeleton.knowledgeType).toBe('procedural+conceptual')
  })

  it('requiredVisualForms 覆盖骨架实际用到的幕型', () => {
    const plan = planSkeleton([{ id: 'k1', canonicalName: 'X', knowledgeType: 'procedural' }], 'seed')
    expect(plan.skeleton.requiredVisualForms).toContain('worked-steps')
    expect(plan.skeleton.requiredVisualForms).toContain('practice-check')
    expect(plan.skeleton.requiredVisualForms).toContain('summary')
  })

  it('骨架库默认 executor 分工按设计草案 §1 表(判断/价值归教师,演示/反馈归 AI)', () => {
    expect(FRAGMENT_SKELETONS.conceptual.steps.map(s => s.executor)).toEqual(['ai', 'co', 'teacher', 'ai'])
    expect(FRAGMENT_SKELETONS.procedural.steps.map(s => s.executor)).toEqual(['ai', 'ai', 'ai'])
    expect(FRAGMENT_SKELETONS.factual.steps.map(s => s.executor)).toEqual(['ai', 'ai'])
    expect(FRAGMENT_SKELETONS.metacognitive.steps.map(s => s.executor)).toEqual(['co', 'ai'])
  })

  describe('v5 M2 ai-verify:误概念覆盖断层收编', () => {
    it('无可靠误区来源时既不生成辨析页,也不追加 ai-verify', () => {
      const skeleton = fragmentSkeletonFor({ id: 'k1', canonicalName: 'X', knowledgeType: 'conceptual' })
      expect(skeleton.steps.some(s => s.sceneType === 'contrast')).toBe(false)
      expect(skeleton.steps.some(s => s.sceneType === 'ai-verify')).toBe(false)
    })

    it('空白误区不冒充可靠来源,有效原文会保留辨析页', () => {
      const empty = fragmentSkeletonFor({
        id: 'k1', canonicalName: 'X', knowledgeType: 'conceptual', misconceptions: ['   '],
      })
      const grounded = fragmentSkeletonFor({
        id: 'k2', canonicalName: 'Y', knowledgeType: 'conceptual', misconceptions: ['  真实误区原文  '],
      })
      expect(empty.steps.some(step => step.sceneType === 'contrast')).toBe(false)
      expect(grounded.steps.some(step => step.sceneType === 'contrast')).toBe(true)
    })

    it('conceptual 型:contrast 已处理第 1 条,ai-verify 合并收编第 2 条起(骨架去重:每片段至多 1 幕)', () => {
      const skeleton = fragmentSkeletonFor({
        id: 'k1', canonicalName: 'X', knowledgeType: 'conceptual',
        misconceptions: ['误区一', '误区二', '误区三'],
      })
      const verifySteps = skeleton.steps.filter(s => s.sceneType === 'ai-verify')
      expect(verifySteps).toHaveLength(1)
      expect(verifySteps[0]!.misconceptionIndices).toEqual([1, 2])
      expect(verifySteps.every(s => s.executor === 'teacher')).toBe(true)
      // 只有 1 条误区时,contrast 已处理完,不追加 ai-verify
      const single = fragmentSkeletonFor({ id: 'k2', canonicalName: 'Y', knowledgeType: 'conceptual', misconceptions: ['仅一条'] })
      expect(single.steps.some(s => s.sceneType === 'ai-verify')).toBe(false)
    })

    it('procedural/factual/metacognitive 型没有 contrast 步骤,ai-verify 合并收编全部条目进 1 幕', () => {
      for (const knowledgeType of ['procedural', 'factual', 'metacognitive'] as const) {
        const skeleton = fragmentSkeletonFor({
          id: 'k1', canonicalName: 'X', knowledgeType,
          misconceptions: ['误区一', '误区二'],
        })
        const verifySteps = skeleton.steps.filter(s => s.sceneType === 'ai-verify')
        expect(verifySteps, knowledgeType).toHaveLength(1)
        expect(verifySteps[0]!.misconceptionIndices, knowledgeType).toEqual([0, 1])
      }
    })

    it('每片段至多 1 幕 ai-verify:3 条误区的 conceptual KP,contrast 吃 1 条,ai-verify 一幕合并吃剩下 2 条', () => {
      const skeleton = fragmentSkeletonFor({
        id: 'k1', canonicalName: 'X', knowledgeType: 'conceptual',
        misconceptions: ['误区一', '误区二', '误区三'],
      })
      expect(skeleton.steps.map(s => s.sceneType)).toEqual(['visual-observation', 'concept-build', 'contrast', 'practice', 'ai-verify'])
      expect(skeleton.steps.filter(s => s.sceneType === 'ai-verify')).toHaveLength(1)
    })

    it('每片段至多 1 幕 ai-verify:3 条误区的 procedural KP,ai-verify 一幕合并吃全部 3 条', () => {
      const skeleton = fragmentSkeletonFor({
        id: 'k1', canonicalName: 'X', knowledgeType: 'procedural',
        misconceptions: ['误区一', '误区二', '误区三'],
      })
      expect(skeleton.steps.map(s => s.sceneType)).toEqual(['concept-build', 'worked-example', 'practice', 'ai-verify'])
      const verifySteps = skeleton.steps.filter(s => s.sceneType === 'ai-verify')
      expect(verifySteps).toHaveLength(1)
      expect(verifySteps[0]!.misconceptionIndices).toEqual([0, 1, 2])
    })

    it('ai-verify 合并幕时长随误区条数加权(基础预算 + 每条额外误区加时)', () => {
      const one = fragmentSkeletonFor({ id: 'k1', canonicalName: 'X', knowledgeType: 'procedural', misconceptions: ['误区一'] })
      const three = fragmentSkeletonFor({ id: 'k2', canonicalName: 'Y', knowledgeType: 'procedural', misconceptions: ['误区一', '误区二', '误区三'] })
      const base = fragmentSkeletonFor({ id: 'k3', canonicalName: 'Z', knowledgeType: 'procedural' })
      expect(one.durationTargetSec - base.durationTargetSec).toBe(30)
      expect(three.durationTargetSec - base.durationTargetSec).toBe(30 + 2 * 15)
      expect(one.steps.find(step => step.sceneType === 'ai-verify')?.durationTargetSec).toBe(30)
      expect(three.steps.find(step => step.sceneType === 'ai-verify')?.durationTargetSec).toBe(60)
    })

    it('片段总时长随页面增加，但逐页仍是独立的认知分段', () => {
      const singleClaim = fragmentSkeletonFor({
        id: 'kp-concept', canonicalName: '概念', knowledgeType: 'conceptual',
        misconceptions: ['误区一', '误区二'],
      })
      const multiClaim = fragmentSkeletonFor({
        id: 'kp-concept', canonicalName: '概念', knowledgeType: 'conceptual',
        misconceptions: ['误区一', '误区二', '误区三'],
      })

      expect(singleClaim.durationTargetSec).toBe(210)
      expect(multiClaim.durationTargetSec).toBe(225)
      expect(singleClaim.steps.find(step => step.sceneType === 'ai-verify')?.durationTargetSec).toBe(30)
      expect(multiClaim.steps.find(step => step.sceneType === 'ai-verify')?.durationTargetSec).toBe(45)
    })

    it('ai-verify 与薄弱加固可以共存(先追加合并找茬幕,再追加加固幕)', () => {
      const skeleton = fragmentSkeletonFor({
        id: 'k1', canonicalName: 'X', knowledgeType: 'procedural',
        misconceptions: ['误区一'], needsReinforcement: true,
      })
      expect(skeleton.steps.map(s => s.sceneType)).toEqual(['concept-build', 'worked-example', 'practice', 'ai-verify', 'practice'])
      expect(skeleton.id).toBe('frag-procedural-reinforced')
    })
  })

  describe('v5 M2 ai-inquiry:课级至多 1 幕', () => {
    it('无 metacognitive KP 时不插入', () => {
      const plan = planSkeleton([
        { id: 'k1', canonicalName: 'A', knowledgeType: 'conceptual' },
        { id: 'k2', canonicalName: 'B', knowledgeType: 'procedural' },
      ], 'seed')
      expect(plan.fragments.some(f => f.skeleton.steps.some(s => s.sceneType === 'ai-inquiry'))).toBe(false)
    })

    it('首个 metacognitive KP 在 practice 前插入 ai-inquiry，但不丢失独立练习', () => {
      const plan = planSkeleton([
        { id: 'k1', canonicalName: 'A', knowledgeType: 'metacognitive' },
        { id: 'k2', canonicalName: 'B', knowledgeType: 'metacognitive' },
      ], 'seed')
      expect(plan.fragments[0]!.skeleton.steps.map(s => s.sceneType)).toEqual(['concept-build', 'ai-inquiry', 'practice'])
      expect(plan.fragments[0]!.skeleton.steps[1]!.executor).toBe('co')
      expect(plan.fragments[0]!.skeleton.steps[1]!.durationTargetSec).toBe(45)
      // 至多 1 幕:第二个 metacognitive KP 保持原样
      expect(plan.fragments[1]!.skeleton.steps.map(s => s.sceneType)).toEqual(['concept-build', 'practice'])
    })
  })
})
