/**
 * DashScope Qwen Provider — OpenAI 兼容接口
 *
 * 走 DASHSCOPE_API_KEY，成本极低。
 * 模型字符串约定：
 *   "qwen:qwen-plus"   → model=qwen-plus
 *   "qwen:qwen-turbo"  → model=qwen-turbo
 */

import type { LLMCaller } from './annotation-pipeline.js'

const QWEN_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1'

export function createQwenCaller(apiKey: string): LLMCaller {
  return async function qwenCall(args: {
    prompt: string
    system: string
    model: string
    apiKey: string
  }): Promise<string> {
    const colon = args.model.indexOf(':')
    const modelName = colon >= 0 && args.model.slice(0, colon) === 'qwen'
      ? args.model.slice(colon + 1)
      : args.model
    const key = args.apiKey || apiKey

    const res = await fetch(`${QWEN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.prompt },
        ],
        temperature: 0.1,
      }),
    })

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText)
      throw new Error(`Qwen API ${res.status}: ${err.slice(0, 300)}`)
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      error?: { message?: string }
    }

    if (json.error) throw new Error(`Qwen error: ${json.error.message}`)
    const content = json.choices?.[0]?.message?.content
    if (!content) throw new Error(`Qwen 返回内容为空: ${JSON.stringify(json).slice(0, 200)}`)
    return content
  }
}
