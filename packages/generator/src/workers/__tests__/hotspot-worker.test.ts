import { describe, it, expect, vi } from 'vitest'
import { HotspotWorker } from '../hotspot-worker.js'
import type { HotspotContent } from '@maolab/shared-types'

describe('HotspotWorker', () => {
  const mockCallLLM = vi.fn()
  const worker = new HotspotWorker(mockCallLLM)

  it('has type hotspot', () => {
    expect(worker.type).toBe('hotspot')
  })

  it('generates hotspot scene from LLM output', async () => {
    mockCallLLM.mockResolvedValueOnce(JSON.stringify({
      title: '细胞结构图',
      speakerNote: '点击各个标注了解细胞结构',
      svgDiagram: '<svg viewBox="0 0 400 300"><circle cx="200" cy="150" r="120" fill="#e8f4e8" stroke="#4a9"/></svg>',
      hotspots: [
        { id: 'h1', x: 50, y: 50, label: '细胞核', description: '含有遗传物质 DNA 的核心结构' },
        { id: 'h2', x: 35, y: 40, label: '线粒体', description: '细胞的"发电站"，进行有氧呼吸' },
      ],
    }))

    const item = {
      id: 'item-1',
      title: '细胞结构',
      sceneType: 'hotspot' as const,
      objective: '识别细胞各结构',
      durationHint: 180,
    }
    const profile = {
      topic: '细胞生物学',
      domain: '生物',
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
      id: 'plan-1', topic: '细胞', sourceDocuments: [],
      teachingMethod: 'standard' as const, style: 'lecture' as const,
      language: 'zh', difficulty: 'beginner' as const,
      agents: [], outline: [], emphasizedConcepts: [], createdAt: 0,
    }

    const scene = await worker.generate(item, profile, plan)

    expect(scene.type).toBe('hotspot')
    expect(scene.content.type).toBe('hotspot')
    const content = scene.content as HotspotContent
    expect(content.hotspots).toHaveLength(2)
    expect(content.hotspots[0]?.label).toBe('细胞核')
    expect(content.svgDiagram).toContain('<svg')
  })
})
