import { expect, test } from 'vitest'
import { browserArgs, launchOptions, resolveBrowserExecutable } from '../src/browser.ts'

test('an explicit browser path wins and must exist', () => {
  expect(resolveBrowserExecutable('/opt/chrome', (p) => p === '/opt/chrome')).toBe('/opt/chrome')
  expect(() => resolveBrowserExecutable('/opt/missing', () => false)).toThrow(/RENDER_BROWSER_PATH/)
})

test('without one the first installed candidate is used: Debian chromium before desktop Edge', () => {
  const installed = new Set(['/usr/bin/chromium', 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'])
  expect(resolveBrowserExecutable(undefined, (p) => installed.has(p))).toBe('/usr/bin/chromium')
  expect(resolveBrowserExecutable(undefined, (p) => p.endsWith('msedge.exe'))).toMatch(/msedge\.exe$/)
  expect(() => resolveBrowserExecutable(undefined, () => false)).toThrow(/RENDER_BROWSER_PATH/)
})

test('launch arguments never touch fonts or layout; the sandbox switch is opt-in', () => {
  expect(browserArgs(false)).toEqual(['--disable-dev-shm-usage', '--no-proxy-server', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp'])
  expect(browserArgs(true)).toEqual(['--disable-dev-shm-usage', '--no-proxy-server', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp', '--webrtc-ip-handling-policy=disable_non_proxied_udp', '--no-sandbox'])
})

// 3e T5 实测：playwright 缺省 handleSIGTERM 为 true，worker 收到 SIGTERM 时浏览器被它关掉，在途导出 20 毫秒内记 RENDER_INTERNAL 交回队列——排空形同虚设。
// 信号只由 main.ts 处理（停止领新任务、做完手上的再退出），浏览器在收尾时由 browsers.close() 关闭。
test('the browser does not react to process signals itself, so a SIGTERM drain can finish the job in hand', () => {
  const options = launchOptions({ executablePath: '/usr/bin/chromium', noSandbox: true })
  expect(options).toMatchObject({ executablePath: '/usr/bin/chromium', headless: true, handleSIGTERM: false, handleSIGINT: false, handleSIGHUP: false })
  expect(options.args).toEqual(browserArgs(true))
})
