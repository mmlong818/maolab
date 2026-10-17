// 测试用的假 OpenAI 兼容服务：/v1/chat/completions 流式回显学生原话（最后一段连续 user 消息的第一条）。
// 工具调用：学生原话以 TOOL:<name>:<json> 开头，或用 queueToolCall 预先排队。
// 多步回合：queueScript 排一串步骤，队列非空时每个流式请求（不论上一条是什么角色）依次取一步。
// 记录每个请求的 Authorization 头，供按 agent 换凭证的测试断言。
// unauthorized: true 时所有 chat 请求返回 401（仍记录请求）。
import http from 'node:http'
import type { AddressInfo } from 'node:net'

export type FakeRequest = {
  authorization: string | null
  userText: string
  model: string
  tools: string[]
  lastRole: string | undefined
  messageCount: number
  allText: string
  /** 请求体里的 max_tokens / reasoning_effort（缺省 undefined），以及是否带了 thinking 字段（按 preset 预算的测试用） */
  maxTokens: number | undefined
  reasoningEffort: string | undefined
  hasThinking: boolean
}

export type ScriptStep = { tool: string; args: unknown; text?: string } | { text: string }

interface ChatMessage { role?: string; content?: unknown }
interface ChatPayload {
  model?: string
  stream?: boolean
  messages?: ChatMessage[]
  tools?: Array<{ function?: { name?: string }; name?: string }>
  max_tokens?: number
  reasoning_effort?: string
  thinking?: unknown
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((b: { type?: string; text?: string } | null) => (b?.type === 'text' ? (b.text ?? '') : '')).join('')
  }
  return ''
}

