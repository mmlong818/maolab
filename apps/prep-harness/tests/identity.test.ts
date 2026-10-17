// 身份传播专项（spec 14 条件 3）：后台 job 与 fork 子代理里，身份从运行时上下文解析，模型请求带的是发起会话的凭证。
// 探针不读工具闭包里的 sessionId：job 内用 ctx.agents.currentInitiator()（dsh 的异步发起者上下文）解析身份，
// 并不带 sessionId 走一次 yunyi 模型请求，由适配器自己解析凭证；断言假上游收到的 Authorization 头。
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let host: Awaited<ReturnType<typeof startHost>>
const run = Date.now().toString(36)
const fp = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12)
beforeAll(async () => {
  fake = await startFakeOpenAI()
  host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: fake.baseUrl }, { readyTimeoutMs: 120_000 })
}, 150_000)
afterAll(async () => { await host?.stop(); await fake?.close() })

const sessionIdFor = (owner: string, tool: string) => `s-id-${tool}-${owner}-${run}`

async function probe(owner: string, credential: string, tool: string, args = '{}'): Promise<Record<string, unknown>> {
  const id = sessionIdFor(owner, tool)
  expect((await host.api('POST', '/sessions', { sessionId: id, owner, credential, preset: 'probe-other', provider: 'yunyi', model: 'glm-test' })).status).toBe(201)
  const s = host.events(id)
  await host.api('POST', `/sessions/${id}/prompt`, { text: `TOOL:${tool}:${args}` })
  const result = await s.waitFor((e) => e.type === 'tool/result', 90_000)
  await s.waitFor((e) => e.type === 'turn/end', 90_000)
  await s.close()
  // tool/result 帧实测形状：data.message.content[].text 是工具 render 出的 JSON 文本
  const blocks = (result.data as { message?: { content?: Array<{ type?: string; text?: string }> } }).message?.content ?? []
  const text = blocks.find((b) => b.type === 'text')?.text ?? '{}'
  return JSON.parse(text) as Record<string, unknown>
}

test('background jobs resolve the owner and credential of the session that started them, concurrently', async () => {
  // 屏障：两个 job 都进入后才一起继续解析身份、发模型请求，保证二者在时间上重叠
  const args = JSON.stringify({ barrier: `jobs-${run}`, parties: 2 })
  const [a, b] = await Promise.all([probe('owner-ja', 'tok-JA', 'probe_job', args), probe('owner-jb', 'tok-JB', 'probe_job', args)])
  const shape = { jobId: expect.any(String), enteredAt: expect.any(Number), finishedAt: expect.any(Number) }
  expect(a).toEqual({ owner: 'owner-ja', credential: fp('tok-JA'), ...shape })
  expect(b).toEqual({ owner: 'owner-jb', credential: fp('tok-JB'), ...shape })
  expect(a.jobId).not.toBe(b.jobId)
  // 两个 job 的时间窗相交：任一方结束前另一方已进入
  expect(Number(a.enteredAt)).toBeLessThanOrEqual(Number(b.finishedAt))
  expect(Number(b.enteredAt)).toBeLessThanOrEqual(Number(a.finishedAt))
  // 每个 job 自己发的模型请求（不带 sessionId）到上游时带的是发起它的会话的凭证
  for (const [r, auth] of [[a, 'Bearer tok-JA'], [b, 'Bearer tok-JB']] as const) {
    const calls = fake.requests.filter((q) => q.userText === `JOB-PROBE ${String(r.jobId)}`)
    expect(calls).toHaveLength(1)
    expect(calls[0]?.authorization).toBe(auth)
  }
})

test('a forked subagent sees the parent owner and calls the model with the parent credential', async () => {
  const [a, b] = await Promise.all([probe('owner-sa', 'tok-SA', 'probe_subagent'), probe('owner-sb', 'tok-SB', 'probe_subagent')])
  for (const [r, owner, auth] of [[a, 'owner-sa', 'Bearer tok-SA'], [b, 'owner-sb', 'Bearer tok-SB']] as const) {
    const parent = sessionIdFor(owner, 'probe_subagent')
    expect(r.stopReason).toBe('completed')
    // whoami 在子代理里执行：owner 沿父链解析到父会话的用户；sessionId 是子会话自己的 id
    const whoami = r.whoami as { owner?: string; sessionId?: string } | null
    expect(whoami?.owner).toBe(owner)
    expect(whoami?.sessionId).toBe(r.childId)
    expect(whoami?.sessionId).not.toBe(parent)
    // 子代理的模型请求（发出 whoami 调用的那次 + 工具结果之后那次）都带父会话的凭证；prompt 里的父 id 只作对账标签
    const childCalls = fake.requests.filter((q) => q.userText.startsWith('TOOL:whoami:') && q.userText.includes(parent))
    expect(childCalls.length).toBeGreaterThanOrEqual(2)
    for (const q of childCalls) expect(q.authorization).toBe(auth)
  }
})
