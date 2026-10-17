// 备课全链（3d 的 prep-e2e 抽出，3e 的 compose-e2e 共用）：经"Nginx"建课 → 确认计划 → 对话逐页生成 → 截图 → 整课审查 → 逐页与整课验收 → 导出 → 下载 →
// 渲染数据路径 404 → 浏览器面板冒烟。断言与 3d 原样；环境相关的部分（地址、排空方式、截图输出、worker 是否常驻）由 ctx 给。
// summary 的键与写入顺序与 3d 相同（3d 的 summary.json 逐字节不变）；liveWorker 为真时才多写 renderAgain、renderedPages、blockedJobs。
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')

export interface PrepFlowContext {
  webBase: string
  apiBase: string
  token: string
  courseSchema: string
  ridPrefix: string
  panelOut: string
  /** worker 常驻在跑（容器栈）：第二次截图入队时前面的任务可能已完成，"不重复入队"只记录不断言，改为排空后逐页核对 */
  liveWorker: boolean
  query(sql: string, params: unknown[]): Promise<{ rows: Array<Record<string, any>> }>
  waitRender(label: string, courseId: string): Promise<Record<string, unknown>>
}
export interface PrepFlowResult { courseId: string | null; pages: number }

/** 结束子进程及其全部后代（冒烟脚本会起浏览器）：Windows 用 taskkill /T /F，其他平台杀整个进程组（子进程以 detached 起） */
export function killTree(pid: number | undefined): void {
  if (pid === undefined) return
  if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
  else try { process.kill(-pid, 'SIGKILL') } catch { /* 已退出 */ }
}

/** 起浏览器冒烟子进程。必须异步：调用方进程里可能有静态前端、api 或假上游，spawnSync 会卡住事件循环。超过 3 分钟结束整棵进程树 */
export async function runPanelSmoke(args: string[], token: string): Promise<{ status: number | null; stdout: string; stderr: string }> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/prep-panel-smoke.ts', ...args], {
    cwd: join(ROOT, 'workers', 'render'), env: { ...process.env, PREP_SMOKE_TOKEN: token, NO_PROXY: '127.0.0.1,localhost' },
    stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32',
  })
  let stdout = ''
  let stderr = ''
  child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000) })
  const timer = setTimeout(() => killTree(child.pid), 180_000)
  const status = await new Promise<number | null>((ok, fail) => { child.once('error', fail); child.once('close', (code) => ok(code)) }).finally(() => clearTimeout(timer))
  return { status, stdout, stderr }
}