export async function startFakeOpenAI(opts: { chunkDelayMs?: number; unauthorized?: boolean } = {}): Promise<{
  baseUrl: string
  requests: FakeRequest[]
  /** 让下一次以 user 消息结尾的请求返回这个工具调用（学生原话不必带 TOOL: 标记）；text 是同一条回复里工具调用前的文字 */
  queueToolCall: (name: string, args: unknown, text?: string) => void
  /** 排一串脚本步骤：队列非空时每个流式请求依次取一步（工具调用或纯文字），用于一回合多次工具调用 */
  queueScript: (steps: ScriptStep[]) => void
  /** 脚本队列里尚未取走的步骤数（断言一回合恰好用完自己排的步骤） */
  pendingScript: () => number
  /** 屏障：之后到达的 parties 个"以 user 结尾的流式请求"（即各回合的首个模型请求）先挂住，凑齐后同时放行。
   *  返回的 promise 在放行时兑现，带每个请求的到达时刻、学生原话与放行时刻；timeoutMs 内凑不齐就放行已挂住的并 reject（测试失败而不是挂死）。 */
  barrier: (parties: number, timeoutMs?: number) => Promise<{ arrivals: Array<{ at: number; userText: string }>; releasedAt: number }>
  close: () => Promise<void>
}> {
  const chunkDelayMs = opts.chunkDelayMs ?? 5
  const unauthorized = opts.unauthorized ?? false
  const requests: FakeRequest[] = []
  const toolQueue: Array<{ name: string; args: unknown; text?: string }> = []
  const script: ScriptStep[] = []
  let gate: { parties: number; held: Array<{ at: number; userText: string; go: () => void }>; open: (releasedAt: number) => void } | undefined
  let callSeq = 0
  const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url?.startsWith('/v1/models')) {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ data: [{ id: 'fake-1' }] }))
      return
    }
    if (req.method !== 'POST' || !req.url?.endsWith('/chat/completions')) {
      res.writeHead(404)
      res.end()
      return
    }
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', async () => {
      const payload = JSON.parse(body || '{}') as ChatPayload
      const messages = payload.messages ?? []
      // 学生原话 = 最后一段连续 user 消息里的第一条（pre-step 的系统说明追加在它后面）
      let end = messages.length - 1
      while (end >= 0 && messages[end]?.role !== 'user') end--
      let start = end
      while (start > 0 && messages[start - 1]?.role === 'user') start--
      // 开课简报（终审 M-1）排在学生发言之前，也是 user 角色：跳过它
      while (start < end && textOf(messages[start]?.content).startsWith('【开课信息】')) start++
      const userText = textOf(messages[start]?.content)
      const lastMsg = messages.at(-1)
      requests.push({
        authorization: req.headers.authorization ?? null,
        userText,
        model: payload.model ?? '',
        tools: (payload.tools ?? []).map((t) => t.function?.name ?? t.name ?? ''),
        lastRole: lastMsg?.role,
        messageCount: messages.length,
        allText: messages.map((m) => textOf(m.content)).join(' | '),
        maxTokens: payload.max_tokens,
        reasoningEffort: payload.reasoning_effort,
        hasThinking: 'thinking' in payload,
      })
      if (gate && payload.stream && lastMsg?.role === 'user') {
        const g = gate
        await new Promise<void>((go) => {
          g.held.push({ at: Date.now(), userText, go })
          if (g.held.length >= g.parties) g.open(Date.now())
        })
      }
      if (unauthorized) {
        res.writeHead(401, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { message: 'invalid token' } }))
        return
      }
      // 脚本步骤优先：不论上一条是 user 还是 tool，都按顺序取下一步（多工具回合用）
      const step = payload.stream ? script.shift() : undefined
      if (step) {
        const sid = `chatcmpl-${Date.now()}`
        const line = (delta: object, finish: string | null, usage?: object) =>
          `data: ${JSON.stringify({ id: sid, object: 'chat.completion.chunk', created: 1, model: payload.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`
        const usage = { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        if ('tool' in step) {
          res.write(line({ role: 'assistant', content: step.text ?? '', tool_calls: [{ index: 0, id: `call_${++callSeq}`, type: 'function', function: { name: step.tool, arguments: JSON.stringify(step.args) } }] }, null))
          res.write(line({}, 'tool_calls', usage))
        } else {
          res.write(line({ role: 'assistant', content: step.text }, null))
          res.write(line({}, 'stop', usage))
        }
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      // 本轮的工具调用：先看排队的脚本调用，再看学生原话是否以 TOOL: 开头
      const queued = lastMsg?.role === 'user' ? toolQueue.shift() : undefined
      const toolMarker = queued
        ? [queued.name, JSON.stringify(queued.args)] as const
        : lastMsg?.role === 'user' ? /^TOOL:([a-z_]+):(.*)$/s.exec(userText)?.slice(1) ?? null : null
      const id = `chatcmpl-${Date.now()}`
      const chunk = (delta: object, finish: string | null, usage?: object) =>
        `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created: 1, model: payload.model, choices: [{ index: 0, delta, finish_reason: finish }], ...(usage ? { usage } : {}) })}\n\n`
      if (toolMarker && payload.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        res.write(chunk({ role: 'assistant', content: queued?.text ?? '', tool_calls: [{ index: 0, id: `call_${++callSeq}`, type: 'function', function: { name: toolMarker[0], arguments: toolMarker[1] } }] }, null))
        res.write(chunk({}, 'tool_calls', { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }))
        res.write('data: [DONE]\n\n')
        res.end()
        return
      }
      const slow = userText.includes('slow')
      const reply = lastMsg?.role === 'tool' ? ['工具结果已处理。'] : slow ? Array.from({ length: 400 }, (_, i) => `w${i} `) : ['echo: ', userText, ' 。']
      if (payload.stream) {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
        for (const piece of reply) {
          if (res.destroyed) return
          res.write(chunk({ content: piece }, null))
          await new Promise((r) => setTimeout(r, slow ? 25 : chunkDelayMs))
        }
        res.write(chunk({}, 'stop', { prompt_tokens: 10, completion_tokens: reply.length, total_tokens: 10 + reply.length }))
        res.write('data: [DONE]\n\n')
        res.end()
      } else {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ id, object: 'chat.completion', created: 1, model: payload.model, choices: [{ index: 0, message: { role: 'assistant', content: reply.join('') }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: reply.length, total_tokens: 10 + reply.length } }))
      }
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  const { port } = server.address() as AddressInfo
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    queueToolCall: (name, args, text) => { toolQueue.push({ name, args, ...(text ? { text } : {}) }) },
    queueScript: (steps) => { script.push(...steps) },
    pendingScript: () => script.length,
    barrier: (parties, timeoutMs = 60_000) => new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const g = gate
        gate = undefined
        for (const h of g?.held ?? []) h.go()
        reject(new Error(`fake barrier: only ${g?.held.length ?? 0}/${parties} requests arrived within ${timeoutMs}ms`))
      }, timeoutMs)
      const g: NonNullable<typeof gate> = {
        parties, held: [],
        open: (releasedAt) => {
          clearTimeout(timer)
          gate = undefined
          resolve({ arrivals: g.held.map(({ at, userText }) => ({ at, userText })), releasedAt })
          for (const h of g.held) h.go()
        },
      }
      gate = g
    }),
    close: () => new Promise<void>((r) => server.close(() => r())),
  }
}
