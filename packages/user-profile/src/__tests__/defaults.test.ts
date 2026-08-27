import { describe, it, expect } from 'vitest'
import { buildDefaultProfile, mergeAdaptiveState } from '../defaults.js'

describe('buildDefaultProfile', () => {
  it('returns cold-start profile with zh-CN locale', () => {
    const p = buildDefaultProfile()
    expect(p.preferredLanguage).toBe('zh-CN')
    expect(p.preferredStyle).toBe('lecture')
    expect(p.preferredDifficulty).toBe('intermediate')
    expect(p.preferredAgentCount).toBe(2)
    expect(p.id).toBe('me')
  })

  it('createdAt and updatedAt are positive integers', () => {
    const before = Date.now()
    const p = buildDefaultProfile()
    expect(p.createdAt).toBeGreaterThanOrEqual(before)
    expect(p.updatedAt).toBe(p.createdAt)
  })
})

describe('mergeAdaptiveState', () => {
  it('returns incoming state when existing is null', () => {
    const incoming = { weak_concepts: ['A'], recommended_next: ['B'], last_updated: 1 }
    expect(mergeAdaptiveState(null, incoming)).toEqual(incoming)
  })

  it('merges weak_concepts deduplicating entries', () => {
    const existing = { weak_concepts: ['A', 'B'], recommended_next: [], last_updated: 1 }
    const incoming = { weak_concepts: ['B', 'C'], recommended_next: ['X'], last_updated: 2 }
    const result = mergeAdaptiveState(existing, incoming)
    expect(result.weak_concepts).toEqual(['A', 'B', 'C'])
    expect(result.recommended_next).toEqual(['X'])
    expect(result.last_updated).toBe(2)
  })

  it('caps weak_concepts at 20 entries', () => {
    const existing = { weak_concepts: Array.from({ length: 18 }, (_, i) => `c${i}`), recommended_next: [], last_updated: 1 }
    const incoming = { weak_concepts: ['c17', 'c18', 'c19', 'c20'], recommended_next: [], last_updated: 2 }
    const result = mergeAdaptiveState(existing, incoming)
    expect(result.weak_concepts.length).toBe(20)
  })
})
