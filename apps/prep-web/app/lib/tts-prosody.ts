export const TTS_PROVIDER_EMOTIONS = Object.freeze([
  'happy',
  'sad',
  'angry',
  'fearful',
  'disgusted',
  'surprised',
  'calm',
  'fluent',
  // MiniMax uses this spelling in the public API contract.
  'whipser',
] as const)

export type TtsProviderEmotion = (typeof TTS_PROVIDER_EMOTIONS)[number]
export type TtsRequestEmotion = TtsProviderEmotion | 'neutral'

const PROVIDER_EMOTION_SET = new Set<string>(TTS_PROVIDER_EMOTIONS)

const EDUCATIONAL_CUE_MAP: Readonly<Record<string, TtsProviderEmotion>> = Object.freeze({
  analytical: 'calm',
  thinking: 'calm',
  'low-emphasis': 'calm',
  'soft-emphasis': 'calm',
  questioning: 'fluent',
  'clear-emphasis': 'fluent',
  emphatic: 'fluent',
  attempt: 'fluent',
  restating: 'fluent',
  encouraging: 'happy',
  relieved: 'happy',
  curious: 'surprised',
  confused: 'surprised',
})

/**
 * 把课程中的教学意图收敛成提供商支持的有限语气。
 * 未知值不猜测，保持角色默认声线；neutral 也表示不附加语气。
 */
export function ttsEmotionForCue(cue: unknown): TtsProviderEmotion | undefined {
  if (typeof cue !== 'string') return undefined
  const normalized = cue.trim().toLowerCase()
  if (!normalized || normalized === 'neutral') return undefined
  if (PROVIDER_EMOTION_SET.has(normalized)) return normalized as TtsProviderEmotion
  return EDUCATIONAL_CUE_MAP[normalized]
}

/** 同文本和角色只有在提供商实际语气相同时才共享音频。 */
export function ttsAudioRequestKey(text: string, voice: string, cue?: string): string {
  return JSON.stringify([voice, ttsEmotionForCue(cue) ?? 'default', text])
}
