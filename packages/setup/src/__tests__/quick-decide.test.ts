import { describe, it, expect } from 'vitest'
import { QuickDecider } from '../quick-decide.js'
import type { LearnerProfile } from '@maolab/shared-types'

const mockProfile: LearnerProfile = {
  id: 'me',
  learnerType: 'individual',
  preferredLanguage: 'zh-CN',
  preferredStyle: 'lecture',
  preferredDifficulty: 'intermediate',
  preferredAgentCount: 2,
  createdAt: 1000,
  updatedAt: 1000,
}

describe('QuickDecider.buildPrompt', () => {
  it('injects topic and profile preferences', () => {
    const qd = new QuickDecider({ apiKey: 'test', model: 'test-model' })
    const prompt = qd.buildPrompt('量子力学入门', mockProfile, ['波粒二象性'], [])
    expect(prompt).toContain('量子力学入门')
    expect(prompt).toContain('zh-CN')
    expect(prompt).toContain('intermediate')
    expect(prompt).toContain('波粒二象性')
  })

  it('handles no weak concepts gracefully', () => {
    const qd = new QuickDecider({ apiKey: 'test', model: 'test-model' })
    const prompt = qd.buildPrompt('数学基础', mockProfile, [], [])
    expect(prompt).not.toContain('{{')
  })
})

describe('QuickDecider.parseResult', () => {
  it('parses valid decision JSON', () => {
    const qd = new QuickDecider({ apiKey: 'test', model: 'test-model' })
    const raw = JSON.stringify({
      topic: '牛顿定律',
      style: 'lecture',
      language: 'zh-CN',
      difficulty: 'intermediate',
      agentCount: 2,
      outline: [
        { title: '第一章', sceneType: 'slide', objective: '理解惯性', durationHint: 180 },
      ],
      reasoning: '根据学生偏好选择讲授式',
    })
    const result = qd.parseResult(raw)
    expect(result.style).toBe('lecture')
    expect(result.outline).toHaveLength(1)
    expect(result.reasoning).toBeTruthy()
  })

  it('throws on missing required fields', () => {
    const qd = new QuickDecider({ apiKey: 'test', model: 'test-model' })
    expect(() => qd.parseResult('{"topic":"x"}')).toThrow()
  })
})
