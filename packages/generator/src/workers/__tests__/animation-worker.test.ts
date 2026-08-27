import { describe, it, expect, vi } from 'vitest'
import { AnimationWorker } from '../animation-worker.js'
import type { AnimationContent } from '@maolab/shared-types'

describe('AnimationWorker', () => {
  const mockCallLLMJson = vi.fn()
  const mockCallLLMFreeform = vi.fn()
  const worker = new AnimationWorker(mockCallLLMJson, { maxRetries: 1, baseDelay: 0 }, mockCallLLMFreeform)

  it('has type animation', () => {
    expect(worker.type).toBe('animation')
  })

  it('generates animation scene with steps', async () => {
    mockCallLLMJson.mockResolvedValueOnce(JSON.stringify({
      title: 'ATP合成过程',
      speakerNote: '观察ATP合酶如何利用质子梯度合成ATP',
      stepLabels: ['质子积累', '质子流动', 'ATP生成', '能量释放'],
      stepDescriptions: [
        '线粒体膜间隙积累H⁺',
        'H⁺通过ATP合酶流入基质',
        'ADP + Pi → ATP',
        'ATP水解释放能量',
      ],
    }))
    mockCallLLMFreeform
      .mockResolvedValueOnce('<svg viewBox="0 0 400 300"><rect x="10" y="10" width="380" height="280" fill="#e8f0ff"/><text x="200" y="150" text-anchor="middle">Step 1</text></svg>')
      .mockResolvedValueOnce('<svg viewBox="0 0 400 300"><rect x="10" y="10" width="380" height="280" fill="#f0ffe8"/><text x="200" y="150" text-anchor="middle">Step 2</text></svg>')
      .mockResolvedValueOnce('<svg viewBox="0 0 400 300"><rect x="10" y="10" width="380" height="280" fill="#fff8e8"/><text x="200" y="150" text-anchor="middle">Step 3</text></svg>')
      .mockResolvedValueOnce('<svg viewBox="0 0 400 300"><rect x="10" y="10" width="380" height="280" fill="#ffe8f0"/><text x="200" y="150" text-anchor="middle">Step 4</text></svg>')

    const item = { id: 'i1', title: 'ATP合成', sceneType: 'animation' as const, objective: '理解ATP合成过程', durationHint: 240 }
    const profile = { topic: '细胞呼吸', domain: '生物', difficulty: 'intermediate' as const, coreConcepts: [], analogies: [], narrativeHooks: [], causalChain: [], misconceptions: [], keyFigures: [], emphasizedConcepts: [] }
    const plan = { id: 'p1', topic: '细胞呼吸', sourceDocuments: [], teachingMethod: 'standard' as const, style: 'lecture' as const, language: 'zh', difficulty: 'intermediate' as const, agents: [], outline: [], emphasizedConcepts: [], createdAt: 0 }

    const scene = await worker.generate(item, profile, plan)

    expect(scene.type).toBe('animation')
    const content = scene.content as AnimationContent
    expect(content.steps).toHaveLength(4)
    expect(content.steps[0]?.svgFrame).toContain('<svg')
    expect(content.steps[0]?.label).toBe('质子积累')
  })
})
