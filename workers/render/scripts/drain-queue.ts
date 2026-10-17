// 3c 的端到端与真实模型验收用：把某个测试 schema 里排队的渲染任务跑到空闲为止。
// 缺省用真实浏览器 + apps/prep-web 的静态导出（同 scripts/e2e-local.ts）；--fake-capture 时用固定合格度量、不开浏览器（同 tests-pg/worker-pg.test.ts）。
// 只连 TEST_PG_DATABASE_URL（tests-pg/helpers.ts 的守卫），只认 course_test_ 开头的 schema。标准输出最后一行是 JSON 汇总，日志走 stderr。
// 汇总的 truncated 为 true 表示跑满 --max-jobs 还没到 idle（仍以 0 退出，调用方据此判断是否排空）。
// 用法：corepack pnpm --silent -C workers/render run drain --schema <course_test_…> [--fake-capture] [--max-jobs 200]
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { PgCourseArtifacts, PgCourseDocuments, PgRenderJobs } from '@maolab/domain'
import { createBrowserPool, launchBrowser, resolveBrowserExecutable, withProjectionContext } from '../src/browser.ts'
import { captureProjection } from '../src/capture.ts'
import { handleRenderJob, type RenderJobDeps } from '../src/jobs.ts'
import { runOnce } from '../src/loop.ts'
import { startStaticServer } from '../src/static-server.ts'
import { solidPng } from '../tests/helpers/png.ts'
import { testPool } from '../tests-pg/helpers.ts'

const { values } = parseArgs({ options: { schema: { type: 'string' }, 'fake-capture': { type: 'boolean', default: false }, 'max-jobs': { type: 'string', default: '200' } } })
const schema = values.schema ?? ''
const maxJobs = Number(values['max-jobs'])
if (!/^course_test_[a-z0-9_]+$/.test(schema) || !Number.isInteger(maxJobs) || maxJobs < 1) {
  process.stderr.write('用法：drain --schema <course_test_…> [--fake-capture] [--max-jobs N]\n')
  process.exit(2)
}
const fake = values['fake-capture'] === true
const WEB_OUT = join(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'), 'apps', 'prep-web', 'out')
if (!fake && !existsSync(join(WEB_OUT, 'prep', 'render', 'index.html'))) {
  process.stderr.write('缺少 apps/prep-web/out/prep/render/index.html：先跑 corepack pnpm build，或加 --fake-capture\n')
  process.exit(2)
}

const pool = testPool()
const documents = new PgCourseDocuments(pool, { schema })
const artifacts = new PgCourseArtifacts(pool, { schema })
const jobs = new PgRenderJobs(pool, { schema })
let server: Awaited<ReturnType<typeof startStaticServer>> | undefined
let browsers: ReturnType<typeof createBrowserPool> | undefined
const goodMetrics = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 1, occupiedAreaRatio: 0.35 }
// 静态服务器与浏览器在 try 里启动（T10 审查）：启动失败时 finally 照样关掉 PG 池
const fakeDeps = (): RenderJobDeps => ({
  documentsFor: (owner) => documents.forOwner(owner), artifacts, origin: 'http://web.test', timeoutMs: 60_000, now: Date.now,
  withContext: async (fn) => fn({} as never), routes: async () => {},
  capture: async () => ({ screenshot: solidPng(32, 18), metrics: goodMetrics }),
})

const counts: Record<string, number> = {}
const started = Date.now()
let failed = false
let reachedIdle = false
try {
  let deps: RenderJobDeps
  if (fake) deps = fakeDeps()
  else {
    server = await startStaticServer(WEB_OUT)
    browsers = createBrowserPool(() => launchBrowser({ executablePath: resolveBrowserExecutable(process.env.RENDER_BROWSER_PATH), noSandbox: process.env.RENDER_CHROMIUM_NO_SANDBOX === '1' }))
    const pages = browsers
    deps = {
      documentsFor: (owner) => documents.forOwner(owner), artifacts, origin: server.origin, timeoutMs: 90_000, now: Date.now,
      withContext: async (fn) => withProjectionContext(await pages.get(), fn), capture: captureProjection,
    }
  }
  for (let i = 0; i < maxJobs; i += 1) {
    const result = await runOnce({
      jobs, handle: (job) => handleRenderJob(job, deps), holder: `drain-${process.pid}`, leaseMs: 300_000, heartbeatMs: 30_000,
      idleMs: 0, backoffMs: () => 0, log: (line) => { process.stderr.write(`${line}\n`) },
    })
    counts[result] = (counts[result] ?? 0) + 1
    if (result === 'idle') { reachedIdle = true; break }
  }
} catch (error) {
  failed = true
  process.stderr.write(`drain 失败：${error instanceof Error ? error.message : String(error)}\n`)
} finally {
  await browsers?.close()
  await server?.close()
  await pool.end()
}
process.stdout.write(`${JSON.stringify({ schema, fake, elapsedMs: Date.now() - started, truncated: !failed && !reachedIdle, counts })}\n`)
process.exit(failed ? 1 : 0)
