import { generateText } from 'ai'
import type { LanguageModel } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { runClaudeCli } from '@maolab/llm-shared'
import { PROVIDERS, parseModelString } from './providers.js'

export interface LLMConfig {
  apiKey: string
  model: string
  baseURL?: string
  temperature?: number
}

export interface LLMCallOptions {
  systemPrompt?: string
  jsonMode?: boolean
}

export async function callLLM(
  prompt: string,
  config: LLMConfig,
  options: LLMCallOptions = {},
): Promise<string> {
  const { providerId, modelId } = parseModelString(config.model)
  const provider = PROVIDERS[providerId]

  // Claude CLI 订阅路径 — 不经 AI SDK
  if (provider.adapterType === 'claude-cli') {
    const system = options.systemPrompt
    const jsonSuffix = options.jsonMode
      ? '\n\n严格只输出一个合法 JSON 对象,不要使用 markdown 代码块,不要任何解释文字。'
      : ''
    return await runClaudeCli({
      user: prompt,
      system: (system ?? '') + jsonSuffix,
      model: modelId,
    })
  }

  const baseURL = config.baseURL ?? provider.defaultBaseUrl

  let model: LanguageModel
  if (provider.adapterType === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      ...(baseURL ? { baseURL } : {}),
    })
    model = anthropic(modelId)
  } else {
    const openai = createOpenAI({
      apiKey: config.apiKey,
      ...(baseURL ? { baseURL } : {}),
    })
    model = openai(modelId)
  }

  const result = await generateText({
    model,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    prompt,
    temperature: config.temperature ?? 0.7,
    ...(options.jsonMode && provider.adapterType === 'openai'
      ? { providerOptions: { openai: { response_format: { type: 'json_object' } } } }
      : {}),
  })

  return result.text
}
