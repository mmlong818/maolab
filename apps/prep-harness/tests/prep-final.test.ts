// 3d Task 2：prep 会话在宿主里每回合收到 yunyi/turn-final（runId = api 指定的 messageId）；导师会话的定稿不受影响（finalize.test.ts 等原有测试保证）。
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeCourseLlm } from './helpers/fake-course-llm.ts'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let gateway: Awaited<ReturnType<typeof startFakeCourseLlm>>
let host: Awaited<ReturnType<typeof startHost>>
const run = Date.now().toString(36)

beforeAll(async () => {
  fake = await startFakeOpenAI()
  gateway = await startFakeCourseLlm()
  host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: gateway.baseUrl, YUNYI_PREP_PG_URL: '', YUNYI_PREP_MODEL: 'fake-course' }, { readyTimeoutMs: 120_000 })
}, 150_000)
afterAll(async () => { await host?.stop(); await fake?.close(); await gateway?.close() })

test('prep turns end with a yunyi/turn-final carrying the api messageId, the reply and the tool outcomes; queued turns finish in order', async () => {
  const id = `s-prep-final-${run}`
  expect((await host.api('POST', '/sessions', { sessionId: id, owner: 'teacher-final', credential: 'cred-final', preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)
  const events = host.events(id)
  const first = randomUUID()
  const second = randomUUID()
  // 第二条在第一条进行中发出：网关排队，不抢占
  expect((await host.api('POST', `/sessions/${id}/prompt`, { text: 'TOOL:list_courses:{}', messageId: first })).status).toBe(200)
  expect((await host.api('POST', `/sessions/${id}/prompt`, { text: '谢谢', messageId: second })).status).toBe(200)
  await events.waitFor(() => events.received.filter((f) => f.type === 'yunyi/turn-final').length >= 2, 120_000)
  await events.close()
  const finals = events.received.filter((f) => f.type === 'yunyi/turn-final')
  expect(finals.map((f) => f.runId)).toEqual([first, second])
  expect(finals[0]).toMatchObject({ prep: true, outcome: 'completed', tools: [{ name: 'list_courses', ok: true }] })
  expect(String(finals[0]!.reply)).toContain('工具结果已处理')
  expect(finals[1]).toMatchObject({ prep: true, outcome: 'completed', tools: [] })
  expect(String(finals[1]!.reply)).toContain('echo: 谢谢')
  expect(finals.every((f) => typeof f.assistantMessageId === 'string' && f.assistantMessageId !== '')).toBe(true)
}, 180_000)

// Ruling [T2/T8] F4：api 用同一个 messageId 重试被取消（或失败、超时）的回合；dsh 接受重复 id，重试回合也要收到自己的终帧
test('a retry with the same message id after a cancelled turn gets its own final frame', async () => {
  const id = `s-prep-retry-${run}`
  expect((await host.api('POST', '/sessions', { sessionId: id, owner: 'teacher-retry', credential: 'cred-retry', preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)
  const events = host.events(id)
  const messageId = randomUUID()
  const finals = () => events.received.filter((f) => f.type === 'yunyi/turn-final')
  expect((await host.api('POST', `/sessions/${id}/prompt`, { text: 'slow 重试这一条', messageId })).status).toBe(200)
  await events.waitFor((f) => f.type === 'agent/assistant-stream', 60_000)
  expect((await host.api('POST', `/sessions/${id}/cancel`)).status).toBe(200)
  await events.waitFor(() => finals().length >= 1, 60_000)
  expect(finals()[0]).toEqual({ type: 'yunyi/turn-final', runId: messageId, cancelled: true })
  expect((await host.api('POST', `/sessions/${id}/prompt`, { text: 'slow 重试这一条', messageId })).status).toBe(200)
  await events.waitFor(() => finals().length >= 2, 120_000)
  // 迟到的重复帧：再等一个空闲窗口（fix round 1）
  await new Promise((r) => setTimeout(r, 1500))
  await events.close()
  expect(finals()).toHaveLength(2)
  expect(finals()[1]).toMatchObject({ runId: messageId, prep: true, outcome: 'completed', tools: [] })
  expect(String(finals()[1]!.reply)).toContain('w399')
}, 180_000)
