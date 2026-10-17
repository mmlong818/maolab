// workers/render 入口（3b，spec 4.1）。第五个镜像的进程：领渲染任务、截图门禁、PPTX 导出、课程包导出（S4）。无对外接口，只有 /healthz 给平台探活。
import { createServer } from 'node:http'
import { checkCourseSchema, checkExportSchema, checkRenderSchema, courseCoreVersion, createPool, loadPackageSigningKey, PgCourseArtifacts, PgCourseDocuments, PgRenderJobs } from '@maolab/domain'
import { createBrowserPool, launchBrowser, resolveBrowserExecutable, withProjectionContext } from './browser.ts'
import { captureProjection } from './capture.ts'
import { loadConfig } from './config.ts'
import { handleRenderJob } from './jobs.ts'
import { createPgPackaging } from './packaging-pg.ts'
import { armExitFallback, defaultBackoffMs, runLoop, startPeriodic } from './loop.ts'

const log = (line: string) => process.stdout.write(`${new Date().toISOString()} render-worker ${line}\n`)
const config = loadConfig()
const executablePath = resolveBrowserExecutable(config.browserPath)
const pool = createPool(config.pgUrl)
await checkCourseSchema(pool)
await checkRenderSchema(pool)
await checkExportSchema(pool)

const documents = new PgCourseDocuments(pool)
const artifacts = new PgCourseArtifacts(pool)
const jobs = new PgRenderJobs(pool)
// S4：签名钥没配置时 worker 照常跑（PPTX 与截图不受影响），课程包任务不可重试地失败
const signingKey = loadPackageSigningKey()
const packaging = createPgPackaging(pool, { knowledgeSchema: config.knowledgeSchema, signingKey, coreVersion: courseCoreVersion() })
const browsers = createBrowserPool(() => launchBrowser({ executablePath, noSandbox: config.noSandbox }))
const controller = new AbortController()
let busy = false

const health = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, busy, draining: controller.signal.aborted }))
    return
  }
  res.writeHead(404).end()
})
health.listen(config.healthPort, '0.0.0.0')
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => {
    log(`${signal}: draining`)
    controller.abort()
    // T9 M3：排空或收尾超过宽限仍未退出（如浏览器句柄残留）时兜底退出；计时器 unref，正常收尾不受影响
    armExitFallback(config.drainGraceMs, (code) => { log(`drain grace ${config.drainGraceMs}ms passed, exiting`); process.exit(code) })
  })
}
// T9 M4：过期产物按自己的间隔清理，队列一直忙也照常执行
const purge = startPeriodic(async () => {
  const purged = await artifacts.purgeExpired()
  if (purged > 0) log(`purged ${purged} expired artifacts`)
}, config.purgeEveryMs, (error) => log(`purge error ${error instanceof Error ? error.name : typeof error}`))
log(`started holder=${config.holder} browser=${executablePath} origin=${config.pageOrigin} packageSigning=${signingKey ? signingKey.keyId : 'off'}`)

await runLoop({
  jobs,
  holder: config.holder,
  leaseMs: config.leaseMs,
  heartbeatMs: config.heartbeatMs,
  idleMs: config.idleMs,
  backoffMs: defaultBackoffMs,
  log,
  handle: async (job) => {
    busy = true
    try {
      return await handleRenderJob(job, {
        documentsFor: (owner) => documents.forOwner(owner),
        artifacts,
        origin: config.pageOrigin,
        timeoutMs: config.navigationTimeoutMs,
        now: Date.now,
        withContext: async (fn) => withProjectionContext(await browsers.get(), fn),
        capture: captureProjection,
        packaging,
      })
    } finally {
      busy = false
    }
  },
}, controller.signal)

await purge.stop()
await browsers.close()
await pool.end()
health.close()
log('stopped')
