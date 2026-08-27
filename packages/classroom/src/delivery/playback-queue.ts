/**
 * playback-queue — Sprint A2.1 纯逻辑
 *
 * 接受 buildDeliveryPlan() 的输出, 维护 (playedIds, currentId, remainingIds) 三态,
 * 支持 next / prev / hot-swap 操作。无 React 依赖, 便于单测。
 *
 * 关键约束:
 *  - prev() 沿 playedIds 回退, 不能简单 idx-1 (orderedAtomIds 中途可能被 hot-swap)
 *  - hotSwap(newPlan) 时, 保留 playedIds 与 currentId, 仅替换 remainingIds 中未播出的部分
 *    (避免把正在播的 atom 中途换走)
 */

import type { DeliveryPlan } from './delivery-adapter.js'

export interface PlaybackQueueState {
  playedIds: string[]
  currentId: string | null
  remainingIds: string[]
}

export function initQueue(plan: DeliveryPlan): PlaybackQueueState {
  const [first, ...rest] = plan.orderedAtomIds
  return {
    playedIds: [],
    currentId: first ?? null,
    remainingIds: rest,
  }
}

/** 推进到下一个 atom; 没有下一个时 currentId = null (调用方据此判断 finished) */
export function nextInQueue(state: PlaybackQueueState): PlaybackQueueState {
  if (state.currentId === null) return state
  const [nextId, ...rest] = state.remainingIds
  return {
    playedIds: [...state.playedIds, state.currentId],
    currentId: nextId ?? null,
    remainingIds: rest,
  }
}

/** 回退到上一个已播 atom; 没有则保持不变 */
export function prevInQueue(state: PlaybackQueueState): PlaybackQueueState {
  if (state.playedIds.length === 0) return state
  const lastPlayed = state.playedIds[state.playedIds.length - 1] as string
  const newPlayed = state.playedIds.slice(0, -1)
  const newRemaining =
    state.currentId !== null
      ? [state.currentId, ...state.remainingIds]
      : state.remainingIds
  return {
    playedIds: newPlayed,
    currentId: lastPlayed,
    remainingIds: newRemaining,
  }
}

/**
 * 用新 plan 热替换未播部分。
 *  - 保留 playedIds (历史快照不变)
 *  - 保留 currentId (正在播的 atom 不能被中途换走)
 *  - remainingIds = newPlan.orderedAtomIds 减去 playedIds 和 currentId
 */
export function hotSwapPlan(
  state: PlaybackQueueState,
  newPlan: DeliveryPlan
): PlaybackQueueState {
  const seen = new Set<string>(state.playedIds)
  if (state.currentId !== null) seen.add(state.currentId)
  const newRemaining = newPlan.orderedAtomIds.filter((id) => !seen.has(id))
  return {
    playedIds: state.playedIds,
    currentId: state.currentId,
    remainingIds: newRemaining,
  }
}

/** 总进度估算: playedIds.length + (currentId ? 1 : 0) / (上面 + remainingIds.length) */
export function progressOf(state: PlaybackQueueState): { current: number; total: number } {
  const current = state.playedIds.length + (state.currentId !== null ? 1 : 0)
  const total = current + state.remainingIds.length
  return { current, total }
}
