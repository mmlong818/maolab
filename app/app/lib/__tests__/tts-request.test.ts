import { describe, expect, it } from 'vitest'
import {
  MAX_TTS_INPUT_CODEPOINTS,
  MAX_TTS_SPOKEN_CODEPOINTS,
  parseAdditionalTtsVoiceIds,
  parseTtsRequestBody,
} from '../tts-request.js'

describe('parseTtsRequestBody', () => {
  it.each([null, [], '讲稿', 1])('拒绝非对象请求正文: %j', body => {
    expect(parseTtsRequestBody(body)).toMatchObject({
      ok: false,
      error: { code: 'invalid_request_body' },
    })
  })

  it.each([
    {},
    { text: null },
    { text: 42 },
    { text: '   ' },
  ])('拒绝缺失或非字符串 text: %j', body => {
    expect(parseTtsRequestBody(body)).toMatchObject({
      ok: false,
      error: { code: 'text_required' },
    })
  })

  it('按 Unicode 字符而不是 UTF-16 单元限制单次合成文本', () => {
    expect(parseTtsRequestBody({ text: '😀'.repeat(MAX_TTS_INPUT_CODEPOINTS) }).ok).toBe(true)
    expect(parseTtsRequestBody({ text: '😀'.repeat(MAX_TTS_INPUT_CODEPOINTS + 1) })).toMatchObject({
      ok: false,
      error: { code: 'text_too_long' },
    })
  })

  it('在边界内完成数学口语化并保留合法老师音色', () => {
    expect(parseTtsRequestBody({
      text: '  面积是 \\(S=\\frac{1}{2}ah\\)。  ',
      voice: 'longxiaochun_v3',
      emotion: 'neutral',
    })).toEqual({
      ok: true,
      value: {
        text: '面积是 S等于2分之1ah。',
        voice: 'longxiaochun_v3',
        emotion: 'neutral',
      },
    })
  })

  it('接受各学段课堂会实际使用的内置同学音色', () => {
    for (const voice of [
      'cute_boy',
      'qiaopi_mengmei',
      'Chinese (Mandarin)_Gentle_Youth',
    ]) {
      expect(parseTtsRequestBody({ text: '我来回答。', voice })).toMatchObject({
        ok: true,
        value: { voice },
      })
    }
  })

  it('拒绝未知音色，显式配置后才放行自定义音色', () => {
    expect(parseTtsRequestBody({ text: '开始。', voice: 'custom:class-voice' })).toMatchObject({
      ok: false,
      error: { code: 'voice_not_allowed' },
    })

    expect(parseTtsRequestBody(
      { text: '开始。', voice: 'custom:class-voice' },
      { additionalVoiceIds: ['custom:class-voice'] },
    )).toMatchObject({
      ok: true,
      value: { voice: 'custom:class-voice' },
    })
  })

  it.each([
    { text: '开始。', voice: 3 },
    { text: '开始。', voice: '' },
    { text: '开始。', voice: 'bad\nvoice' },
    { text: '开始。', voice: 'x'.repeat(129) },
  ])('拒绝畸形音色参数: %j', body => {
    expect(parseTtsRequestBody(body)).toMatchObject({
      ok: false,
      error: { code: 'voice_invalid' },
    })
  })

  it('只接受提供商支持的情绪枚举', () => {
    expect(parseTtsRequestBody({ text: '开始。', emotion: 'excited' })).toMatchObject({
      ok: false,
      error: { code: 'emotion_invalid' },
    })
    for (const emotion of ['happy', 'calm', 'fluent', 'whipser']) {
      expect(parseTtsRequestBody({ text: '开始。', emotion })).toMatchObject({
        ok: true,
        value: { emotion },
      })
    }
  })

  it('转换后文本异常膨胀时也在调用提供商前拒绝', () => {
    expect(parseTtsRequestBody(
      { text: '短讲稿' },
      { speechTransform: () => '字'.repeat(MAX_TTS_SPOKEN_CODEPOINTS + 1) },
    )).toMatchObject({
      ok: false,
      error: { code: 'spoken_text_too_long' },
    })
  })
})

describe('parseAdditionalTtsVoiceIds', () => {
  it('去重、清理并忽略格式无效的自定义音色配置', () => {
    expect(parseAdditionalTtsVoiceIds(' custom:one, custom:one, bad/voice, custom-two ')).toEqual([
      'custom:one',
      'custom-two',
    ])
  })
})
