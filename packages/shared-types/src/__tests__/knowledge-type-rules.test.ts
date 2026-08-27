import { describe, it, expect } from 'vitest'
import { resolveTeachingMode } from '../knowledge-type-rules.js'

describe('resolveTeachingMode', () => {
  describe('factual', () => {
    it('factual + hasPriorScaffold=true → lecture-image', () => {
      const r = resolveTeachingMode('factual', true)
      expect(r.modeId).toBe('lecture-image')
      expect(r.source).toBe('rule')
    })

    it('factual + hasPriorScaffold=false → lecture-image', () => {
      const r = resolveTeachingMode('factual', false)
      expect(r.modeId).toBe('lecture-image')
    })
  })

  describe('conceptual', () => {
    it('conceptual + hasPriorScaffold=true → socratic-dialogue', () => {
      const r = resolveTeachingMode('conceptual', true)
      expect(r.modeId).toBe('socratic-dialogue')
    })

    // KSC 2006 (Kalyuga et al. Expertise Reversal) 修正点：
    // 新手在缺先验脚手架时，开放问答反而干扰学习，应降级为讲授配图。
    it('conceptual + hasPriorScaffold=false → lecture-image (KSC 2006 降级)', () => {
      const r = resolveTeachingMode('conceptual', false)
      expect(r.modeId).toBe('lecture-image')
    })
  })

  describe('procedural', () => {
    it('procedural + hasPriorScaffold=true → lecture-diagram (A 阶段占位)', () => {
      const r = resolveTeachingMode('procedural', true)
      expect(r.modeId).toBe('lecture-diagram')
    })

    it('procedural + hasPriorScaffold=false → lecture-diagram', () => {
      const r = resolveTeachingMode('procedural', false)
      expect(r.modeId).toBe('lecture-diagram')
    })
  })

  describe('metacognitive', () => {
    it('metacognitive + hasPriorScaffold=true → socratic-dialogue', () => {
      const r = resolveTeachingMode('metacognitive', true)
      expect(r.modeId).toBe('socratic-dialogue')
    })

    it('metacognitive + hasPriorScaffold=false → socratic-dialogue (不降级)', () => {
      const r = resolveTeachingMode('metacognitive', false)
      expect(r.modeId).toBe('socratic-dialogue')
    })
  })

  it('always returns source=rule', () => {
    const types = ['factual', 'conceptual', 'procedural', 'metacognitive'] as const
    for (const t of types) {
      expect(resolveTeachingMode(t, true).source).toBe('rule')
      expect(resolveTeachingMode(t, false).source).toBe('rule')
    }
  })
})
