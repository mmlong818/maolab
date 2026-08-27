import { describe, it, expect } from 'vitest'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'

describe('buildPrompt', () => {
  it('returns system and user strings for slide', () => {
    const result = buildPrompt(PROMPT_IDS.SLIDE, {
      title: 'Newton\'s Laws',
      objective: 'Understand F=ma',
      durationHint: '10',
      gradeLevel: 'grade-10',
      learningObjectives: '1. Apply F=ma',
      topic: 'Classical Mechanics',
      domain: 'Physics',
      difficulty: 'intermediate',
      coreConcepts: 'Force: F=ma',
      analogies: 'shopping cart',
      narrativeHooks: 'why planets orbit',
      teachingMethod: 'lecture',
      language: 'zh-CN',
    })
    expect(result.system).toBeTruthy()
    expect(result.user).toBeTruthy()
    expect(result.user).toContain('Newton\'s Laws')
    expect(result.user).not.toContain('{{title}}')
  })

  it('interpolates all variables in user template', () => {
    const result = buildPrompt(PROMPT_IDS.QUIZ, {
      title: 'Photosynthesis',
      objective: 'Understand light reactions',
      durationHint: '8',
      gradeLevel: 'grade-8',
      learningObjectives: '1. Describe chlorophyll',
      topic: 'Biology',
      domain: 'Life Sciences',
      difficulty: 'beginner',
      coreConcepts: 'Chlorophyll: absorbs light',
      misconceptions: 'plants only breathe CO2',
      emphasizedConcepts: 'ATP synthesis',
      teachingMethod: 'inquiry',
      language: 'en',
    })
    expect(result.user).toContain('Photosynthesis')
    expect(result.user).not.toContain('{{')
  })

  it('throws for unknown prompt id', () => {
    expect(() => buildPrompt('nonexistent' as never, {})).toThrow('Unknown prompt')
  })

  it('PROMPT_IDS contains expected keys', () => {
    expect(PROMPT_IDS.SLIDE).toBe('slide')
    expect(PROMPT_IDS.QUIZ).toBe('quiz')
    expect(PROMPT_IDS.EXTRACT_KNOWLEDGE).toBe('extract-knowledge')
    expect(PROMPT_IDS.INTERACTIVE_MODEL).toBe('interactive-model')
    expect(PROMPT_IDS.INTERACTIVE_HTML).toBe('interactive-html')
  })
})
