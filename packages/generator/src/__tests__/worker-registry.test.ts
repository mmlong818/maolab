import { describe, it, expect, vi } from 'vitest'
import { WorkerRegistry } from '../workers/registry.js'
import type { ContentWorker } from '../workers/types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'

function makeWorker(type: Scene['type']): ContentWorker {
  return {
    type,
    generate: vi.fn().mockResolvedValue({ type } as Scene),
  }
}

describe('WorkerRegistry', () => {
  it('resolves a registered worker by sceneType', () => {
    const registry = new WorkerRegistry()
    const worker = makeWorker('slide')
    registry.register(worker)
    const resolved = registry.resolve('slide', 'standard')
    expect(resolved).toBe(worker)
  })

  it('throws when no worker is registered for sceneType', () => {
    const registry = new WorkerRegistry()
    expect(() => registry.resolve('quiz', 'standard')).toThrow(
      /No worker registered for sceneType="quiz"/,
    )
  })

  it('error message includes registered scene types', () => {
    const registry = new WorkerRegistry()
    registry.register(makeWorker('slide'))
    expect(() => registry.resolve('quiz', 'standard')).toThrow(/slide/)
  })

  it('last registered worker for same type wins', () => {
    const registry = new WorkerRegistry()
    const first = makeWorker('slide')
    const second = makeWorker('slide')
    registry.register(first)
    registry.register(second)
    expect(registry.resolve('slide', 'standard')).toBe(second)
  })

  it('can register and resolve multiple worker types independently', () => {
    const registry = new WorkerRegistry()
    const slideWorker = makeWorker('slide')
    const quizWorker = makeWorker('quiz')
    registry.register(slideWorker)
    registry.register(quizWorker)
    expect(registry.resolve('slide', 'standard')).toBe(slideWorker)
    expect(registry.resolve('quiz', 'standard')).toBe(quizWorker)
  })
})
