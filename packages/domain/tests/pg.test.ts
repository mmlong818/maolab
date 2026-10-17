import net from 'node:net'
import type pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest'
import { createPool, POOL_CONNECTION_TIMEOUT_MS } from '../src/pg.ts'

afterEach(() => { vi.restoreAllMocks() })

// 控制器裁决 [T8]：取连接也要有上限（池满或连不上时 statement_timeout 管不到），否则召回会挂在 connect 上。
// 按行为断言（不读 pg 的私有字段）：本机起一个只接受 TCP、从不回 PG 握手的"黑洞"服务，取连接必须在上限内失败。
describe('connection acquire timeout', () => {
  let server: net.Server
  let url: string
  const sockets = new Set<net.Socket>()
  beforeAll(async () => {
    server = net.createServer((socket) => { sockets.add(socket); socket.on('error', () => undefined) })
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    url = `postgresql://u:p@127.0.0.1:${(server.address() as net.AddressInfo).port}/db`
  })
  afterAll(async () => {
    for (const s of sockets) s.destroy()
    await new Promise((r) => server.close(r))
  })
  const failsWithin = async (pool: pg.Pool, ms: number) => {
    const started = Date.now()
    await expect(pool.connect()).rejects.toThrow(/timeout/i)
    const took = Date.now() - started
    await pool.end()
    expect(took).toBeLessThan(ms)
    return took
  }

  test('an explicit option bounds the wait', async () => {
    await failsWithin(createPool(url, { connectionTimeoutMillis: 200 }), 3_000)
  })

  test('YUNYI_PG_CONNECT_TIMEOUT_MS overrides the default; bad values are refused', async () => {
    const saved = process.env.YUNYI_PG_CONNECT_TIMEOUT_MS
    try {
      process.env.YUNYI_PG_CONNECT_TIMEOUT_MS = '200'
      await failsWithin(createPool(url), 3_000)
      process.env.YUNYI_PG_CONNECT_TIMEOUT_MS = '0'
      expect(() => createPool(url)).toThrow(/YUNYI_PG_CONNECT_TIMEOUT_MS/)
    } finally {
      if (saved === undefined) delete process.env.YUNYI_PG_CONNECT_TIMEOUT_MS
      else process.env.YUNYI_PG_CONNECT_TIMEOUT_MS = saved
    }
  })

  test('the default is finite', async () => {
    const saved = process.env.YUNYI_PG_CONNECT_TIMEOUT_MS
    delete process.env.YUNYI_PG_CONNECT_TIMEOUT_MS
    try {
      const took = await failsWithin(createPool(url), POOL_CONNECTION_TIMEOUT_MS + 3_000)
      expect(took).toBeGreaterThanOrEqual(POOL_CONNECTION_TIMEOUT_MS - 100)
    } finally {
      if (saved !== undefined) process.env.YUNYI_PG_CONNECT_TIMEOUT_MS = saved
    }
  }, 15_000)
})

test('an idle pool error is logged generically and does not throw', async () => {
  const writes: string[] = []
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: unknown) => { writes.push(String(chunk)); return true })
  const url = 'postgresql://secret-user:secret-pass@127.0.0.1:1/db'
  const pool = createPool(url)
  const err = Object.assign(new Error(`connection to ${url} terminated`), { code: '57P01' })
  expect(() => pool.emit('error', err)).not.toThrow()
  expect(writes.join('')).toContain('idle pg client error (57P01)')
  expect(writes.join('')).not.toMatch(/secret|127\.0\.0\.1|terminated/)
  await pool.end()
})
