import { resolveBrowserExecutable } from '../src/browser.ts'

/** 设了 RENDER_BROWSER_PATH 就必须能用（CI 不许静默跳过）；没设时找不到浏览器则跳过 */
export function browserForTests(): string | undefined {
  if (process.env.RENDER_BROWSER_PATH) return resolveBrowserExecutable(process.env.RENDER_BROWSER_PATH)
  try { return resolveBrowserExecutable(undefined) } catch { return undefined }
}
export const noSandbox = process.env.RENDER_CHROMIUM_NO_SANDBOX === '1'
