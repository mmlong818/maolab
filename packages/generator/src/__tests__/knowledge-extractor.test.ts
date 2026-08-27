import { describe, it, expect, vi } from 'vitest'
import { KnowledgeProfileExtractor } from '../knowledge/extractor.js'

const mockProfile = {
  topic: 'Photosynthesis',
  domain: 'biology',
  difficulty: 'beginner',
  coreConcepts: [
    { name: 'Chlorophyll', desc: 'The pigment that captures light energy.' },
    { name: 'Calvin Cycle', desc: 'The process of carbon fixation.' },
  ],
  causalChain: ['Light hits chlorophyll', 'Chlorophyll absorbs photons', 'Energy converts CO2 to glucose'],
  misconceptions: ['Plants only consume CO2', 'Photosynthesis only happens in leaves'],
  narrativeHooks: ['Plants invented solar power billions of years before humans'],
  analogies: ['A leaf is like a solar panel factory'],
  keyFigures: ['Jan Ingenhousz'],
  emphasizedConcepts: ['Calvin Cycle'],
}

describe('KnowledgeProfileExtractor', () => {
  it('returns a valid KnowledgeProfile when LLM succeeds', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(JSON.stringify(mockProfile))
    const extractor = new KnowledgeProfileExtractor(mockCallLLM)
    const result = await extractor.extract({
      topic: 'Photosynthesis',
      domain: 'biology',
      difficulty: 'beginner',
      emphasizedConcepts: ['Calvin Cycle'],
    })
    expect(result.topic).toBe('Photosynthesis')
    expect(result.coreConcepts).toHaveLength(2)
    expect(result.emphasizedConcepts).toContain('Calvin Cycle')
  })

  it('prompt contains topic and emphasized concepts', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue(JSON.stringify(mockProfile))
    const extractor = new KnowledgeProfileExtractor(mockCallLLM)
    await extractor.extract({
      topic: 'Quantum Entanglement',
      domain: 'physics',
      difficulty: 'advanced',
      emphasizedConcepts: ['superposition'],
    })
    const prompt = mockCallLLM.mock.calls[0][0] as string
    expect(prompt).toContain('Quantum Entanglement')
    expect(prompt).toContain('superposition')
  })

  it('retries and succeeds on valid output after bad JSON', async () => {
    const mockCallLLM = vi.fn()
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce(JSON.stringify(mockProfile))
    const extractor = new KnowledgeProfileExtractor(mockCallLLM)
    const result = await extractor.extract({
      topic: 'Photosynthesis',
      domain: 'biology',
      difficulty: 'beginner',
      emphasizedConcepts: [],
    })
    expect(result.topic).toBe('Photosynthesis')
    expect(mockCallLLM).toHaveBeenCalledTimes(2)
  })

  it('throws when all retries fail', async () => {
    const mockCallLLM = vi.fn().mockResolvedValue('bad output')
    const extractor = new KnowledgeProfileExtractor(mockCallLLM)
    await expect(
      extractor.extract({
        topic: 'X',
        domain: 'Y',
        difficulty: 'beginner',
        emphasizedConcepts: [],
      })
    ).rejects.toThrow()
  })
})
