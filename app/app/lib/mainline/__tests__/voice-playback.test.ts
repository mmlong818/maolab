import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  effectivePlaybackRate,
  INITIAL_VOICE_SESSION_STATE,
  nextVoiceSessionState,
  scenePlaybackRate,
  voiceSessionAllowsSynthesis,
  voicePaceLabel,
  voicePauseTimingLabel,
} from '../voice-playback.js'

describe('voice playback pacing', () => {
  it('把课程的慢、中、快节奏映射为克制的播放倍率', () => {
    expect(scenePlaybackRate('slow')).toBe(0.92)
    expect(scenePlaybackRate('medium')).toBe(1)
    expect(scenePlaybackRate('fast')).toBe(1.08)
  })

  it('把用户速度与课程节奏相乘，而不是互相覆盖', () => {
    expect(effectivePlaybackRate(1.25, scenePlaybackRate('slow'))).toBeCloseTo(1.15)
    expect(effectivePlaybackRate(0.9, scenePlaybackRate('fast'))).toBeCloseTo(0.972)
  })

  it('对异常输入回退并限制浏览器播放范围', () => {
    expect(effectivePlaybackRate(Number.NaN, Number.POSITIVE_INFINITY)).toBe(1)
    expect(effectivePlaybackRate(0.1, 0.5)).toBe(0.5)
    expect(effectivePlaybackRate(3, 2)).toBe(2)
  })

  it('把语速与自然语言停顿规则压缩为教师可扫读的标签', () => {
    expect(voicePaceLabel('slow')).toBe('慢速')
    expect(voicePaceLabel('medium')).toBe('常速')
    expect(voicePauseTimingLabel('每句后停 700ms，题目后停 900 毫秒。')).toBe('停顿 700ms / 900ms')
    expect(voicePauseTimingLabel('结论前明显降速并停顿。')).toBe('停顿提示')
  })
})

describe('voice session consent', () => {
  it('每次进入课堂都从待启动开始，只有显式启动后才允许合成', () => {
    expect(INITIAL_VOICE_SESSION_STATE).toBe('idle')
    expect(voiceSessionAllowsSynthesis(INITIAL_VOICE_SESSION_STATE)).toBe(false)

    const active = nextVoiceSessionState(INITIAL_VOICE_SESSION_STATE)
    expect(active).toBe('active')
    expect(voiceSessionAllowsSynthesis(active)).toBe(true)
    expect(nextVoiceSessionState(active)).toBe('idle')
  })

  it('课堂接入会话授权且不从持久偏好恢复自动合成', () => {
    const source = readFileSync(new URL('../../../components/mainline/StageCanvas.tsx', import.meta.url), 'utf8')

    expect(source).toContain('useState<VoiceSessionState>(INITIAL_VOICE_SESSION_STATE)')
    expect(source).toContain('if (!voiceOn || !course) return')
    expect(source).not.toContain("localStorage.getItem('maolab-mainline-voice')")
    expect(source).not.toContain("localStorage.setItem('maolab-mainline-voice'")
  })
})
