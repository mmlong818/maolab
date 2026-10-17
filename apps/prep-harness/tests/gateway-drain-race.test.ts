// 独立宿主：drain 对宿主是终态，所以竞态与空密钥用例各自起宿主，不碰 gateway.test.ts 的共享宿主。
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'

let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
let raceHost: Awaited<ReturnType<typeof startHost>>
let emptyKeyHost: Awaited<ReturnType<typeof startHost>>

beforeAll(async () => {
  fake = await startFakeOpenAI()
  ;[raceHost, emptyKeyHost] = await Promise.all([
    startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl }, { readyTimeoutMs: 120_000 }),
    startHost({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_INTERNAL_KEY: '' }, { readyTimeoutMs: 120_000 }),
  ])
}, 180_000)

afterAll(async () => {
  await Promise.all([raceHost?.stop(), emptyKeyHost?.stop()])
  await fake?.close()
})

const run = Date.now().toString(36)

test('drain racing in-flight creates leaves no live session or agent behind', async () => {
  const ids = Array.from({ length: 8 }, (_, i) => `s-race-${i}-${run}`)
  const body = (id: string) => ({ sessionId: id, owner: 'or', preset: 'tutor', provider: 'fake', model: 'fake-1' })
  const results = await Promise.all([
    ...ids.map((id) => raceHost.api('POST', '/sessions', body(id))),
    raceHost.api('POST', '/admin/drain'),
  ])
  for (const r of results.slice(0, ids.length)) expect([201, 503]).toContain(r.status)
  // 再排空一次，覆盖 drain 先于部分 create 返回的情形
  await raceHost.api('POST', '/admin/drain')
  for (const id of ids) expect((await raceHost.api('POST', `/sessions/${id}/prompt`, { text: 'x' })).status).toBe(404)
  expect(await (await fetch(`${raceHost.base}/healthz`)).json()).toEqual({ ok: false, service: 'harness', draining: true })
  const stats = await raceHost.api('GET', '/admin/stats')
  expect(stats.json).toEqual({ sessions: 0, agents: 0 })
})

test('an empty configured key makes every keyed route 401 while healthz stays open', async () => {
  expect((await emptyKeyHost.api('POST', '/sessions', { sessionId: `s-ek-${run}`, owner: 'u' })).status).toBe(401)
  expect((await emptyKeyHost.api('POST', '/sessions', { sessionId: `s-ek-${run}`, owner: 'u' }, { key: '' })).status).toBe(401)
  expect((await emptyKeyHost.api('POST', '/admin/drain')).status).toBe(401)
  expect((await fetch(`${emptyKeyHost.base}/healthz`)).status).toBe(200)
})
