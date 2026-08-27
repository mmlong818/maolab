import { describe, it, expect, vi } from 'vitest'
import { BranchingWorker } from '../branching-worker.js'
import type { BranchingContent } from '@maolab/shared-types'

describe('BranchingWorker', () => {
  const mockCallLLM = vi.fn()
  const worker = new BranchingWorker(mockCallLLM)

  it('has type branching', () => {
    expect(worker.type).toBe('branching')
  })

  it('generates branching scene with valid node graph', async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      title: '细胞受损后的选择',
      speakerNote: '根据情境做出判断',
      startNodeId: 'n1',
      nodes: {
        n1: {
          type: 'situation',
          text: '细胞DNA受到损伤，你是细胞的决策系统，如何应对？',
          choices: [
            { id: 'c1', text: '启动DNA修复机制', nextNodeId: 'n2', isCorrect: true },
            { id: 'c2', text: '忽略损伤继续分裂', nextNodeId: 'n3', isCorrect: false },
          ],
        },
        n2: {
          type: 'consequence',
          text: 'DNA修复成功，细胞正常继续功能。',
          feedback: '正确！p53蛋白检测到损伤后启动修复，维护基因组稳定性。',
          choices: [],
        },
        n3: {
          type: 'consequence',
          text: '带损伤基因继续复制，可能导致癌变。',
          feedback: '错误！不受控的细胞分裂是癌症的起因之一。',
          choices: [],
        },
      },
    }))

    const item = { id: 'i1', title: '细胞损伤响应', sceneType: 'branching' as const, objective: '理解细胞DNA损伤响应', durationHint: 180 }
    const profile = { topic: '细胞生物学', domain: '生物', difficulty: 'intermediate' as const, coreConcepts: [], analogies: [], narrativeHooks: [], causalChain: [], misconceptions: [], keyFigures: [], emphasizedConcepts: [] }
    const plan = { id: 'p1', topic: '细胞', sourceDocuments: [], teachingMethod: 'standard' as const, style: 'socratic' as const, language: 'zh', difficulty: 'intermediate' as const, agents: [], outline: [], emphasizedConcepts: [], createdAt: 0 }

    const scene = await worker.generate(item, profile, plan)

    expect(scene.type).toBe('branching')
    const content = scene.content as BranchingContent
    expect(content.startNodeId).toBe('n1')
    expect(Object.keys(content.nodes)).toHaveLength(3)
    expect(content.nodes['n1']?.choices).toHaveLength(2)
  })
})
