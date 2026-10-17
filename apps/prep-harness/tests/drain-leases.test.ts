// drain 是宿主终态，所以本文件自己起宿主。PG 租约表在 drain / SIGTERM 之后必须为空。
import { afterAll, beforeAll, expect, test } from 'vitest'
import { startFakeOpenAI } from './helpers/fake-openai.ts'
import { startHost } from './helpers/host.ts'
import { pgUrl, query, resetSchema } from './helpers/pg.ts'

const SCHEMA = 'harness_test_drain'
const run = Date.now().toString(36)
const count = async (table: string) => (await query<{ n: number }>(`select count(*)::int as n from ${SCHEMA}.${table}`)).rows[0]?.n

type Host = Awaited<ReturnType<typeof startHost>>
let fake: Awaited<ReturnType<typeof startFakeOpenAI>>
const hosts: Host[] = []
const env = () => ({ FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_PG_URL: pgUrl(), YUNYI_PG_SCHEMA: SCHEMA })

beforeAll(async () => {
  await resetSchema(SCHEMA)
  fake = await startFakeOpenAI()
}, 60_000)

afterAll(async () => {
  await Promise.all(hosts.map((h) => h.stop()))
  await fake?.close()
})

async function oneTurn(h: Host, id: string) {
  expect((await h.api('POST', '/sessions', { sessionId: id, owner: 'owner-drain', preset: 'prep', provider: 'fake', model: 'fake-1' })).status).toBe(201)
  const s = h.events(id)
  await h.api('POST', `/sessions/${id}/prompt`, { text: `hello ${id}` })
  await s.waitFor((e) => e.type === 'turn/end')
  await s.close()
}

test('POST /admin/drain releases every lease and keeps the persisted sessions', async () => {
  const host = await startHost(env(), { readyTimeoutMs: 120_000 })
  hosts.push(host)
  for (const id of [`s-drain-a-${run}`, `s-drain-b-${run}`]) await oneTurn(host, id)
  expect(await count('session_leases')).toBe(2)
  expect((await host.api('POST', '/admin/drain')).status).toBe(200)
  // 不睡不重试：drain 返回前已 settle 持久化层，租约必须已删除
  expect(await count('session_leases')).toBe(0)
  expect(await count('session_headers')).toBe(2)
}, 180_000)

// Windows 没有 POSIX 信号语义：child.kill('SIGTERM') 在 win32 上等同强杀，不会走 dsh 的优雅关闭，所以只在其它平台验证
test.skipIf(process.platform === 'win32')('SIGTERM shuts the host down gracefully and releases its leases', async () => {
  const host = await startHost(env(), { readyTimeoutMs: 120_000 })
  hosts.push(host)
  await oneTurn(host, `s-sigterm-${run}`)
  expect(await count('session_leases')).toBe(1)
  const exited = new Promise<number | null>((r) => host.child.once('exit', (code) => r(code)))
  host.child.kill('SIGTERM')
  // 网关不再自己 process.exit：退出由 dsh 的关停流程负责，退出前已等租约释放
  expect(await exited).toBe(0)
  expect(await count('session_leases')).toBe(0)
}, 180_000)
