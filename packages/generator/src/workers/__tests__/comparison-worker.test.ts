import { describe, it, expect, vi } from 'vitest'
import { ComparisonWorker } from '../comparison-worker.js'
import type { ComparisonContent } from '@maolab/shared-types'

describe('ComparisonWorker', () => {
  const mockCallLLM = vi.fn()
  const worker = new ComparisonWorker(mockCallLLM)

  it('has type comparison', () => {
    expect(worker.type).toBe('comparison')
  })

  it('generates comparison scene', async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      title: '有氧呼吸 vs 无氧呼吸',
      speakerNote: '让我们对比两种呼吸方式的区别',
      leftTitle: '有氧呼吸',
      rightTitle: '无氧呼吸',
      rows: [
        { attribute: '需氧量', left: '需要氧气', right: '不需要氧气', isDifference: true },
        { attribute: '产物', left: 'CO₂ + H₂O', right: '乳酸或酒精', isDifference: true },
        { attribute: '场所', left: '线粒体', right: '细胞质基质', isDifference: true },
        { attribute: '目的', left: '产生 ATP', right: '产生 ATP', isDifference: false },
      ],
    }))

    const item = {
      id: 'i1', title: '呼吸方式比较', sceneType: 'comparison' as const,
      objective: '比较有氧和无氧呼吸', durationHint: 120,
    }
    const profile = { topic: '细胞呼吸', domain: '生物', difficulty: 'intermediate' as const, coreConcepts: [], analogies: [], narrativeHooks: [], causalChain: [], misconceptions: [], keyFigures: [], emphasizedConcepts: [] }
    const plan = { id: 'p1', topic: '细胞呼吸', sourceDocuments: [], teachingMethod: 'standard' as const, style: 'lecture' as const, language: 'zh', difficulty: 'intermediate' as const, agents: [], outline: [], emphasizedConcepts: [], createdAt: 0 }

    const scene = await worker.generate(item, profile, plan)

    expect(scene.type).toBe('comparison')
    const content = scene.content as ComparisonContent
    expect(content.rows).toHaveLength(4)
    expect(content.rows.filter(r => r.isDifference)).toHaveLength(3)
  })
})
