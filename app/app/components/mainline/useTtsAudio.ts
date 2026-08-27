'use client'

/**
 * useTtsAudio — 课堂语音播放 hook（体验设计 Phase 1「开口说话」）
 *
 * 调 /api/tts (DashScope cosyvoice) 合成讲稿语音并播放：
 * - 进程内 blob 缓存（同一段文字+角色音色+实际语气只合成一次）
 * - 新播放自动停掉上一段；组件卸载自动停
 * - prefetch() 预取下一页，翻页零等待
 * - 浏览器 autoplay 限制下播放失败静默降级（文字仍在）
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { effectivePlaybackRate } from '@/lib/mainline/voice-playback'
import { ttsAudioRequestKey, ttsEmotionForCue } from '@/lib/tts-prosody'

const blobCache = new Map<string, string>() // cacheKey -> objectURL
const inflight = new Map<string, Promise<string | null>>()

async function fetchAudioUrl(text: string, voice: string, cue?: string): Promise<string | null> {
  const emotion = ttsEmotionForCue(cue)
  const key = ttsAudioRequestKey(text, voice, cue)
  const hit = blobCache.get(key)
  if (hit) return hit
  const pending = inflight.get(key)
  if (pending) return pending
  const p = (async () => {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, ...(emotion ? { emotion } : {}) }),
      })
      if (!res.ok) return null
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      blobCache.set(key, url)
      return url
    } catch {
      return null
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, p)
  return p
}

export interface PlayOpts {
  /** 本段内容的相对语速，会与用户全局语速相乘。 */
  rate?: number
  /** 教学语气只调整受控韵律，不改变角色 voiceId。 */
  emotion?: string
  /** 播放自然结束时回调(被 stop/新 play 打断不触发) */
  onEnded?: () => void
}

export interface TtsAudioControls {
  /** 播放一段文字。playKey 用于标识当前在播什么（UI 高亮用）。 */
  play: (text: string, voice: string, playKey: string, opts?: PlayOpts) => Promise<void>
  /** 停止当前播放。 */
  stop: () => void
  /** 预取（不播放），翻页前调用可消除等待。 */
  prefetch: (text: string, voice: string, emotion?: string) => void
  /** 调整当前播放速度(对正在播的也即时生效)。 */
  setRate: (rate: number) => void
  /** 当前正在播放的 playKey（null = 没在播）。 */
  playingKey: string | null
  /** 当前正在合成加载的 playKey。 */
  loadingKey: string | null
}

export function useTtsAudio(): TtsAudioControls {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingKey, setPlayingKey] = useState<string | null>(null)
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  // 防止异步回来时已切页：记录最新一次 play 请求
  const seqRef = useRef(0)

  const stop = useCallback(() => {
    seqRef.current += 1
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    setPlayingKey(null)
    setLoadingKey(null)
  }, [])

  const userRateRef = useRef(1)
  const sceneRateRef = useRef(1)

  const play = useCallback(async (text: string, voice: string, playKey: string, opts?: PlayOpts) => {
    const t = text.trim()
    if (!t) return
    stop()
    sceneRateRef.current = opts?.rate ?? 1
    const seq = ++seqRef.current
    setLoadingKey(playKey)
    const url = await fetchAudioUrl(t.slice(0, 600), voice, opts?.emotion)
    if (seq !== seqRef.current) return // 已被新的 play/stop 取代
    setLoadingKey(null)
    if (!url) {
      // 合成失败也要让自动播放流程继续(文字仍可读)
      opts?.onEnded?.()
      return
    }
    const audio = new Audio(url)
    audio.playbackRate = effectivePlaybackRate(userRateRef.current, sceneRateRef.current)
    audioRef.current = audio
    audio.onended = () => {
      if (seq === seqRef.current) {
        setPlayingKey(null)
        opts?.onEnded?.()
      }
    }
    try {
      await audio.play()
      if (seq === seqRef.current) setPlayingKey(playKey)
    } catch {
      // 浏览器 autoplay 拦截：静默降级，等用户手势后再播
      if (seq === seqRef.current) opts?.onEnded?.()
    }
  }, [stop])

  const setRate = useCallback((rate: number) => {
    userRateRef.current = effectivePlaybackRate(rate, 1)
    if (audioRef.current) {
      audioRef.current.playbackRate = effectivePlaybackRate(userRateRef.current, sceneRateRef.current)
    }
  }, [])

  const prefetch = useCallback((text: string, voice: string, emotion?: string) => {
    const t = text.trim()
    if (t) void fetchAudioUrl(t.slice(0, 600), voice, emotion)
  }, [])

  // 卸载即停
  useEffect(() => stop, [stop])

  return useMemo(
    () => ({ play, stop, prefetch, setRate, playingKey, loadingKey }),
    [play, stop, prefetch, setRate, playingKey, loadingKey],
  )
}
