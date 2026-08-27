import { describe, it, expect } from 'vitest'
import { parseModelString } from '../llm/providers.js'

describe('parseModelString', () => {
  it('defaults to openai for bare model name', () => {
    expect(parseModelString('gpt-4o-mini')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
    })
  })

  it('parses anthropic provider', () => {
    expect(parseModelString('anthropic:claude-sonnet-4-6')).toEqual({
      providerId: 'anthropic',
      modelId: 'claude-sonnet-4-6',
    })
  })

  it('parses deepseek provider', () => {
    expect(parseModelString('deepseek:deepseek-chat')).toEqual({
      providerId: 'deepseek',
      modelId: 'deepseek-chat',
    })
  })

  it('parses qwen provider', () => {
    expect(parseModelString('qwen:qwen3-max')).toEqual({
      providerId: 'qwen',
      modelId: 'qwen3-max',
    })
  })

  it('splits on first colon only', () => {
    expect(parseModelString('openai:gpt-4o')).toEqual({
      providerId: 'openai',
      modelId: 'gpt-4o',
    })
  })

  it('throws for unknown provider', () => {
    expect(() => parseModelString('unknown:some-model')).toThrow(
      'Unknown provider: unknown',
    )
  })
})
