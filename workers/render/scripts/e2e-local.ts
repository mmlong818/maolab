// 本机端到端（3b 验收）：apps/prep-web 的真实静态导出 + 测试库 + 真实浏览器，走"夹具课程 → 入队 → 截图门禁 → 导出 PPTX → 解包核对"。不调模型。
// 前提：已跑 corepack pnpm build（apps/prep-web/out/prep/render/index.html 存在）；TEST_PG_DATABASE_URL 指向库名以 test 为一段的测试库。
// 只动 course_test_render_e2e schema 与 course_test_render_e2e_teacher 账号行，结束时清理。输出写到 docs/real-check/2026-10-14-phase3b-render/e2e/。
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { buildRenderingCourse, createMainlineCourseStore, goldenExportCourse, planProjectionExport, projectionRenderUrl } from '@maolab/course'
import { applyCourseDdl, PgCourseArtifacts, PgCourseDocuments, PgRenderJobs } from '@maolab/domain'
import { createBrowserPool, launchBrowser, resolveBrowserExecutable, withProjectionContext } from '../src/browser.ts'
import { captureProjection } from '../src/capture.ts'
import { handleRenderJob, type RenderJobDeps } from '../src/jobs.ts'
import { defaultBackoffMs, runOnce } from '../src/loop.ts'
import { pngSize } from '../src/png.ts'
import { startStaticServer } from '../src/static-server.ts'
import { testPool } from '../tests-pg/helpers.ts'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const WEB_OUT = join(ROOT, 'apps', 'web', 'out')
const OUT = join(ROOT, 'docs', 'real-check', '2026-10-14-phase3b-render', 'e2e')
const SCHEMA = 'course_test_render_e2e'
const OWNER = 'course_test_render_e2e_teacher'
/** 直接打开渲染页时不得出现的课程正文（夹具课标题、两页标题与核心表述里的片段） */
const COURSE_MARKERS = ['光的折射', '光从空气斜射入水中']

