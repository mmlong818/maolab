/**
 * OpenAI 兼容的模型通道（3a）。参数全部显式传入，不读环境变量；用于真实模型冒烟与本机工具。
 * 托管形态的通道由 3c 用会话凭证实现，不用这个文件。
 */
import type { CourseLlmTransport } from '../runtime.js'

export interface OpenAiCompatConfig {
  baseURL: string
  apiKey: string
  model: string
  /** 缺省 true：带 response_format json_object（网关不支持时关掉，抽取函数兜得住代码块） */
  jsonMode?: boolean
  /** glm 系列缺省关闭深度思考（结构化生成不需要且拖慢数倍），true 时打开 */
  thinking?: boolean
  fetchImpl?: typeof fetch
}

export function createOpenAiCompatTransport(config: OpenAiCompatConfig): CourseLlmTransport {
  const base = config.baseURL.replace(/\/+$/, '')
  const doFetch = config.fetchImpl ?? fetch
  return {
    async completeJson(request) {
      const res = await doFetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            ...(request.system ? [{ role: 'system', content: request.system }] : []),
            { role: 'user', content: request.user },
          ],
          temperature: request.temperature,
          ...(config.jsonMode === false ? {} : { response_format: { type: 'json_object' } }),
          ...(config.model.startsWith('glm') && config.thinking !== true ? { thinking: { type: 'disabled' } } : {}),
        }),
        signal: request.signal,
      })
      if (!res.ok) throw new Error(`LLM HTTP ${res.status}`)
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
      const content = data.choices?.[0]?.message?.content
      if (!content) throw new Error('Empty LLM response')
      return content
    },
  }
}
