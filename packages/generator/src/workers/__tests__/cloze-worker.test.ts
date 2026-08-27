import { describe, it, expect, vi } from 'vitest'
import { ClozeWorker } from '../cloze-worker.js'
import type { ClozeContent } from '@maolab/shared-types'

describe('ClozeWorker', () => {
  const mockCallLLM = vi.fn()
  const worker = new ClozeWorker(mockCallLLM)

  it('has type cloze', () => {
    expect(worker.type).toBe('cloze')
  })

  it('generates cloze scene with text and blank segments', async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      instruction: '完成以下关于光合作用的句子',
      speakerNote: '检验你对光合作用的掌握',
      segments: [
        { kind: 'text', text: '光合作用在' },
        { kind: 'blank', id: 'b1', answer: '叶绿体', hint: '绿色细胞器' },
        { kind: 'text', text: '中进行，利用' },
        { kind: 'blank', id: 'b2', answer: '光能', hint: '来自太阳' },
        { kind: 'text', text: '将CO₂和H₂O合成葡萄糖。' },
      ],
    }))

    const item = { id: 'i1', title: '光合作用总结', sceneType: 'cloze' as const, objective: '回忆光合作用要素', durationHint: 120 }
    const profile = { topic: '光合作用', domain: '生物', difficulty: 'beginner' as const, coreConcepts: [], analogies: [], narrativeHooks: [], causalChain: [], misconceptions: [], keyFigures: [], emphasizedConcepts: [] }
    const plan = { id: 'p1', topic: '光合作用', sourceDocuments: [], teachingMethod: 'standard' as const, style: 'lecture' as const, language: 'zh', difficulty: 'beginner' as const, agents: [], outline: [], emphasizedConcepts: [], createdAt: 0 }

    const scene = await worker.generate(item, profile, plan)

    expect(scene.type).toBe('cloze')
    const content = scene.content as ClozeContent
    const blanks = content.segments.filter(s => s.kind === 'blank')
    expect(blanks).toHaveLength(2)
    expect((blanks[0] as { kind: 'blank'; answer: string }).answer).toBe('叶绿体')
  })
})
