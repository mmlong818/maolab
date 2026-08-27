import { describe, it, expect, vi, beforeEach } from 'vitest'
import { InteractiveWorker } from '../workers/interactive-worker.js'
import type { OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'

vi.mock('../prompts/loader.js', () => ({
  buildPrompt: vi.fn().mockReturnValue({
    system: 'mock system prompt',
    user: 'mock user prompt',
  }),
  PROMPT_IDS: {
    SLIDE: 'slide',
    QUIZ: 'quiz',
    EXTRACT_KNOWLEDGE: 'extract-knowledge',
    INTERACTIVE_MODEL: 'interactive-model',
    INTERACTIVE_HTML: 'interactive-html',
  },
}))

const mockOutlineItem: OutlineItem = {
  id: 'item-1',
  title: "Newton's Second Law",
  objective: 'Understand F = ma relationship',
  durationHint: 10,
  sceneType: 'interactive',
}

const mockProfile: KnowledgeProfile = {
  topic: 'Classical Mechanics',
  domain: 'Physics',
  difficulty: 'intermediate',
  coreConcepts: [{ name: 'Force', desc: 'F = ma' }],
  causalChain: ['Apply force', 'Object accelerates'],
  misconceptions: ['Confusing force with velocity'],
  narrativeHooks: ['why heavier objects are harder to accelerate'],
  analogies: ['pushing a shopping cart'],
  keyFigures: ['Isaac Newton'],
  emphasizedConcepts: [],
}

const mockPlan: TeachingPlan = {
  id: 'plan-1',
  topic: 'Classical Mechanics',
  sourceDocuments: [],
  teachingMethod: 'standard',
  style: 'lecture',
  language: 'zh-CN',
  difficulty: 'intermediate',
  agents: [],
  outline: [mockOutlineItem],
  emphasizedConcepts: [],
  createdAt: Date.now(),
}

const mockScientificModel = {
  core_formulas: ['F = ma'],
  mechanism: ['Apply force → object accelerates proportionally'],
  constraints: ['Assumes constant mass', 'Valid at non-relativistic speeds'],
  forbidden_errors: ['Confusing force with velocity'],
}

describe('InteractiveWorker', () => {
  let callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>

  beforeEach(() => {
    callLLM = vi.fn()
  })

  it('returns a scene with type interactive and non-empty html', async () => {
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce('<!DOCTYPE html><html><body><h1>Newton</h1></body></html>')

    const worker = new InteractiveWorker(callLLM)
    const scene = await worker.generate(mockOutlineItem, mockProfile, mockPlan)

    expect(scene.type).toBe('interactive')
    expect(scene.content.type).toBe('interactive')
    expect((scene.content as { type: 'interactive'; html: string }).html).toContain('<!DOCTYPE html>')
    expect(scene.generationStatus).toBe('done')
    expect(scene.outlineItemId).toBe('item-1')
    expect(scene.durationHint).toBe(10)
  })

  it('calls LLM twice (model extraction then html generation)', async () => {
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce('<!DOCTYPE html><html><body></body></html>')

    const worker = new InteractiveWorker(callLLM)
    await worker.generate(mockOutlineItem, mockProfile, mockPlan)

    expect(callLLM).toHaveBeenCalledTimes(2)
  })

  it('retries html pass when LLM returns empty string', async () => {
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce('')
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce('<!DOCTYPE html><html><body>ok</body></html>')

    const worker = new InteractiveWorker(callLLM, { maxRetries: 3, baseDelay: 0 })
    const scene = await worker.generate(mockOutlineItem, mockProfile, mockPlan)

    expect(callLLM).toHaveBeenCalledTimes(3)
    expect((scene.content as { type: 'interactive'; html: string }).html).toContain('<!DOCTYPE html>')
  })

  it('throws LLMOutputValidationError after maxRetries empty html responses', async () => {
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(mockScientificModel))
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValue('')

    const worker = new InteractiveWorker(callLLM, { maxRetries: 2, baseDelay: 0 })
    await expect(worker.generate(mockOutlineItem, mockProfile, mockPlan)).rejects.toThrow(
      'HTML generation failed',
    )
  })

  it('propagates error when scientific model extraction fails validation', async () => {
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify({ core_formulas: [] }))
    ;(callLLM as ReturnType<typeof vi.fn>).mockResolvedValue(JSON.stringify({ core_formulas: [] }))

    const worker = new InteractiveWorker(callLLM, { maxRetries: 2, baseDelay: 0 })
    await expect(worker.generate(mockOutlineItem, mockProfile, mockPlan)).rejects.toThrow()
  })
})
