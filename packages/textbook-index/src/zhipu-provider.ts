/**
 * 智谱 GLM Provider — OpenAI 兼容接口
 *
 * 不消耗 Claude 订阅配额，走 ZHIPU_API_KEY。
 * 模型字符串约定：
 *   "zhipu:glm-4-flash"  → model=glm-4-flash
 *   "zhipu:glm-z1-flash" → model=glm-z1-flash
 */

import type { LLMCaller } from './annotation-pipeline.js'

const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4'

export function parseZhipuModel(model: string): string {
  const colon = model.indexOf(':')
  if (colon >= 0 && model.slice(0, colon) === 'zhipu') return model.slice(colon + 1)
  return model
}

export function createZhipuCaller(apiKey: string): LLMCaller {
  return async function zhipuCall(args: {
    prompt: string
    system: string
    model: string
    apiKey: string
  }): Promise<string> {
    const modelName = parseZhipuModel(args.model)
    const key = args.apiKey || apiKey

    const body = JSON.stringify({
      model: modelName,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.prompt },
      ],
      temperature: 0.1,
    })

    const res = await fetch(`${ZHIPU_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body,
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Zhipu API ${res.status}: ${err.slice(0, 300)}`)
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }

    if (json.error) throw new Error(`Zhipu error: ${json.error.message}`)
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error(`Zhipu 返回内容为空: ${JSON.stringify(json).slice(0, 200)}`)
    return content
  }
}
