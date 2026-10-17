// 浏览器：本机用系统 Edge/Chrome，容器用 Debian 的 chromium（3b 已定事实"浏览器"）。playwright-core 不下载浏览器。
// 进程内只保留一个浏览器（本机与容器内存都紧），每个任务一个上下文，用完即关。
import { existsSync } from 'node:fs'
import { chromium, type Browser, type BrowserContext } from 'playwright-core'

export const BROWSER_CANDIDATES: readonly string[] = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
]

export function resolveBrowserExecutable(explicit: string | undefined, exists: (path: string) => boolean = existsSync): string {
  if (explicit) {
    if (!exists(explicit)) throw new Error(`RENDER_BROWSER_PATH 指向的浏览器不存在：${explicit}`)
    return explicit
  }
  const found = BROWSER_CANDIDATES.find((candidate) => exists(candidate))
  if (!found) throw new Error('找不到 Chromium、Edge 或 Chrome：请设置 RENDER_BROWSER_PATH')
  return found
}

/** WebRTC 加固：页面脚本不得经 WebRTC 泄露本机 IP 或访问 STUN（只影响网络，不影响字体与排版） */
export const WEBRTC_ARGS = ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp']

/** 与 maolab 一样不加任何影响字体、颜色与排版的参数（度量要可比）；只加容器需要的两项与 WebRTC 加固，沙箱开关显式打开 */
export function browserArgs(noSandbox: boolean): string[] {
  return ['--disable-dev-shm-usage', '--no-proxy-server', ...WEBRTC_ARGS, ...(noSandbox ? ['--no-sandbox'] : [])]
}

/**
 * 3e T5 实测：playwright 缺省 handleSIGTERM/SIGINT/SIGHUP 为 true，进程收到 SIGTERM 时它先把浏览器关掉，在途导出立即失败交回队列，排空形同虚设。
 * 信号只由 main.ts 处理（停止领新任务、做完手上的任务再退出），浏览器在收尾时由 browsers.close() 关闭。
 */
export function launchOptions(options: { executablePath: string; noSandbox: boolean }) {
  return { executablePath: options.executablePath, headless: true, args: browserArgs(options.noSandbox), handleSIGTERM: false, handleSIGINT: false, handleSIGHUP: false }
}

export function launchBrowser(options: { executablePath: string; noSandbox: boolean }): Promise<Browser> {
  return chromium.launch(launchOptions(options))
}

export function createBrowserPool(launch: () => Promise<Browser>): { get(): Promise<Browser>; close(): Promise<void> } {
  let current: Promise<Browser> | undefined
  let closed = false
  const start = (): Promise<Browser> => {
    if (closed) return Promise.reject(new Error('browser pool closed'))
    return (current = launch())
  }
  // 单飞：并发的 get 只认同一个启动；发现旧浏览器已断开（或上次启动失败）时，只有第一个调用者换新。
  // 关闭后不再启动（Ruling [T7] N2）：挂着的 get 换新时直接拒绝，不在关停后留下浏览器。
  const replace = (stale: Promise<Browser>): Promise<Browser> => {
    if (closed) return Promise.reject(new Error('browser pool closed'))
    if (current === stale || !current) return start()
    return current
  }
  return {
    get() {
      const attempt = current
      if (closed || !attempt) return start()
      return attempt.then((browser) => (browser.isConnected() ? browser : replace(attempt)), () => replace(attempt))
    },
    async close() {
      closed = true
      const browser = current ? await current.catch(() => undefined) : undefined
      current = undefined
      await browser?.close().catch(() => undefined)
    },
  }
}

// tsx/esbuild 可能给函数体注入 __name(...)；page.evaluate 序列化 measureProjection 的源码时浏览器里没有它
const NAME_SHIM = 'globalThis.__name = globalThis.__name || ((fn) => fn)'

/** 上下文内所有 Playwright 操作的默认时限（采集另有总时限，这里兜住没显式给时限的调用） */
export const CONTEXT_DEFAULT_TIMEOUT_MS = 45_000
/** 关上下文最多等这么久；超时说明浏览器卡住了，直接关掉浏览器，浏览器池下次 get 会重启（Ruling [T7] N3） */
export const CONTEXT_CLOSE_GRACE_MS = 5_000

function within(promise: Promise<unknown>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const expired = new Promise<boolean>((done) => { timer = setTimeout(() => done(false), ms) })
  return Promise.race([promise.then(() => true, () => true), expired]).finally(() => clearTimeout(timer))
}

export async function withProjectionContext<T>(browser: Browser, fn: (context: BrowserContext) => Promise<T>, options: { closeGraceMs?: number } = {}): Promise<T> {
  // serviceWorkers: 'block'：注册的 service worker 不能绕开 context.route 自己取数（Ruling [T7] I2）
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, serviceWorkers: 'block' })
  try {
    context.setDefaultTimeout(CONTEXT_DEFAULT_TIMEOUT_MS)
    context.setDefaultNavigationTimeout(CONTEXT_DEFAULT_TIMEOUT_MS)
    await context.addInitScript({ content: NAME_SHIM })
    return await fn(context)
  } finally {
    const grace = options.closeGraceMs ?? CONTEXT_CLOSE_GRACE_MS
    if (!(await within(context.close(), grace))) await within(browser.close(), grace)
  }
}
