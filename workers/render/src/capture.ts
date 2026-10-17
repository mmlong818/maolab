// 采集：节奏照抄 maolab（3b 已定事实"一个渲染页，两种取数"）。
// 门禁：domcontentloaded → 等 body[data-export-ready=N] → measureProjection → 截图；
// 导出：networkidle → 等同一信号 → document.fonts.ready → 300ms → 截图（maolab export 路由原样）。
import { measureProjection, type ProjectionRenderMetrics } from '@maolab/course'
import type { BrowserContext } from 'playwright-core'

export interface CaptureOptions {
  timeoutMs: number
  settle: 'gate' | 'export'
}

export interface CapturedProjection {
  screenshot: Buffer
  metrics: ProjectionRenderMetrics
}

export class ProjectionPageError extends Error {
  readonly code: 'RENDER_PAGE_ERROR' | 'RENDER_TIMEOUT'

  constructor(code: 'RENDER_PAGE_ERROR' | 'RENDER_TIMEOUT', message: string) {
    super(message)
    this.code = code
    this.name = 'ProjectionPageError'
  }
}

const PAGE_CLOSE_GRACE_MS = 5_000

/**
 * 整个采集（导航、等就绪、字体、度量、截图）共用一个总时限 timeoutMs（Ruling [T7] I4）。
 * page.evaluate 本身没有超时，页面卡死时只能靠总时限；超时后关页，统一报 RENDER_TIMEOUT。
 */
export async function captureProjection(context: BrowserContext, url: string, pageNumber: number, options: CaptureOptions): Promise<CapturedProjection> {
  const deadline = Date.now() + options.timeoutMs
  const remaining = () => Math.max(1, deadline - Date.now())
  const timeoutError = () => new ProjectionPageError('RENDER_TIMEOUT', `渲染页第 ${pageNumber} 页在 ${options.timeoutMs}ms 内没有就绪`)
  const page = await context.newPage()
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(timeoutError()), remaining()) })
  const work = (async (): Promise<CapturedProjection> => {
    await page.goto(url, { waitUntil: options.settle === 'export' ? 'networkidle' : 'domcontentloaded', timeout: remaining() })
    const handle = await page.waitForFunction((expected: string) => {
      if (document.body?.dataset.exportReady === expected) return 'ready'
      const failed = document.querySelector('[data-render-error]')
      return failed ? `error:${failed.getAttribute('data-render-error') ?? ''}` : false
    }, String(pageNumber), { timeout: remaining() })
    const state = String(await handle.jsonValue())
    if (state !== 'ready') throw new ProjectionPageError('RENDER_PAGE_ERROR', `渲染页报错：${state.slice('error:'.length)}`)
    if (options.settle === 'export') {
      await page.evaluate(() => document.fonts.ready.then(() => undefined))
      await page.waitForTimeout(Math.min(300, remaining()))
    }
    const metrics = await page.evaluate(measureProjection)
    const screenshot = await page.screenshot({ type: 'png', fullPage: false, timeout: remaining() })
    return { screenshot, metrics }
  })()
  // 超时后 work 仍可能在关页时拒绝：吞掉，避免未处理的拒绝
  work.catch(() => undefined)
  try {
    return await Promise.race([work, expired])
  } catch (error) {
    if (error instanceof ProjectionPageError) throw error
    if (error instanceof Error && error.name === 'TimeoutError') throw timeoutError()
    throw error
  } finally {
    clearTimeout(timer)
    expired.catch(() => undefined)
    // 卡死的页面关闭也可能拖住：最多等一小会儿，余下交给 withProjectionContext 关上下文
    let grace: ReturnType<typeof setTimeout> | undefined
    await Promise.race([page.close().catch(() => undefined), new Promise((done) => { grace = setTimeout(done, PAGE_CLOSE_GRACE_MS) })])
    clearTimeout(grace)
  }
}
