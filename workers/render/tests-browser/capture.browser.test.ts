import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { projectionRenderUrl } from '@maolab/course'
import type { Browser } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { launchBrowser, withProjectionContext } from '../src/browser.ts'
import { captureProjection, ProjectionPageError } from '../src/capture.ts'
import { installProjectionRoutes, type ProjectionDataSource } from '../src/page-host.ts'
import { pngSize } from '../src/png.ts'
import { startStaticServer } from '../src/static-server.ts'
import { solidPng } from '../tests/helpers/png.ts'
import { browserForTests, noSandbox } from './helpers.ts'

const executablePath = browserForTests()
const FIXTURE = fileURLToPath(new URL('./fixture/', import.meta.url))
const ARTIFACT = `ar_${'c'.repeat(40)}`
const slides = [
  { title: '光的折射', titlePx: 48, body: '筷子在水面处看起来折断了。', bodyPx: 30, image: `/api/prep/artifacts/${ARTIFACT}` },
  { title: '缺图的一页', titlePx: 48, body: '这页的图片取不到。', bodyPx: 30, image: `/api/prep/artifacts/ar_${'d'.repeat(40)}` },
]
const source = (courseId = 'fixture'): ProjectionDataSource => ({
  courseId,
  course: async () => ({ id: courseId, slides }),
  artifact: async (id) => (id === ARTIFACT ? { bytes: solidPng(4, 3), contentType: 'image/png' } : undefined),
})

