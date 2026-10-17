import { afterAll, beforeAll, expect, test } from 'vitest'
import { createHarnessClient, HarnessError, turnFinalOf } from '../src/harness/client.ts'
import { startFakeOpenAI } from '../../prep-harness/tests/helpers/fake-openai.ts'
import { INTERNAL_KEY, startHost } from '../../prep-harness/tests/helpers/host.ts'

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let host: Awaited<ReturnType<typeof startHost>>
beforeAll(async () => { fake = await startFakeOpenAI(); host = await startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl }) }, 120_000)
afterAll(async () => { await host?.stop(); await fake?.close() })

const input = (sessionId: string) => ({ sessionId, owner: 't_x', preset: 'prep' as const, provider: 'fake', model: 'fake-1' })
test('ensure creates then reports live; a turn streams until turn-final; dispose is idempotent', async () => {
  const client = createHarnessClient(host.base, INTERNAL_KEY)
  expect(await client.ensure(input('s-hc-1'))).toBe('created')
  expect(await client.ensure(input('s-hc-1'))).toBe('live')
  const events = await client.openEvents('s-hc-1')
  const runId = crypto.randomUUID()
  await client.prompt('s-hc-1', '你好', runId)
  const types: string[] = []
  for await (const f of events.frames) {
    types.push(f.type)
    if (f.type === 'yunyi/turn-final' && f.runId === runId) break
  }
  events.close()
  expect(types).toContain('agent/assistant-stream')
  await client.dispose('s-hc-1')
  await client.dispose('s-hc-1')
  await expect(client.prompt('s-hc-1', 'x', crypto.randomUUID())).rejects.toBeInstanceOf(HarnessError)
})
test('a wrong internal key is a 401 HarnessError', async () => {
  await expect(createHarnessClient(host.base, 'wrong').ensure(input('s-hc-2'))).rejects.toMatchObject({ status: 401 })
})
test('prompt 200 only queues: over the cap is 429 (queueFull); cancel drops queued messages with a cancelled turn-final', async () => {
  const client = createHarnessClient(host.base, INTERNAL_KEY)
  expect(await client.ensure(input('s-hc-3'))).toBe('created')
  const events = await client.openEvents('s-hc-3')
  const it = events.frames[Symbol.asyncIterator]()
  const first = crypto.randomUUID()
  await client.prompt('s-hc-3', 'slow 慢一点', first, [])
  for (;;) { const { value } = await it.next(); if (value?.type === 'agent/assistant-stream') break }
  const queued = Array.from({ length: 8 }, () => crypto.randomUUID())
  for (const id of queued) await client.prompt('s-hc-3', `排队 ${id}`, id, [])
  const over = await client.prompt('s-hc-3', '再来一条', crypto.randomUUID(), []).catch((e: unknown) => e)
  expect(over).toBeInstanceOf(HarnessError)
  expect(over).toMatchObject({ status: 429, queueFull: true, sessionUnavailable: false })
  await client.cancel('s-hc-3')
  const cancelled = new Set<string>()
  while (cancelled.size < queued.length) {
    const { value, done } = await it.next()
    if (done) break
    for (const id of queued) if (turnFinalOf(value, id)?.cancelled) cancelled.add(id)
  }
  events.close()
  expect(cancelled.size).toBe(queued.length)
  await client.dispose('s-hc-3')
})
test('resume by another owner is 403 and an unknown live session is 404; both are sessionUnavailable', async () => {
  const client = createHarnessClient(host.base, INTERNAL_KEY)
  expect(await client.ensure(input('s-hc-4'))).toBe('created')
  const events = await client.openEvents('s-hc-4')
  const runId = crypto.randomUUID()
  await client.prompt('s-hc-4', '你好', runId, [])
  for await (const f of events.frames) if (turnFinalOf(f, runId)) break
  events.close()
  await client.dispose('s-hc-4')
  const denied = await client.ensure({ ...input('s-hc-4'), owner: 't_other' }).catch((e: unknown) => e)
  expect(denied).toMatchObject({ status: 403, sessionUnavailable: true })
  const missing = await client.prompt('s-hc-never', 'x', crypto.randomUUID()).catch((e: unknown) => e)
  expect(missing).toMatchObject({ status: 404, sessionUnavailable: true })
})
