import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let host: Awaited<ReturnType<typeof startHost>>
beforeAll(async () => {
  fake = await startFakeOpenAI()
  host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_IDLE_DISPOSE_MS: '1500' })
}, 120_000)
afterAll(async () => { await host?.stop(); await fake?.close() })

const create = async (id: string) => expect((await host.api('POST', '/sessions', { sessionId: id, owner: 'o1', preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)

test('prompt uses the caller message id; a non-UUID id is rejected', async () => {
  await create('s-turns-1')
  const s = host.events('s-turns-1')
  const id = '33333333-3333-4333-8333-333333333333'
  expect((await host.api('POST', '/sessions/s-turns-1/prompt', { text: '你好', messageId: 'nope' })).status).toBe(400)
  expect(((await host.api('POST', '/sessions/s-turns-1/prompt', { text: '你好', messageId: id })).json as { messageId: string }).messageId).toBe(id)
  const final = await s.waitFor((e) => e.type === 'yunyi/turn-final')
  expect(final.runId).toBe(id)
  expect(typeof final.assistantMessageId).toBe('string')
  expect(final.outcome).toBe('completed')
  await s.close()
})

test('events?replay=0 skips the buffer and only streams new frames', async () => {
  // 自建会话并保持一条回放订阅：会话不受 idleMs 回收时序影响，缓冲里确有上一轮的帧
  await create('s-turns-replay')
  const live = host.events('s-turns-replay')
  await host.api('POST', '/sessions/s-turns-replay/prompt', { text: '你好' })
  await live.waitFor((e) => e.type === 'yunyi/turn-final')
  const res = await fetch(`${host.base}/sessions/s-turns-replay/events?replay=0`, { headers: { 'x-yunyi-internal': 'test-internal-key' } })
  expect(res.status).toBe(200)
  const reader = res.body!.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  expect(first).toContain(': connected')
  const next = await Promise.race([reader.read().then(() => 'frame'), new Promise((r) => setTimeout(() => r('quiet'), 500))])
  expect(next).toBe('quiet')
  await reader.cancel()
  await live.close()
})

test('idle sessions without a running turn or subscriber are disposed', async () => {
  await create('s-turns-idle')
  await new Promise((r) => setTimeout(r, 4_000))
  expect((await host.api('POST', '/sessions/s-turns-idle/prompt', { text: 'x' })).status).toBe(404)
}, 15_000)

// 控制器提示（T3）：下一回合的 enterTurnState（pre-step）不得早于上一回合的定稿。
// 第一轮还在流式输出时就发第二条：网关要等第一轮 turn-final 发出后才把第二条交给 agent。
test('a prompt sent while a turn runs is held until that turn is finalized', async () => {
  await create('s-turns-order')
  const s = host.events('s-turns-order')
  const a = '55555555-5555-4555-8555-555555555555'
  const b = '66666666-6666-4666-8666-666666666666'
  await host.api('POST', '/sessions/s-turns-order/prompt', { text: 'first please be slow', messageId: a })
  await s.waitFor((e) => e.type === 'agent/assistant-stream' && (e.frame as { type?: string } | undefined)?.type === 'chunk')
  expect(((await host.api('POST', '/sessions/s-turns-order/prompt', { text: 'second turn', messageId: b })).json as { messageId: string }).messageId).toBe(b)
  const finalB = await s.waitFor((e) => e.type === 'yunyi/turn-final' && e.runId === b, 60_000)
  const finalA = s.received.find((e) => e.type === 'yunyi/turn-final' && e.runId === a)!
  expect(finalA).toBeDefined()
  const iFinalA = s.received.indexOf(finalA)
  const iStart2 = s.received.findIndex((e) => e.type === 'turn/start' && (e.data as { turn?: number } | undefined)?.turn === 2)
  expect(iStart2).toBeGreaterThan(-1)
  expect(iFinalA).toBeLessThan(iStart2)
  expect(finalA.reply).toContain('w0')
  expect(finalA.outcome).toBe('completed')
  expect(finalB.reply).toContain('second turn')
  await s.close()
}, 60_000)

test('a turn cancelled right after its prompt ends with a cancelled turn-final and does not block the next prompt', async () => {
  await create('s-turns-cancel')
  const s = host.events('s-turns-cancel')
  const a = '77777777-7777-4777-8777-777777777777'
  const b = '88888888-8888-4888-8888-888888888888'
  await host.api('POST', '/sessions/s-turns-cancel/prompt', { text: 'please be slow', messageId: a })
  expect((await host.api('POST', '/sessions/s-turns-cancel/cancel')).status).toBe(200)
  const cancelled = await s.waitFor((e) => e.type === 'yunyi/turn-final' && e.runId === a)
  expect(cancelled.cancelled).toBe(true)
  await host.api('POST', '/sessions/s-turns-cancel/prompt', { text: 'after cancel', messageId: b })
  const final = await s.waitFor((e) => e.type === 'yunyi/turn-final' && e.runId === b)
  // 被取消的学生消息仍留在日志里，fake 取连续 user 段的第一条作原话，所以这里不比回复文字，只确认第二条确实进了模型请求
  expect(final.outcome).toBe('completed')
  expect(fake.requests.some((r) => r.allText.includes('after cancel'))).toBe(true)
  await s.close()
}, 30_000)

test('the prep host takes no session context: a create carrying one is refused with 400', async () => {
  const res = await host.api('POST', '/sessions', { sessionId: `s-ctx-${Date.now().toString(36)}`, owner: 'o1', preset: 'prep', provider: 'fake', model: 'fake-1', context: { mode: 'question', grade: '初二' } })
  expect(res.status).toBe(400)
})
