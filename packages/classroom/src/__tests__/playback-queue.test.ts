/**
 * playback-queue 单测 — Sprint A2.1
 */

import { describe, it, expect } from 'vitest'
import {
  initQueue,
  nextInQueue,
  prevInQueue,
  hotSwapPlan,
  progressOf,
} from '../delivery/playback-queue.js'
import type { DeliveryPlan } from '../delivery/delivery-adapter.js'

function plan(ids: string[]): DeliveryPlan {
  return {
    orderedAtomIds: ids,
    insertedRemediation: [],
    skippedAtomIds: [],
    reason: 'test',
  }
}

describe('playback-queue', () => {
  it('next() 沿 orderedAtomIds 推进', () => {
    let s = initQueue(plan(['a', 'b', 'c']))
    expect(s.currentId).toBe('a')
    expect(s.remainingIds).toEqual(['b', 'c'])

    s = nextInQueue(s)
    expect(s.playedIds).toEqual(['a'])
    expect(s.currentId).toBe('b')
    expect(s.remainingIds).toEqual(['c'])

    s = nextInQueue(s)
    expect(s.currentId).toBe('c')
    expect(s.remainingIds).toEqual([])

    s = nextInQueue(s)
    expect(s.playedIds).toEqual(['a', 'b', 'c'])
    expect(s.currentId).toBeNull()
  })

  it('prev() 回退到 playedIds 最后一个', () => {
    let s = initQueue(plan(['a', 'b', 'c']))
    s = nextInQueue(s) // current=b, played=[a]
    s = nextInQueue(s) // current=c, played=[a,b]

    s = prevInQueue(s)
    expect(s.currentId).toBe('b')
    expect(s.playedIds).toEqual(['a'])
    expect(s.remainingIds).toEqual(['c'])

    s = prevInQueue(s)
    expect(s.currentId).toBe('a')
    expect(s.playedIds).toEqual([])
    expect(s.remainingIds).toEqual(['b', 'c'])

    // 已在首位时不变
    const same = prevInQueue(s)
    expect(same).toEqual(s)
  })

  it('hotSwap 保留 playedIds 与 currentId, 仅替换 remainingIds', () => {
    let s = initQueue(plan(['a', 'b', 'c', 'd']))
    s = nextInQueue(s) // current=b, played=[a]

    // 新 plan: 插了 r 在 c 之前, 跳过了 d
    const swapped = hotSwapPlan(s, plan(['a', 'b', 'r', 'c']))
    expect(swapped.playedIds).toEqual(['a'])
    expect(swapped.currentId).toBe('b')
    expect(swapped.remainingIds).toEqual(['r', 'c'])
  })

  it('course.atoms 空时退化: initQueue 给出 null currentId', () => {
    const s = initQueue(plan([]))
    expect(s.currentId).toBeNull()
    expect(s.remainingIds).toEqual([])
    expect(progressOf(s)).toEqual({ current: 0, total: 0 })
  })

  it('progressOf 在播放中给出 current/total', () => {
    let s = initQueue(plan(['a', 'b', 'c']))
    expect(progressOf(s)).toEqual({ current: 1, total: 3 })
    s = nextInQueue(s)
    expect(progressOf(s)).toEqual({ current: 2, total: 3 })
  })
})
