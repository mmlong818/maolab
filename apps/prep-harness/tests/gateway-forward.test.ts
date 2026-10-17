import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let host: Awaited<ReturnType<typeof startHost>>
const run = Date.now().toString(36)
beforeAll(async () => {
  fake = await startFakeOpenAI()
  host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl }, { readyTimeoutMs: 120_000 })
}, 150_000)
afterAll(async () => { await host?.stop(); await fake?.close() })

test('a brand-new yunyi/* event reaches SSE without gateway changes; internal events and the agent do not', async () => {
  const id = `s-fwd-${run}`
  expect((await host.api('POST', '/sessions', { sessionId: id, owner: 'owner-fwd', preset: 'probe-other', provider: 'fake', model: 'fake-1' })).status).toBe(201)
  const s = host.events(id)
  await host.api('POST', `/sessions/${id}/prompt`, { text: 'TOOL:probe_emit:{"type":"yunyi/probe-new","payload":{"n":1}}' })
  const frame = await s.waitFor((e) => e.type === 'yunyi/probe-new')
  expect(frame).toEqual({ type: 'yunyi/probe-new', n: 1 })
  await s.waitFor((e) => e.type === 'turn/end')
  // 不可序列化的帧被丢弃，同一会话后续事件照常到达
  const seen = s.received.length
  await host.api('POST', `/sessions/${id}/prompt`, { text: 'TOOL:probe_emit:{"type":"yunyi/probe-big","payload":{"$big":true}}' })
  await s.waitFor((e) => e.type === 'turn/end' && s.received.indexOf(e) >= seen)
  await host.api('POST', `/sessions/${id}/prompt`, { text: 'TOOL:probe_emit:{"type":"yunyi/probe-after","payload":{"ok":true}}' })
  await s.waitFor((e) => e.type === 'yunyi/probe-after')
  await s.close()
  expect(s.received.some((e) => e.type === 'yunyi/probe-big')).toBe(false)
  expect(s.received.some((e) => e.type === 'probe/internal')).toBe(false)
  expect(JSON.stringify(s.received)).not.toContain('must-not-leak')
  for (const e of s.received.filter((f) => String(f.type).startsWith('yunyi/'))) expect(e).not.toHaveProperty('agent')
})