if (!existsSync(join(WEB_OUT, 'prep', 'render', 'index.html'))) {
  process.stderr.write('缺少 apps/prep-web/out/prep/render/index.html：先跑 corepack pnpm build\n')
  process.exit(2)
}
const executablePath = resolveBrowserExecutable(process.env.RENDER_BROWSER_PATH)
const pool = testPool()
const server = await startStaticServer(WEB_OUT)
const browsers = createBrowserPool(() => launchBrowser({ executablePath, noSandbox: process.env.RENDER_CHROMIUM_NO_SANDBOX === '1' }))
let failed = false
try {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0) on conflict do nothing', [OWNER])
  await applyCourseDdl(pool, SCHEMA)
  const documents = new PgCourseDocuments(pool, { schema: SCHEMA })
  const artifacts = new PgCourseArtifacts(pool, { schema: SCHEMA })
  const jobs = new PgRenderJobs(pool, { schema: SCHEMA })
  const store = createMainlineCourseStore(documents.forOwner(OWNER))
  const fixture = await buildRenderingCourse(store, 'e2e-render')
  const exportCourse = goldenExportCourse('e2e-export')
  await store.saveMainlineCourse(exportCourse)
  mkdirSync(OUT, { recursive: true })
  writeFileSync(join(OUT, 'fixture-course.json'), `${JSON.stringify(fixture, null, 2)}\n`)

  const owner = jobs.forOwner(OWNER)
  // Ruling [T8/T9/T12]：两次入队之间推进时钟（等到 Date.now() 变了再入队）。同毫秒入队时领取顺序随机，第二页可能先被领到（PAGE_NOT_NEXT）
  const tick = async () => {
    const before = Date.now()
    while (Date.now() === before) await new Promise((done) => setTimeout(done, 1))
  }
  await owner.enqueue({ courseId: 'e2e-render', kind: 'render-page', requestKey: 'e2e-page-1', payload: { pageId: 'page-1' } })
  await tick()
  await owner.enqueue({ courseId: 'e2e-render', kind: 'render-page', requestKey: 'e2e-page-2', payload: { pageId: 'page-2' } })
  await tick()
  await owner.enqueue({ courseId: 'e2e-export', kind: 'export-pptx', requestKey: 'e2e-export' })
  const deps: RenderJobDeps = {
    documentsFor: (o) => documents.forOwner(o), artifacts, origin: server.origin, timeoutMs: 60_000, now: Date.now,
    withContext: async (fn) => withProjectionContext(await browsers.get(), fn), capture: captureProjection,
  }
  const started = Date.now()
  for (let i = 0; i < 10; i += 1) {
    const result = await runOnce({ jobs, handle: (job) => handleRenderJob(job, deps), holder: 'e2e-local', leaseMs: 300_000, heartbeatMs: 30_000, idleMs: 0, backoffMs: defaultBackoffMs, log: (line) => process.stdout.write(`${line}\n`) })
    if (result === 'idle') break
  }
  const elapsedMs = Date.now() - started

  const listed = [...(await owner.listForCourse('e2e-render')), ...(await owner.listForCourse('e2e-export'))]
  const course = (await store.findMainlineCourse('e2e-render'))!
  const evidence = course.pageRenderEvidence ?? []
  const summary: Record<string, unknown> = {
    browser: executablePath, elapsedMs,
    jobs: listed.map((job) => ({ key: job.requestKey, status: job.status, attempts: job.attempts, error: job.error, result: job.kind === 'render-page' ? job.result : undefined })),
    session: course.generationSession?.status,
    evidence: evidence.map((item) => ({ pageId: item.pageId, metrics: item.metrics, issues: item.issues })),
  }
  for (const item of evidence) {
    const stored = await artifacts.forOwner(OWNER).get(item.screenshotPath.split('/').pop()!)
    if (stored) writeFileSync(join(OUT, `gate-${item.pageId}.png`), stored.bytes)
  }
  const exportJob = listed.find((job) => job.kind === 'export-pptx')
  if (exportJob?.status === 'succeeded') {
    const { artifactId } = exportJob.result as { artifactId: string }
    const pptx = (await artifacts.forOwner(OWNER).get(artifactId))!
    const zip = await JSZip.loadAsync(pptx.bytes)
    const names = Object.keys(zip.files)
    const slides = names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name)).length
    const media = names.filter((name) => /^ppt\/media\/.+\.png$/.test(name))
    const sizes = await Promise.all(media.map(async (name) => pngSize(await zip.file(name)!.async('nodebuffer'))))
    const notes = planProjectionExport(exportCourse).notes
    const notesMatched = (await Promise.all(notes.map(async (note, index) => (await zip.file(`ppt/notesSlides/notesSlide${index + 1}.xml`)?.async('string'))?.includes(note.slice(0, 4)) ?? false))).filter(Boolean).length
    const allFullHd = sizes.every((size) => size.width === 1920 && size.height === 1080)
    summary.export = { bytes: pptx.byteSize, slides, media: media.length, allFullHd, notesMatched, expectedPages: notes.length }
    if (media[0]) writeFileSync(join(OUT, 'export-slide-1.png'), await zip.file(media[0])!.async('nodebuffer'))
    failed ||= slides !== notes.length || media.length !== notes.length || !allFullHd || notesMatched !== notes.filter(Boolean).length
  }
  failed ||= listed.some((job) => job.status !== 'succeeded') || evidence.length !== 2

  // 直接打开（Note for T8/T9/T12）：不装拦截的普通上下文打开渲染页。静态站点上没有 /api/prep/render/<id>/，
  // 页面只能显示 data-render-error；课程就在库里，但正文一个字都不能出现在页面上。
  const plain = await (await browsers.get()).newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })
  try {
    const page = await plain.newPage()
    const apiStatuses: number[] = []
    page.on('response', (response) => { if (new URL(response.url()).pathname.startsWith('/api/')) apiStatuses.push(response.status()) })
    await page.goto(projectionRenderUrl(server.origin, 'e2e-render', 1), { waitUntil: 'domcontentloaded', timeout: 30_000 })
    const errorNode = await page.waitForSelector('[data-render-error]', { timeout: 30_000 }).catch(() => null)
    const state = await page.evaluate(() => ({
      renderError: document.querySelector('[data-render-error]')?.getAttribute('data-render-error') ?? null,
      exportReady: document.body?.dataset.exportReady ?? null,
      text: document.body?.innerText ?? '',
      html: document.documentElement.outerHTML,
    }))
    const leakedMarkers = COURSE_MARKERS.filter((marker) => state.text.includes(marker) || state.html.includes(marker))
    summary.directOpen = { renderError: state.renderError, exportReady: state.exportReady, apiStatuses, leakedMarkers }
    failed ||= !errorNode || state.renderError === null || state.exportReady !== null || leakedMarkers.length > 0
  } finally {
    await plain.close()
  }

  writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`)
} finally {
  await browsers.close()
  await server.close()
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query('delete from account.users where username = $1', [OWNER])
  await pool.end()
}
process.exit(failed ? 1 : 0)