export async function runPrepFlow(ctx: PrepFlowContext, summary: Record<string, unknown>, check: (ok: boolean, message: string) => void): Promise<PrepFlowResult> {
  const result: PrepFlowResult = { courseId: null, pages: 0 }
  const api = async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${ctx.webBase}${path}`, { method, headers: { 'x-session-token': ctx.token, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
    return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> }
  }
  const chat = async (sessionId: string, content: string, requestId: string) => {
    const res = await fetch(`${ctx.webBase}/api/prep/sessions/${sessionId}/messages`, { method: 'POST', headers: { 'x-session-token': ctx.token, 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify({ content, requestId }) })
    return (await res.text()).trim().split('\n').map((line) => JSON.parse(line) as Record<string, any>)
  }
  let n = 0
  const rid = (tag: string) => `${ctx.ridPrefix}-${tag}-${String(++n).padStart(4, '0')}`

  // 1. 面板：教材树桩 → 选两个知识点建课 → 确认计划
  const books = await api('GET', '/api/v2/textbooks?stage=初中&grade=八年级')
  const tree = await api('GET', `/api/v2/textbook-kps/${books.body.items[0].id}`)
  const kpIds = tree.body.chapters[0].leaves[0].kps.map((k: { kpId: string }) => k.kpId)
  check(kpIds.length >= 2, '教材树桩应给出至少两个夹具知识点')
  summary.kpCount = kpIds.length
  const created = await api('POST', '/api/prep/courses', { kpIds })
  check(created.status === 201, `建课 ${created.status}`)
  const courseId = created.body.course.courseId as string
  result.courseId = courseId
  const approved = await api('PATCH', `/api/prep/courses/${courseId}/plan`, { action: 'approve', updates: [] })
  check(approved.status === 200, `确认计划 ${approved.status}`)
  const planning = (await api('GET', `/api/prep/courses/${courseId}`)).body.workbench?.course?.planning
  summary.planPages = Array.isArray(planning?.pages) ? planning.pages.length : null
  summary.planStatus = planning?.status ?? null
  // 2. 对话：逐页生成（fake 模型按 TOOL 标记调工具），直到 session-not-ready
  const session = (await api('POST', '/api/prep/sessions', { courseId })).body.session.id as string
  let pages = 0
  for (let i = 0; i < 40; i += 1) {
    const frames = await chat(session, `TOOL:generate_page:${JSON.stringify({ courseId })}`, rid('gen'))
    const done = frames.at(-1)!
    check(done.type === 'done', `生成回合没有 done：${JSON.stringify(done).slice(0, 300)}`)
    if (done.tools?.[0]?.ok !== true) { check(done.tools?.[0]?.reason === 'session-not-ready', `generate_page 意外失败 ${JSON.stringify(done.tools).slice(0, 300)}`); break }
    pages += 1
  }
  summary.pages = pages
  result.pages = pages
  check(pages > 0 && pages === summary.planPages, `生成页数 ${pages} 应等于计划页数 ${String(summary.planPages)}`)
  // 3. 面板：送截图 → 排空 → 对话：整课审查 → 面板：逐页验收、整课验收 → 导出 → 排空 → 下载
  const render = await api('POST', `/api/prep/courses/${courseId}/render`, { requestId: rid('render') })
  check(render.status === 202 && render.body.jobs.length === pages, `截图入队 ${render.status} ${render.body.jobs?.length}`)
  const again = await api('POST', `/api/prep/courses/${courseId}/render`, { requestId: rid('render') })
  if (ctx.liveWorker) summary.renderAgain = { status: again.status, jobs: again.body.jobs?.length ?? null, skipped: again.body.skipped?.length ?? null }
  else check(again.body.skipped?.length === pages || again.body.jobs?.length === 0, '已在排队的页不应重复入队')
  summary.renderDrain = await ctx.waitRender('render', courseId)
  if (ctx.liveWorker) {
    const passed = (await ctx.query(`select count(distinct payload->>'pageId')::int as n from ${ctx.courseSchema}.render_jobs where course_id = $1 and kind = 'render-page' and status = 'succeeded' and coalesce(result->>'blocked', 'false') <> 'true'`, [courseId])).rows[0] as { n: number }
    const blocked = (await ctx.query(`select count(*)::int as n from ${ctx.courseSchema}.render_jobs where course_id = $1 and kind = 'render-page' and result->>'blocked' = 'true'`, [courseId])).rows[0] as { n: number }
    summary.renderedPages = passed.n
    summary.blockedJobs = blocked.n
    check(passed.n === pages, `worker 截图通过的页 ${passed.n} 应为 ${pages}`)
  }
  const audit = await chat(session, `TOOL:audit_course:${JSON.stringify({ courseId })}`, rid('audit'))
  check(audit.at(-1)!.tools?.[0]?.ok === true, `整课审查 ${JSON.stringify(audit.at(-1)!.tools).slice(0, 300)}`)
  const view = (await api('GET', `/api/prep/courses/${courseId}`)).body.workbench
  const unaccepted = (view?.unacceptedPageIds ?? []) as string[]
  check(unaccepted.length === pages, `整课审查后待验收页 ${unaccepted.length} 应为 ${pages}`)
  for (const pageId of unaccepted) check((await api('POST', `/api/prep/courses/${courseId}/pages/${pageId}/accept`, {})).status === 200, `验收 ${pageId}`)
  const acceptedCourse = await api('POST', `/api/prep/courses/${courseId}/accept`, {})
  check(acceptedCourse.status === 200, `整课验收 ${acceptedCourse.status}`)
  const exported = await api('POST', `/api/prep/courses/${courseId}/export`, { requestId: rid('export') })
  check(exported.status === 202, `导出入队 ${exported.status}`)
  summary.exportDrain = await ctx.waitRender('export', courseId)
  const jobs = (await api('GET', `/api/prep/courses/${courseId}/jobs`)).body.jobs as Array<{ kind: string; status: string; result: { url: string | null; filename: string | null } | null }>
  const exportJob = jobs.find((j) => j.kind === 'export-pptx')
  check(exportJob?.status === 'succeeded' && Boolean(exportJob.result?.url), `导出任务 ${exportJob?.status}`)
  const tally = (kind: string) => jobs.filter((j) => j.kind === kind).reduce<Record<string, number>>((acc, j) => ({ ...acc, [j.status]: (acc[j.status] ?? 0) + 1 }), {})
  summary.jobs = { renderPage: tally('render-page'), exportPptx: tally('export-pptx') }
  const file = await fetch(`${ctx.webBase}${exportJob!.result!.url}?name=${encodeURIComponent(exportJob!.result!.filename ?? '课件.pptx')}&token=${encodeURIComponent(ctx.token)}`)
  const bytes = new Uint8Array(await file.arrayBuffer())
  check(file.status === 200 && bytes[0] === 0x50 && bytes[1] === 0x4b, '下载的 PPTX 应是 zip')
  check(String(file.headers.get('content-disposition')).startsWith('attachment;'), 'PPTX 应是附件下载')
  summary.pptxIsZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  // 4. 渲染数据路径在 Nginx 与 api 上都不可用
  const renderViaWeb = (await fetch(`${ctx.webBase}/api/prep/render/${courseId}/`, { headers: { 'x-session-token': ctx.token } })).status
  const renderViaApi = (await fetch(`${ctx.apiBase}/api/prep/render/${courseId}/`, { headers: { 'x-session-token': ctx.token } })).status
  const variants = await Promise.all(['/api/prep/renderfoo', `/api/prep/%72ender/${courseId}/`, `/api//prep/render/${courseId}/`].map(async (p) => (await fetch(`${ctx.webBase}${p}`, { headers: { 'x-session-token': ctx.token } })).status))
  check(variants.every((s) => s === 404), `渲染路径变体在"Nginx"上必须 404：${variants.join(',')}`)
  summary.renderPath = { web: renderViaWeb, api: renderViaApi, webVariants: variants }
  check(renderViaWeb === 404, '/api/prep/render 必须 404')
  check(renderViaApi === 404, 'api 上 /api/prep/render 必须 404')
  // 5. 浏览器冒烟（workers/render 的 playwright-core，不进 api 进程）
  mkdirSync(dirname(ctx.panelOut), { recursive: true })
  const topic = ((await api('GET', '/api/prep/courses')).body.courses as Array<{ courseId: string; topic: string }>).find((c) => c.courseId === courseId)!.topic
  const smoke = await runPanelSmoke(['--base', ctx.webBase, '--course', courseId, '--topic', topic, '--pages', String(pages), '--out', ctx.panelOut], ctx.token)
  const smokeLast = smoke.stdout.trim().split('\n').at(-1) ?? ''
  let smokeResult: { ok?: boolean; checks?: Record<string, boolean>; evidence?: Record<string, number>; failure?: string } = {}
  try { smokeResult = JSON.parse(smokeLast || '{}') } catch { /* 下面按没通过记 */ }
  summary.panel = smokeResult.checks ?? null
  summary.panelEvidence = smokeResult.evidence ?? null
  check(smoke.status === 0 && smokeResult.ok === true, `面板冒烟没通过：${smokeLast || smoke.stderr.slice(-300)}`)
  return result
}
