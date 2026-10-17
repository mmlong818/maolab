import { afterAll, beforeAll, expect, test } from 'vitest'
import { startHost } from './helpers/host.ts'

let host: Awaited<ReturnType<typeof startHost>>
beforeAll(async () => { host = await startHost({}, { readyTimeoutMs: 120_000 }) }, 150_000)
afterAll(async () => { await host?.stop() })

test('the host boots the maolab-prep-host profile and answers /healthz without a key', async () => {
  const res = await fetch(`${host.base}/healthz`)
  expect(res.status).toBe(200)
  expect(await res.json()).toEqual({ ok: true, service: 'harness' })
})
