import type { Browser } from 'playwright-core'
import { expect, test } from 'vitest'
import { createBrowserPool, withProjectionContext } from '../src/browser.ts'

function fakeBrowser(): Browser & { connected: boolean; closed: number } {
  const browser = { connected: true, closed: 0, isConnected() { return browser.connected }, async close() { browser.closed += 1 } }
  return browser as unknown as Browser & { connected: boolean; closed: number }
}

test('concurrent gets share one launch, also when relaunching after a crash', async () => {
  const launched: ReturnType<typeof fakeBrowser>[] = []
  const pool = createBrowserPool(async () => {
    await new Promise((tick) => setTimeout(tick, 5))
    const browser = fakeBrowser()
    launched.push(browser)
    return browser
  })
  const [a, b] = await Promise.all([pool.get(), pool.get()])
  expect(launched).toHaveLength(1)
  expect(a).toBe(b)

  launched[0]!.connected = false
  const [c, d, e] = await Promise.all([pool.get(), pool.get(), pool.get()])
  expect(launched).toHaveLength(2)
  expect(c).toBe(d)
  expect(d).toBe(e)
  expect(c).toBe(launched[1])

  await pool.close()
  expect(launched[1]!.closed).toBe(1)
})

test('a failed launch is reported to its caller and retried by the next get', async () => {
  let attempts = 0
  const pool = createBrowserPool(async () => {
    attempts += 1
    if (attempts === 1) throw new Error('no browser')
    return fakeBrowser()
  })
  await expect(pool.get()).rejects.toThrow('no browser')
  await expect(pool.get()).resolves.toBeDefined()
  expect(attempts).toBe(2)
})

test('a get still pending when the pool closes does not leave a browser behind', async () => {
  const launched: ReturnType<typeof fakeBrowser>[] = []
  const pool = createBrowserPool(async () => {
    const browser = fakeBrowser()
    launched.push(browser)
    return browser
  })
  await pool.get()
  launched[0]!.connected = false
  const pending = pool.get()
  await pool.close()
  await expect(pending).rejects.toThrow(/closed/)
  await expect(pool.get()).rejects.toThrow(/closed/)
  expect(launched).toHaveLength(1)
})

test('a context that never finishes closing is given up on and its browser is closed, so the pool relaunches', async () => {
  const browser = fakeBrowser()
  const context = {
    setDefaultTimeout() {}, setDefaultNavigationTimeout() {}, async addInitScript() {},
    close: () => new Promise<void>(() => {}),
  }
  ;(browser as unknown as { newContext: () => Promise<unknown> }).newContext = async () => context
  const started = Date.now()
  await expect(withProjectionContext(browser, async () => 'done', { closeGraceMs: 50 })).resolves.toBe('done')
  expect(Date.now() - started).toBeLessThan(2_000)
  expect(browser.closed).toBe(1)
})