describe.skipIf(!executablePath)('capture through the intercepted render page', () => {
  let browser: Browser
  let server: Awaited<ReturnType<typeof startStaticServer>>
  beforeAll(async () => {
    server = await startStaticServer(FIXTURE)
    browser = await launchBrowser({ executablePath: executablePath!, noSandbox })
  })
  afterAll(async () => {
    await browser?.close()
    await server?.close()
  })

  test('serves only this course and this owner\'s artifacts, blocks the outside world, and measures the stage', async () => {
    await withProjectionContext(browser, async (context) => {
      const log = await installProjectionRoutes(context, server.origin, source())
      const shot = await captureProjection(context, projectionRenderUrl(server.origin, 'fixture', 1), 1, { timeoutMs: 20_000, settle: 'gate' })
      expect(shot.metrics).toMatchObject({ stageWidth: 1920, stageHeight: 1080, minimumFontPx: 30, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0 })
      expect(shot.metrics.visualElementCount).toBeGreaterThanOrEqual(1)
      expect(pngSize(shot.screenshot)).toEqual({ width: 1920, height: 1080 })
      expect(log.served).toEqual(['/api/prep/render/fixture/', `/api/prep/artifacts/${ARTIFACT}`])
      expect(log.blocked).toContain('https://example.com')
    })
  })

  test('an artifact this owner does not have is a broken image', async () => {
    await withProjectionContext(browser, async (context) => {
      const log = await installProjectionRoutes(context, server.origin, source())
      const shot = await captureProjection(context, projectionRenderUrl(server.origin, 'fixture', 2), 2, { timeoutMs: 20_000, settle: 'export' })
      expect(shot.metrics.brokenImageCount).toBe(1)
      expect(log.notFound).toEqual([`/api/prep/artifacts/ar_${'d'.repeat(40)}`])
    })
  })

  test('another course id gets 404 and the page reports it as a non-retryable page error', async () => {
    await withProjectionContext(browser, async (context) => {
      await installProjectionRoutes(context, server.origin, source('fixture'))
      const error = await captureProjection(context, projectionRenderUrl(server.origin, 'someone-else', 1), 1, { timeoutMs: 20_000, settle: 'gate' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ProjectionPageError)
      expect(error).toMatchObject({ code: 'RENDER_PAGE_ERROR', message: expect.stringContaining('HTTP 404') })
    })
  })

  test('a page that never becomes ready times out as a retryable error', async () => {
    await withProjectionContext(browser, async (context) => {
      await installProjectionRoutes(context, server.origin, source())
      const error = await captureProjection(context, `${projectionRenderUrl(server.origin, 'fixture', 1)}&hang=1`, 1, { timeoutMs: 2_000, settle: 'gate' }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'RENDER_TIMEOUT' })
    })
  })

  // 夹具目录里放了 api/secret.txt：静态服务像 Nginx 一样先解码、规范化路径再找文件，放行到它就会拿到 SECRET
  test('encoded, doubled-slash, dot-segment and upper-case /api paths never reach the page origin', async () => {
    await withProjectionContext(browser, async (context) => {
      const log = await installProjectionRoutes(context, server.origin, source())
      const page = await context.newPage()
      await page.goto(`${server.origin}/prep/render/?hang=1`)
      const results = await page.evaluate(async (paths: string[]) => Promise.all(paths.map(async (path) => {
        try {
          const res = await fetch(path, { cache: 'no-store' })
          return `${res.status}:${(await res.text()).trim()}`
        } catch {
          return 'aborted'
        }
      })), ['/%61pi/secret.txt', '/.//api/secret.txt', '/a/..%2fapi/secret.txt', '/API/secret.txt', '/%2561pi/secret.txt', '/api', '/api/secret.txt', '/a/..%5capi/secret.txt', '/api/%252e%252e/secret.txt', '/api/x%252f..%252f..%252fsecret.txt'])
      for (const result of results) expect(result).not.toContain('SECRET')
      expect(results).toEqual(['404:', '404:', 'aborted', '404:', 'aborted', '404:', '404:', 'aborted', 'aborted', 'aborted'])
      // 日志写法随浏览器版本而异：Edge 把 %61 规范成 a（/api/secret.txt），Chromium 155 保留原样（/%61pi/secret.txt）；
      // 核心断言：上面每条结果都不含 SECRET；任何一条都没有被当成静态文件放行（served 里没有 secret.txt）
      // 含 %25 的（多重编码）一律拦下：Nginx 只解一次，%252e%252e 到它那里仍在 /api/ 下，而多轮解码再解析点段会把 api 段消掉
      expect(log.served.filter((path) => /secret/i.test(path))).toEqual([])
      for (const path of ['/%2561pi/secret.txt', '/a/..%2fapi/secret.txt', '/a/..%5capi/secret.txt', '/api/%252e%252e/secret.txt', '/api/x%252f..%252f..%252fsecret.txt']) expect(log.blocked).toContain(path)
      expect(log.notFound).toHaveLength(5)
      expect(log.notFound.map((path) => path.replace('%61', 'a')).sort()).toEqual(['/api/secret.txt', '//api/secret.txt', '/API/secret.txt', '/api', '/api/secret.txt'].sort())
    })
  })

  test('websockets are closed without ever connecting, to any origin', async () => {
    const upgrades: string[] = []
    const wsServer = createServer((_req, res) => res.writeHead(404).end())
    wsServer.on('upgrade', (req, socket) => { upgrades.push(req.url ?? ''); socket.destroy() })
    await new Promise<void>((ready) => wsServer.listen(0, '127.0.0.1', ready))
    const { port } = wsServer.address() as AddressInfo
    try {
      await withProjectionContext(browser, async (context) => {
        const log = await installProjectionRoutes(context, server.origin, source())
        const page = await context.newPage()
        await page.goto(`${server.origin}/prep/render/?hang=1`)
        const outcome = await page.evaluate((url: string) => new Promise<string>((done) => {
          const ws = new WebSocket(url)
          ws.onopen = () => done('open')
          ws.onclose = () => done('closed')
        }), `ws://127.0.0.1:${port}/socket`)
        expect(outcome).toBe('closed')
        expect(upgrades).toEqual([])
        expect(log.blocked).toContain(`ws://127.0.0.1:${port}`)
      })
    } finally {
      await new Promise<void>((done) => wsServer.close(() => done()))
    }
  })

  test('a data source that throws answers 500, is logged, and does not crash the process', async () => {
    const throwing: ProjectionDataSource = {
      courseId: 'fixture',
      course: async () => { throw new Error('pg down') },
      artifact: async () => { throw new Error('pg down') },
    }
    await withProjectionContext(browser, async (context) => {
      const log = await installProjectionRoutes(context, server.origin, throwing)
      const error = await captureProjection(context, projectionRenderUrl(server.origin, 'fixture', 1), 1, { timeoutMs: 20_000, settle: 'gate' }).catch((e: unknown) => e)
      expect(error).toMatchObject({ code: 'RENDER_PAGE_ERROR', message: expect.stringContaining('HTTP 500') })
      const page = await context.newPage()
      await page.goto(`${server.origin}/prep/render/?hang=1`)
      const status = await page.evaluate(async (path: string) => (await fetch(path)).status, `/api/prep/artifacts/${ARTIFACT}`)
      expect(status).toBe(500)
      expect(log.failed).toEqual(['/api/prep/render/fixture/', `/api/prep/artifacts/${ARTIFACT}`])
    })
  })

  test.each(['text/html', 'image/gif', 'image/x-icon'])('artifacts outside the image allowlist (%s) are not served', async (contentType) => {
    const other: ProjectionDataSource = { ...source(), artifact: async () => ({ bytes: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), contentType }) }
    await withProjectionContext(browser, async (context) => {
      const log = await installProjectionRoutes(context, server.origin, other)
      const page = await context.newPage()
      await page.goto(`${server.origin}/prep/render/?hang=1`)
      const status = await page.evaluate(async (path: string) => (await fetch(path)).status, `/api/prep/artifacts/${ARTIFACT}`)
      expect(status).toBe(404)
      expect(log.served).toEqual([])
      expect(log.notFound).toEqual([`/api/prep/artifacts/${ARTIFACT}`])
    })
  })

  test('svg artifacts are served with a locking CSP and nosniff, and a script inside never runs even when opened directly (Ruling [final])', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="4" height="3"><script>document.documentElement.setAttribute("data-ran", "1")</script><rect width="4" height="3" fill="red"/></svg>'
    const grid: ProjectionDataSource = { ...source(), artifact: async () => ({ bytes: new TextEncoder().encode(svg), contentType: 'image/svg+xml' }) }
    await withProjectionContext(browser, async (context) => {
      const log = await installProjectionRoutes(context, server.origin, grid)
      const page = await context.newPage()
      await page.goto(`${server.origin}/prep/render/?hang=1`)
      const headers = await page.evaluate(async (path: string) => {
        const response = await fetch(path)
        return { status: response.status, type: response.headers.get('content-type'), csp: response.headers.get('content-security-policy'), nosniff: response.headers.get('x-content-type-options') }
      }, `/api/prep/artifacts/${ARTIFACT}`)
      expect(headers).toEqual({ status: 200, type: 'image/svg+xml', csp: "default-src 'none'; style-src 'unsafe-inline'; img-src data:", nosniff: 'nosniff' })
      // 直接导航到 svg：CSP 不许脚本执行
      const direct = await context.newPage()
      await direct.goto(`${server.origin}/api/prep/artifacts/${ARTIFACT}`)
      expect(await direct.evaluate(() => document.documentElement.getAttribute('data-ran'))).toBeNull()
      expect(log.served).toEqual([`/api/prep/artifacts/${ARTIFACT}`, `/api/prep/artifacts/${ARTIFACT}`])
    })
  })

  test('a page that stalls inside an evaluate still fails within the one overall deadline', async () => {
    await withProjectionContext(browser, async (context) => {
      await installProjectionRoutes(context, server.origin, source())
      const started = Date.now()
      const error = await captureProjection(context, `${projectionRenderUrl(server.origin, 'fixture', 1)}&stall=1`, 1, { timeoutMs: 3_000, settle: 'export' }).catch((e: unknown) => e)
      expect(error).toBeInstanceOf(ProjectionPageError)
      expect(error).toMatchObject({ code: 'RENDER_TIMEOUT' })
      expect(Date.now() - started).toBeLessThan(10_000)
    })
  }, 30_000)
})
