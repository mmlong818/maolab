import { describe, it, expect, vi } from 'vitest'
import { Model3dWorker } from '../model3d-worker.js'
import type { Model3dContent } from '@maolab/shared-types'

describe('Model3dWorker', () => {
  const mockCallLLM = vi.fn()
  const worker = new Model3dWorker(mockCallLLM)

  it('has type model-3d', () => {
    expect(worker.type).toBe('model-3d')
  })

  it('generates model-3d scene from LLM output', async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      title: '波音737发动机结构',
      speakerNote: '旋转模型查看发动机各部件的空间关系',
      description: '波音737使用CFM56涡扇发动机，由风扇、压气机、燃烧室和涡轮组成',
      modelUrl: '',
      motionProfile: 'aircraft',
    }))

    const item = {
      id: 'item-1',
      title: '发动机结构',
      sceneType: 'model-3d' as const,
      objective: '了解涡扇发动机工作原理',
      durationHint: 240,
    }
    const profile = {
      topic: '航空发动机',
      domain: '航空工程',
      difficulty: 'intermediate' as const,
      coreConcepts: [],
      analogies: [],
      narrativeHooks: [],
      causalChain: [],
      misconceptions: [],
      keyFigures: [],
      emphasizedConcepts: [],
    }
    const plan = {
      id: 'plan-1', topic: '航空动力', sourceDocuments: [],
      teachingMethod: 'standard' as const, style: 'lecture' as const,
      language: 'zh', difficulty: 'intermediate' as const,
      agents: [], outline: [], emphasizedConcepts: [], createdAt: 0,
    }

    const scene = await worker.generate(item, profile, plan)

    expect(scene.type).toBe('model-3d')
    expect(scene.content.type).toBe('model-3d')
    const content = scene.content as Model3dContent
    expect(content.title).toBe('波音737发动机结构')
    expect(content.speakerNote).toBe('旋转模型查看发动机各部件的空间关系')
    expect(content.motionProfile).toBe('aircraft')
  })

  it('accepts empty modelUrl (teacher fills it in later)', async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      title: '心脏解剖结构',
      speakerNote: '观察心脏各腔室',
      description: '人类心脏由四个腔室组成',
      modelUrl: '',
      motionProfile: 'specimen',
    }))

    const item = {
      id: 'item-2',
      title: '心脏解剖',
      sceneType: 'model-3d' as const,
      objective: '识别心脏各腔室',
      durationHint: 180,
    }
    const profile = {
      topic: '心脏解剖',
      domain: '生物医学',
      difficulty: 'beginner' as const,
      coreConcepts: [],
      analogies: [],
      narrativeHooks: [],
      causalChain: [],
      misconceptions: [],
      keyFigures: [],
      emphasizedConcepts: [],
    }
    const plan = {
      id: 'plan-2', topic: '人体解剖', sourceDocuments: [],
      teachingMethod: 'standard' as const, style: 'lecture' as const,
      language: 'zh', difficulty: 'beginner' as const,
      agents: [], outline: [], emphasizedConcepts: [], createdAt: 0,
    }

    const scene = await worker.generate(item, profile, plan)
    const content = scene.content as Model3dContent
    expect(content.modelUrl).toBe('')
  })
})
