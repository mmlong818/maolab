import { describe, it, expect, vi } from 'vitest'
import { SlideWorker } from '../workers/slide-worker.js'
import type { OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'

const mockProfile: KnowledgeProfile = {
  topic: 'Photosynthesis',
  domain: 'biology',
  difficulty: 'beginner',
  coreConcepts: [{ name: 'Chlorophyll', desc: 'Pigment that captures light.' }],
  causalChain: ['Light hits leaf', 'Chlorophyll absorbs photons'],
  misconceptions: ['Plants get energy from soil'],
  narrativeHooks: ['Plants invented solar power first'],
  analogies: ['A leaf is like a solar panel'],
  keyFigures: ['Jan Ingenhousz'],
  emphasizedConcepts: [],
}

const mockItem: OutlineItem = {
  id: 'item-1',
  title: 'Introduction to Photosynthesis',
  sceneType: 'slide',
  objective: 'Understand the basic process of photosynthesis',
  durationHint: 10,
}

const mockPlan: TeachingPlan = {
  id: 'plan-1',
  topic: 'Photosynthesis',
  sourceDocuments: [],
  teachingMethod: 'standard',
  style: 'lecture',
  language: 'en',
  difficulty: 'beginner',
  agents: [],
  outline: [mockItem],
  emphasizedConcepts: [],
  createdAt: Date.now(),
}

const mockLLMOutput = JSON.stringify({
  slides: [
    {
      layout: 'bullets',
      title: 'What is Photosynthesis?',
      body: '- Plants convert light to energy\n- CO2 + H2O → glucose + O2',
      speakerNote: 'Let us start with the basics of photosynthesis.',
      visualHint: 'Diagram of a leaf cross-section with sunlight arrows',
    },
  ],
  conceptIds: ['Chlorophyll'],
})

describe('SlideWorker', () => {
  it('returns a Scene with type=slide and SlideContent', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new SlideWorker(mockCallLLM)
    const scene = await worker.generate(mockItem, mockProfile, mockPlan)
    expect(scene.type).toBe('slide')
    expect(scene.content.type).toBe('slide')
    if (scene.content.type === 'slide') {
      expect(scene.content.slides).toHaveLength(1)
      expect(scene.content.conceptIds).toContain('Chlorophyll')
    }
  })

  it('scene has required fields populated', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new SlideWorker(mockCallLLM)
    const scene = await worker.generate(mockItem, mockProfile, mockPlan)
    expect(scene.id).toBeTruthy()
    expect(scene.outlineItemId).toBe('item-1')
    expect(scene.title).toBe('Introduction to Photosynthesis')
    expect(scene.durationHint).toBe(10)
    expect(scene.generationStatus).toBe('done')
    expect(Array.isArray(scene.actions)).toBe(true)
  })

  it('prompt contains topic and outline item title', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new SlideWorker(mockCallLLM)
    await worker.generate(mockItem, mockProfile, mockPlan)
    const prompt = mockCallLLM.mock.calls[0][0] as string
    expect(prompt).toContain('Photosynthesis')
    expect(prompt).toContain('Introduction to Photosynthesis')
  })

  it('worker type is slide', () => {
    const mockCallLLM = vi.fn()
    const worker = new SlideWorker(mockCallLLM)
    expect(worker.type).toBe('slide')
  })

  it('prompt contains gradeLevel and learningObjectives', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new SlideWorker(mockCallLLM)
    const itemWithObjectives: OutlineItem = {
      ...mockItem,
      learningObjectives: ['Describe the role of chlorophyll', 'Explain the light reaction'],
    }
    const planWithGrade: TeachingPlan = { ...mockPlan, gradeLevel: 'grade-7' }
    await worker.generate(itemWithObjectives, mockProfile, planWithGrade)
    const prompt = mockCallLLM.mock.calls[0][0] as string
    expect(prompt).toContain('grade-7')
    expect(prompt).toContain('Describe the role of chlorophyll')
  })
})
