// 3d：用 Playwright 打开 /prep/，核对面板：课程出现在列表、计划页数、预览舞台渲染出来、质量页逐页状态、导出下载链接。
// 只读核对，不点写操作。token 来自环境变量 PREP_SMOKE_TOKEN（测试库里临时签发的 token），写进 localStorage 的 maolab-prep-token（与登录 SDK 同一个键）。
// 用法：PREP_SMOKE_TOKEN=… corepack pnpm --silent -C workers/render run panel-smoke --base <url> --course <id> --topic <课程题目> --pages <页数> --out <png>
// 退出码 0 = 六项核对全部通过；标准输出最后一行是 JSON 汇总。
// 终审修复（T14 review minor）：计划标题的页数、质量表的行数都要等于 --pages；预览要有课件文字（不只是有舞台根节点），且舞台不超出面板。
import { launchBrowser, resolveBrowserExecutable } from '../src/browser.ts'

const arg = (name: string) => { const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : undefined }
const base = arg('--base')
const courseId = arg('--course')
const topic = arg('--topic')
const out = arg('--out')
const pages = Number(arg('--pages'))
const token = process.env.PREP_SMOKE_TOKEN
if (!base || !courseId || !topic || !out || !token || !Number.isInteger(pages) || pages < 1) { process.stderr.write('用法：panel-smoke --base <url> --course <id> --topic <课程题目> --pages <页数> --out <png>（PREP_SMOKE_TOKEN 环境变量）\n'); process.exit(2) }

const checks: Record<string, boolean> = {}
/** 实测证据（报告用）：各选择器实际命中的个数 */
const evidence: Record<string, number> = {}
let failure: string | undefined
const browser = await launchBrowser({ executablePath: resolveBrowserExecutable(process.env.RENDER_BROWSER_PATH), noSandbox: process.env.RENDER_CHROMIUM_NO_SANDBOX === '1' })
try {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  context.setDefaultTimeout(30_000)
  await context.addInitScript((t) => { localStorage.setItem('maolab-prep-token', t) }, token)
  const page = await context.newPage()
  const renderRequests: string[] = []
  page.on('request', (r) => { if (r.url().includes('/api/prep/render')) renderRequests.push(r.url()) })
  // 面板的标签按钮与课程按钮都按可见文字精确匹配（"计划"不能误配"确认计划"等按钮）
  const tab = (name: string) => page.getByRole('navigation', { name: '面板' }).getByRole('button', { name, exact: true })
  try {
    await page.goto(`${base}/prep/`, { waitUntil: 'networkidle' })
    const courseButton = page.getByRole('button', { name: topic, exact: true })
    await courseButton.waitFor({ state: 'visible' }).catch(() => undefined)
    checks.courseListed = await courseButton.isVisible().catch(() => false)
    await courseButton.click()
    await tab('计划').click()
    // 实测：PlanView 的标题是"计划（N 页 · 状态）"，不是 brief 写的"计划（N 页）"
    const planHeading = page.getByText(new RegExp(`计划（${pages} 页[ ·）]`))
    await planHeading.first().waitFor({ state: 'visible' }).catch(() => undefined)
    checks.planShown = await planHeading.first().isVisible().catch(() => false)
    await tab('预览').click()
    // 预览舞台：PreviewStage 渲染出的课件内容（舞台根节点 lang="zh-CN"）或画布，在 .previewLayout 里（实测为准，见 Task 14 报告）
    const stage = page.locator('[class*="previewLayout"] canvas, [class*="previewLayout"] [lang="zh-CN"]')
    await stage.first().waitFor({ state: 'attached' }).catch(() => undefined)
    await page.waitForTimeout(1500)
    evidence.previewCanvas = await page.locator('[class*="previewLayout"] canvas').count()
    evidence.previewZhCn = await page.locator('[class*="previewLayout"] [lang="zh-CN"]').count()
    // 舞台里要有课件文字（空的舞台根节点不算），舞台框的右边不超出面板栏
    const stageText = (await page.locator('[class*="stageFrame"] [lang="zh-CN"]').first().innerText().catch(() => '')).trim()
    evidence.previewTextChars = stageText.length
    const frameBox = await page.locator('[class*="stageFrame"]').first().boundingBox().catch(() => null)
    const panelBox = await page.getByRole('region', { name: '备课面板' }).boundingBox().catch(() => null)
    evidence.previewOverflowPx = frameBox && panelBox ? Math.max(0, Math.round(frameBox.x + frameBox.width - (panelBox.x + panelBox.width))) : -1
    checks.previewRendered = (await stage.count()) > 0 && stageText.length > 0 && evidence.previewOverflowPx === 0
    await tab('质量').click()
    const rows = page.locator('table tbody tr')
    await rows.first().waitFor({ state: 'visible' }).catch(() => undefined)
    evidence.qualityRows = await rows.count()
    checks.qualityRows = evidence.qualityRows === pages
    await tab('验收与导出').click()
    const download = page.getByRole('link', { name: /下载 .*\.pptx/ })
    await download.first().waitFor({ state: 'visible' }).catch(() => undefined)
    checks.exportLink = await download.first().isVisible().catch(() => false)
    checks.noRenderPathRequests = renderRequests.length === 0
    await page.screenshot({ path: out, fullPage: false })
  } catch (error) {
    failure = error instanceof Error ? error.message.split('\n')[0] : String(error)
    await page.screenshot({ path: out, fullPage: false }).catch(() => undefined)
  }
} finally {
  await browser.close()
}
for (const name of ['courseListed', 'planShown', 'previewRendered', 'qualityRows', 'exportLink', 'noRenderPathRequests']) checks[name] ??= false
const ok = !failure && Object.values(checks).every(Boolean)
process.stdout.write(`${JSON.stringify({ ok, checks, evidence, courseId, ...(failure ? { failure } : {}) })}\n`)
process.exit(ok ? 0 : 1)
