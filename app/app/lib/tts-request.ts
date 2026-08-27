import { BUILT_IN_TTS_VOICE_IDS } from './teachers.js'
import { teacherScriptForSpeech } from './mainline/speech-text.js'
import { TTS_PROVIDER_EMOTIONS, type TtsRequestEmotion } from './tts-prosody.js'

export const MAX_TTS_REQUEST_BYTES = 8 * 1024
export const MAX_TTS_INPUT_CODEPOINTS = 600
export const MAX_TTS_SPOKEN_CODEPOINTS = 800
export const MAX_TTS_VOICE_ID_CODEPOINTS = 128

export const VALID_TTS_EMOTIONS = Object.freeze([
  ...TTS_PROVIDER_EMOTIONS,
  'neutral',
] as const)

export interface ValidTtsRequest {
  text: string
  voice?: string
  emotion?: TtsRequestEmotion
}

export type TtsRequestErrorCode =
  | 'invalid_request_body'
  | 'text_required'
  | 'text_too_long'
  | 'spoken_text_too_long'
  | 'voice_invalid'
  | 'voice_not_allowed'
  | 'emotion_invalid'

export type TtsRequestResult =
  | { ok: true; value: ValidTtsRequest }
  | { ok: false; error: { code: TtsRequestErrorCode; message: string } }

interface TtsRequestParserOptions {
  additionalVoiceIds?: Iterable<string>
  speechTransform?: (text: string) => string
}

const BUILT_IN_VOICE_SET = new Set(BUILT_IN_TTS_VOICE_IDS)
const VALID_EMOTION_SET = new Set<string>(VALID_TTS_EMOTIONS)
const VOICE_ID_PATTERN = /^[A-Za-z0-9 _():.-]+$/

function codePointLength(value: string): number {
  return Array.from(value).length
}

function fail(code: TtsRequestErrorCode, message: string): TtsRequestResult {
  return { ok: false, error: { code, message } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizedVoiceId(value: string): string | null {
  const voice = value.trim()
  if (
    !voice
    || codePointLength(voice) > MAX_TTS_VOICE_ID_CODEPOINTS
    || !VOICE_ID_PATTERN.test(voice)
  ) return null
  return voice
}

export function parseAdditionalTtsVoiceIds(raw: string | undefined): readonly string[] {
  if (!raw) return []
  return [
    ...new Set(
      raw
        .split(',')
        .map(normalizedVoiceId)
        .filter((voice): voice is string => voice !== null),
    ),
  ]
}

export function parseTtsRequestBody(
  body: unknown,
  options: TtsRequestParserOptions = {},
): TtsRequestResult {
  if (!isRecord(body)) {
    return fail('invalid_request_body', '请求正文必须是 JSON 对象。')
  }

  if (typeof body.text !== 'string') {
    return fail('text_required', 'text 必须是非空字符串。')
  }
  const rawText = body.text.trim()
  if (!rawText) return fail('text_required', 'text 必须是非空字符串。')
  if (codePointLength(rawText) > MAX_TTS_INPUT_CODEPOINTS) {
    return fail('text_too_long', `text 不能超过 ${MAX_TTS_INPUT_CODEPOINTS} 个字符。`)
  }

  let voice: string | undefined
  if (body.voice !== undefined) {
    if (typeof body.voice !== 'string') {
      return fail('voice_invalid', 'voice 必须是字符串。')
    }
    voice = normalizedVoiceId(body.voice) ?? undefined
    if (!voice) {
      return fail('voice_invalid', 'voice 格式无效。')
    }
    const additionalVoices = new Set(options.additionalVoiceIds ?? [])
    if (!BUILT_IN_VOICE_SET.has(voice) && !additionalVoices.has(voice)) {
      return fail('voice_not_allowed', 'voice 不在允许的课堂音色范围内。')
    }
  }

  let emotion: TtsRequestEmotion | undefined
  if (body.emotion !== undefined) {
    if (typeof body.emotion !== 'string' || !VALID_EMOTION_SET.has(body.emotion)) {
      return fail('emotion_invalid', 'emotion 不是受支持的情绪值。')
    }
    emotion = body.emotion as TtsRequestEmotion
  }

  const text = (options.speechTransform ?? teacherScriptForSpeech)(rawText).trim()
  if (!text) return fail('text_required', 'text 转为口语后不能为空。')
  if (codePointLength(text) > MAX_TTS_SPOKEN_CODEPOINTS) {
    return fail('spoken_text_too_long', `口语文本不能超过 ${MAX_TTS_SPOKEN_CODEPOINTS} 个字符。`)
  }

  return {
    ok: true,
    value: {
      text,
      ...(voice ? { voice } : {}),
      ...(emotion ? { emotion } : {}),
    },
  }
}
