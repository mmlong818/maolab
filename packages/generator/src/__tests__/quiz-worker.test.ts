import { describe, it, expect, vi } from 'vitest'
import { QuizWorker } from '../workers/quiz-worker.js'
import type { OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'

const mockProfile: KnowledgeProfile = {
  topic: 'Photosynthesis',
  domain: 'biology',
  difficulty: 'beginner',
  coreConcepts: [{ name: 'Chlorophyll', desc: 'Pigment that captures light.' }],
  causalChain: ['Light hits leaf'],
  misconceptions: ['Plants get energy from soil'],
  narrativeHooks: [],
  analogies: [],
  keyFigures: [],
  emphasizedConcepts: ['Chlorophyll'],
}

const mockItem: OutlineItem = {
  id: 'item-2',
  title: 'Photosynthesis Quiz',
  sceneType: 'quiz',
  objective: 'Test understanding of photosynthesis',
  durationHint: 5,
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
  emphasizedConcepts: ['Chlorophyll'],
  createdAt: Date.now(),
}

const mockLLMOutput = JSON.stringify({
  questions: [
    {
      id: 'q1',
      type: 'multiple_choice',
      stem: 'What pigment captures light in photosynthesis?',
      options: ['Chlorophyll', 'Melanin', 'Hemoglobin', 'Keratin'],
      correctAnswers: ['Chlorophyll'],
      explanation: 'Chlorophyll is the green pigment that absorbs light energy.',
      concepts: ['Chlorophyll'],
    },
  ],
})

describe('QuizWorker', () => {
  it('returns a Scene with type=quiz and QuizContent', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new QuizWorker(mockCallLLM)
    const scene = await worker.generate(mockItem, mockProfile, mockPlan)
    expect(scene.type).toBe('quiz')
    expect(scene.content.type).toBe('quiz')
    if (scene.content.type === 'quiz') {
      expect(scene.content.questions).toHaveLength(1)
      expect(scene.content.questions[0]?.id).toBe('q1')
    }
  })

  it('scene has required fields populated', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new QuizWorker(mockCallLLM)
    const scene = await worker.generate(mockItem, mockProfile, mockPlan)
    expect(scene.id).toBeTruthy()
    expect(scene.outlineItemId).toBe('item-2')
    expect(scene.generationStatus).toBe('done')
    expect(Array.isArray(scene.actions)).toBe(true)
  })

  it('prompt contains misconceptions and emphasized concepts', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new QuizWorker(mockCallLLM)
    await worker.generate(mockItem, mockProfile, mockPlan)
    const prompt = mockCallLLM.mock.calls[0][0] as string
    expect(prompt).toContain('Plants get energy from soil')
    expect(prompt).toContain('Chlorophyll')
  })

  it('worker type is quiz', () => {
    const mockCallLLM = vi.fn()
    const worker = new QuizWorker(mockCallLLM)
    expect(worker.type).toBe('quiz')
  })

  it('prompt contains gradeLevel and learningObjectives', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(mockLLMOutput)
    const worker = new QuizWorker(mockCallLLM)
    const itemWithObjectives: OutlineItem = {
      ...mockItem,
      learningObjectives: ['Define photosynthesis', 'List the inputs and outputs'],
    }
    const planWithGrade: TeachingPlan = { ...mockPlan, gradeLevel: 'grade-8' }
    await worker.generate(itemWithObjectives, mockProfile, planWithGrade)
    const prompt = mockCallLLM.mock.calls[0][0] as string
    expect(prompt).toContain('grade-8')
    expect(prompt).toContain('Define photosynthesis')
  })
})
