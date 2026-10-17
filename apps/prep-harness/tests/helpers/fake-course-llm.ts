// 工具内模型调用的假云一网关（3c）：/v1/chat/completions 流式应答，内容由测试给的 reply 决定（缺省 {"issues":[]}）。
// 记录每个请求的 Authorization、model、reasoning_effort、max_tokens 与 system/user 文本（按会话凭证与 prep 预算的断言用）。
// 与 fake-openai.ts 分开：那个服务 agent 自己的模型（provider fake），这个服务 yunyi 适配器（YUNYI_LLM_BASE_URL）。
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export interface FakeCourseRequest {
  authorization: string | null
  model: string
  reasoningEffort: string | undefined
  maxTokens: number | undefined
  system: string
  user: string
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((part: { text?: string } | null) => part?.text ?? '').join('')
  return ''
}

export async function startFakeCourseLlm(reply: (request: { system: string; user: string }) => string = () => '{"issues":[]}'): Promise<{ baseUrl: string; requests: FakeCourseRequest[]; close(): Promise<void> }> {
  const requests: FakeCourseRequest[] = []
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404)
      res.end()
      return
    }
    let body = ''
    req.on('data', (chunk) => { body += chunk })
    req.on('end', () => {
      const payload = JSON.parse(body || '{}') as { model?: string; reasoning_effort?: string; max_tokens?: number; messages?: Array<{ role?: string; content?: unknown }> }
      const messages = payload.messages ?? []
      const system = messages.filter((message) => message.role === 'system').map((message) => textOf(message.content)).join('\n')
      const user = messages.filter((message) => message.role === 'user').map((message) => textOf(message.content)).join('\n')
      requests.push({ authorization: req.headers.authorization ?? null, model: payload.model ?? '', reasoningEffort: payload.reasoning_effort, maxTokens: payload.max_tokens, system, user })
      const content = reply({ system, user })
      const line = (delta: object, finish: string | null, usage?: object) =>
        `data: ${JSON.stringify({ id: 'fake-course', object: 'chat.completion.chunk', created: 1, model: payload.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
      res.write(line({ role: 'assistant', content }, null))
      res.write(line({}, 'stop', { prompt_tokens: Math.ceil((system.length + user.length) / 4), completion_tokens: Math.ceil(content.length / 4), total_tokens: Math.ceil((system.length + user.length + content.length) / 4) }))
      res.write('data: [DONE]\n\n')
      res.end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}/v1`, requests, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}
