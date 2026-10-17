import { expect, test } from 'vitest'
import { loadConfig } from '../src/config.ts'

const base = { RENDER_PG_URL: 'postgresql://u:p@db:5432/maolab', RENDER_PAGE_ORIGIN: 'http://frontend:8080/' }

test('defaults are conservative and the origin is normalised', () => {
  const config = loadConfig(base)
  expect(config).toMatchObject({
    pgUrl: base.RENDER_PG_URL, pageOrigin: 'http://frontend:8080', browserPath: undefined, noSandbox: false,
    leaseMs: 120_000, heartbeatMs: 30_000, idleMs: 2_000, navigationTimeoutMs: 45_000, purgeEveryMs: 3_600_000, drainGraceMs: 300_000, healthPort: 8080,
  })
  expect(config.holder).toMatch(/:\d+:[0-9a-f]{8}$/)
})

test('PG_DATABASE_URL is accepted as a fallback and the switches parse', () => {
  const config = loadConfig({ PG_DATABASE_URL: 'postgresql+asyncpg://u:p@db/x', RENDER_PAGE_ORIGIN: 'http://127.0.0.1:3000', RENDER_CHROMIUM_NO_SANDBOX: '1', RENDER_BROWSER_PATH: '/usr/bin/chromium', RENDER_LEASE_MS: '5000', RENDER_HEARTBEAT_MS: '1000', RENDER_HEALTH_PORT: '9000', RENDER_DRAIN_GRACE_MS: '60000' })
  expect(config).toMatchObject({ pgUrl: 'postgresql+asyncpg://u:p@db/x', noSandbox: true, browserPath: '/usr/bin/chromium', leaseMs: 5_000, heartbeatMs: 1_000, healthPort: 9_000, drainGraceMs: 60_000 })
})

test('missing or unsafe settings refuse to start', () => {
  expect(() => loadConfig({ RENDER_PAGE_ORIGIN: 'http://x' })).toThrow(/RENDER_PG_URL/)
  expect(() => loadConfig({ RENDER_PG_URL: 'postgresql://x' })).toThrow(/RENDER_PAGE_ORIGIN/)
  expect(() => loadConfig({ ...base, RENDER_PAGE_ORIGIN: 'file:///tmp' })).toThrow(/RENDER_PAGE_ORIGIN/)
  expect(() => loadConfig({ ...base, RENDER_LEASE_MS: '0' })).toThrow(/RENDER_LEASE_MS/)
  expect(() => loadConfig({ ...base, RENDER_LEASE_MS: '3000', RENDER_HEARTBEAT_MS: '3000' })).toThrow(/心跳/)
})
