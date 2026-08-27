import { describe, expect, it } from 'vitest'
import {
  TTS_PROVIDER_EMOTIONS,
  ttsAudioRequestKey,
  ttsEmotionForCue,
} from '../tts-prosody.js'

describe('ttsEmotionForCue', () => {
  it.each(TTS_PROVIDER_EMOTIONS)('保留提供商官方语气 %s', emotion => {
    expect(ttsEmotionForCue(emotion)).toBe(emotion)
  })

  it.each([
    ['calm', 'calm'],
    ['analytical', 'calm'],
    ['thinking', 'calm'],
    ['low-emphasis', 'calm'],
    ['soft-emphasis', 'calm'],
    ['questioning', 'fluent'],
    ['clear-emphasis', 'fluent'],
    ['emphatic', 'fluent'],
    ['attempt', 'fluent'],
    ['restating', 'fluent'],
    ['encouraging', 'happy'],
    ['relieved', 'happy'],
    ['curious', 'surprised'],
    ['confused', 'surprised'],
  ] as const)('把教学语气 %s 收敛为 %s', (cue, expected) => {
    expect(ttsEmotionForCue(cue)).toBe(expected)
  })

  it.each([undefined, null, '', 'neutral', 'dramatic-teacher'])('未知或中性语气不改变角色声线: %j', cue => {
    expect(ttsEmotionForCue(cue)).toBeUndefined()
  })
})

describe('ttsAudioRequestKey', () => {
  it('按提供商实际语气隔离缓存，并让同义教学语气复用结果', () => {
    const calm = ttsAudioRequestKey('看这里。', 'teacher', 'calm')
    expect(ttsAudioRequestKey('看这里。', 'teacher', 'analytical')).toBe(calm)
    expect(ttsAudioRequestKey('看这里。', 'teacher', 'happy')).not.toBe(calm)
    expect(ttsAudioRequestKey('看这里。', 'teacher')).not.toBe(calm)
  })
})
