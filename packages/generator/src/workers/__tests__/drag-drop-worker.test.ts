import { describe, it, expect, vi } from 'vitest'
import { DragDropWorker } from '../drag-drop-worker.js'
import type { DragDropContent } from '@maolab/shared-types'

describe('DragDropWorker', () => {
  const mockCallLLM = vi.fn()
  const worker = new DragDropWorker(mockCallLLM)

  it('has type drag-drop', () => {
    expect(worker.type).toBe('drag-drop')
  })

  it('generates drag-drop scene with valid matches', async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      instruction: '将各细胞器拖放到正确的功能分类',
      speakerNote: '根据功能将细胞器分类',
      items: [
        { id: 'i1', text: '线粒体' },
        { id: 'i2', text: '叶绿体' },
        { id: 'i3', text: '核糖体' },
      ],
      targets: [
        { id: 't1', label: '能量转换' },
        { id: 't2', label: '蛋白质合成' },
      ],
      matches: { i1: 't1', i2: 't1', i3: 't2' },
    }))

    const item = { id: 'i1', title: '细胞器功能', sceneType: 'drag-drop' as const, objective: '分类细胞器', durationHint: 150 }
    const profile = { topic: '细胞生物学', domain: '生物', difficulty: 'beginner' as const, coreConcepts: [], analogies: [], narrativeHooks: [], causalChain: [], misconceptions: [], keyFigures: [], emphasizedConcepts: [] }
    const plan = { id: 'p1', topic: '细胞', sourceDocuments: [], teachingMethod: 'standard' as const, style: 'lecture' as const, language: 'zh', difficulty: 'beginner' as const, agents: [], outline: [], emphasizedConcepts: [], createdAt: 0 }

    const scene = await worker.generate(item, profile, plan)

    expect(scene.type).toBe('drag-drop')
    const content = scene.content as DragDropContent
    expect(content.items).toHaveLength(3)
    expect(content.matches['i1']).toBe('t1')
  })
})
