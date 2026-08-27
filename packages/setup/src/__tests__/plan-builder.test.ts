import { describe, it, expect } from 'vitest'
import { TeachingPlanBuilder } from '../plan-builder.js'
import type { OutlineChunk, SetupConfig } from '../types.js'

const config: SetupConfig = {
  topic: '光合作用',
  style: 'socratic',
  language: 'zh-CN',
  difficulty: 'beginner',
  agentCount: 2,
  teachingMethod: 'standard',
}

const chunks: OutlineChunk[] = [
  { index: 0, title: '什么是光合作用', sceneType: 'slide', objective: '理解定义', durationHint: 180 },
  { index: 1, title: '测验', sceneType: 'quiz', objective: '检验理解', durationHint: 90 },
]

describe('TeachingPlanBuilder.fromCustom', () => {
  it('builds a valid TeachingPlan from config + chunks', () => {
    const plan = TeachingPlanBuilder.fromCustom(config, chunks, ['光合', '叶绿素'])
    expect(plan.topic).toBe('光合作用')
    expect(plan.style).toBe('socratic')
    expect(plan.outline).toHaveLength(2)
    expect(plan.emphasizedConcepts).toContain('光合')
    expect(plan.id).toBeTruthy()
    expect(plan.createdAt).toBeGreaterThan(0)
  })

  it('assigns unique id per call', () => {
    const a = TeachingPlanBuilder.fromCustom(config, chunks, [])
    const b = TeachingPlanBuilder.fromCustom(config, chunks, [])
    expect(a.id).not.toBe(b.id)
  })

  it('maps OutlineChunk[] to OutlineItem[] with generated ids', () => {
    const plan = TeachingPlanBuilder.fromCustom(config, chunks, [])
    plan.outline.forEach(item => {
      expect(item.id).toBeTruthy()
      expect(item.durationHint).toBeGreaterThan(0)
    })
  })

  it('throws when outline is empty', () => {
    expect(() => TeachingPlanBuilder.fromCustom(config, [], [])).toThrow('outline')
  })
})

describe('TeachingPlanBuilder.fromCustom — toposort', () => {
  it('reorders chunks to respect prerequisites', () => {
    const ordered = TeachingPlanBuilder.fromCustom(config, [
      { index: 0, title: '正弦定理', sceneType: 'slide', objective: '掌握正弦定理', durationHint: 180, prerequisites: ['三角函数基础'] },
      { index: 1, title: '三角函数基础', sceneType: 'slide', objective: '理解三角函数', durationHint: 180 },
    ], [])
    const titles = ordered.outline.map(o => o.title)
    expect(titles.indexOf('三角函数基础')).toBeLessThan(titles.indexOf('正弦定理'))
  })

  it('leaves order unchanged when no prerequisites', () => {
    const plan = TeachingPlanBuilder.fromCustom(config, chunks, [])
    expect(plan.outline.map(o => o.title)).toEqual(chunks.map(c => c.title))
  })
})

describe('TeachingPlanBuilder.fromQuickDecision', () => {
  it('builds TeachingPlan from QuickDecisionResult', () => {
    const result = {
      topic: '黑洞',
      style: 'lecture' as const,
      language: 'zh-CN',
      difficulty: 'advanced' as const,
      agentCount: 3,
      outline: [{ title: '引力', sceneType: 'slide' as const, objective: '理解引力', durationHint: 240 }],
      reasoning: '高级用户适合讲授式',
    }
    const plan = TeachingPlanBuilder.fromQuickDecision(result, [])
    expect(plan.topic).toBe('黑洞')
    expect(plan.difficulty).toBe('advanced')
    expect(plan.agents).toHaveLength(3)
  })
})
