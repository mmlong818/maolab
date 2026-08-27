import { describe, it, expect } from 'vitest'
import { OutlineGenerator } from '../outline-generator.js'
import type { SetupConfig } from '../types.js'

const baseConfig: SetupConfig = {
  topic: '牛顿三定律',
  style: 'lecture',
  language: 'zh-CN',
  difficulty: 'intermediate',
  agentCount: 2,
  teachingMethod: 'standard',
}

describe('OutlineGenerator.buildPrompt', () => {
  it('injects topic into prompt', () => {
    const gen = new OutlineGenerator({ apiKey: 'test', model: 'test-model' })
    const prompt = gen.buildPrompt(baseConfig, ['力学', '惯性'])
    expect(prompt).toContain('牛顿三定律')
    expect(prompt).toContain('力学')
    expect(prompt).toContain('惯性')
  })

  it('injects style and difficulty', () => {
    const gen = new OutlineGenerator({ apiKey: 'test', model: 'test-model' })
    const prompt = gen.buildPrompt(baseConfig, [])
    expect(prompt).toContain('lecture')
    expect(prompt).toContain('intermediate')
  })

  it('handles empty emphasizedConcepts gracefully', () => {
    const gen = new OutlineGenerator({ apiKey: 'test', model: 'test-model' })
    const prompt = gen.buildPrompt(baseConfig, [])
    expect(prompt).not.toContain('{{')
  })
})

describe('OutlineGenerator.parseChunks', () => {
  it('parses valid JSON array into OutlineChunk[]', () => {
    const gen = new OutlineGenerator({ apiKey: 'test', model: 'test-model' })
    const raw = JSON.stringify([
      { title: '第一章', sceneType: 'slide', objective: '理解惯性', durationHint: 180 },
      { title: '测验', sceneType: 'quiz', objective: '检验掌握', durationHint: 90 },
    ])
    const chunks = gen.parseChunks(raw)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]?.index).toBe(0)
    expect(chunks[0]?.title).toBe('第一章')
    expect(chunks[1]?.sceneType).toBe('quiz')
  })

  it('throws on invalid JSON', () => {
    const gen = new OutlineGenerator({ apiKey: 'test', model: 'test-model' })
    expect(() => gen.parseChunks('not json')).toThrow()
  })

  it('throws when result is not an array', () => {
    const gen = new OutlineGenerator({ apiKey: 'test', model: 'test-model' })
    expect(() => gen.parseChunks('{"title":"x"}')).toThrow('Expected array')
  })
})
