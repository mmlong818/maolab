// 3c 假模型端到端：真实 dsh 宿主 + prep preset + 测试库；agent 的模型（fake-openai）与工具内的模型（假课程网关）都是脚本化的。
// 截图与导出起 workers/render 的排空子进程（缺省 --fake-capture；加 --real-browser 用真实浏览器与 apps/prep-web/out，需先 corepack pnpm build）。
// 走"选知识点 → 计划 → 确认 → 逐页生成（第一张模型生成正文的页先过不了闸门、自动修一次）→ 截图 → 整课审查 → 逐页验收 → 整课验收 → 导出 → 试学"，
// 另验证：会话工具恰为 prep 白名单；截图前逐页验收被拒、尚有页未验收时整课验收被拒；老师 B 用 A 的 id 读不到、改不了 A 的课。
// 只动 course_test_prep_e2e* schema 与 course_test_prep_e2e_* 账号行，结束时清理（准备阶段失败也清理）。
// 用法：corepack pnpm -C apps/prep-harness e2e:prep [--real-browser]
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { PgCourseArtifacts } from '@maolab/domain'
import { startFakeCourseLlm } from '../tests/helpers/fake-course-llm.ts'
import { startFakeOpenAI } from '../tests/helpers/fake-openai.ts'
import { startHost } from '../tests/helpers/host.ts'
import { drainRenderQueue, dropPrepSchemas, loadCourseForTests, prepPgUrl, prepSession, resetPrepSchemas } from '../tests/helpers/prep.ts'
import { PREP_TOOLS, withWhoami } from '../tests/helpers/whitelist.ts'

/**
 * 3c 裁决 F7：生成器每轮内带闸门反馈的尝试次数。迁入源码没有把它导出成常量（只在
 * packages/course/src/mainline/generation-page-runner.ts 的 defaultGenerationPageRunnerDependencies 里写 maxPageAttempts: 3），
 * T2 在 packages/course/tests/prep-generation.test.ts 定义了同值的 GENERATOR_ATTEMPTS_PER_ROUND（测试文件不能被脚本导入）。
 * 本脚本只在这一处引用这个数；迁入值变了，"repairs === 1" 的检查会红。
 */
const GENERATOR_ATTEMPTS_PER_ROUND = 3

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const OUT = join(ROOT, 'docs', 'real-check', '2026-10-14-phase3c-prep', 'e2e')
const COURSE_SCHEMA = 'course_test_prep_e2e'
const KNOWLEDGE_SCHEMA = 'course_test_prep_e2e_kp'
const TEACHER = 'course_test_prep_e2e_teacher'
const OTHER = 'course_test_prep_e2e_other'
const fakeCapture = !process.argv.includes('--real-browser')
const owners = [TEACHER, OTHER]

type Step = { step: string; tool: string; ok: boolean; reason: string | null; ms: number; modelCalls: unknown }
const steps: Step[] = []
const problems: string[] = []
const check = (condition: boolean, message: string): void => { if (!condition) problems.push(message) }
const summary: Record<string, unknown> = { fakeCapture, startedAt: new Date().toISOString() }
const started = Date.now()

let fake: Awaited<ReturnType<typeof startFakeOpenAI>> | undefined
let gateway: Awaited<ReturnType<typeof startFakeCourseLlm>> | undefined
let host: Awaited<ReturnType<typeof startHost>> | undefined
let pool: pg.Pool | undefined

async function openSession(owner: string, credential: string) {
  const id = `s-prep-e2e-${owner.slice(-5)}-${Date.now().toString(36)}`
  const created = await host!.api('POST', '/sessions', { sessionId: id, owner, credential, preset: 'prep', provider: 'fake', model: 'fake-1' })
  if (created.status !== 201) throw new Error(`建会话失败 ${created.status}`)
  const session = prepSession(host!, id)
  return {
    id,
    async call(step: string, tool: string, args: Record<string, unknown>): Promise<Record<string, any>> {
      const t = Date.now()
      const result = await session.call(tool, args)
      steps.push({ step, tool, ok: result.ok === true, reason: typeof result.reason === 'string' ? result.reason : null, ms: Date.now() - t, modelCalls: result.modelCalls ?? null })
      return result
    },
    close: () => session.close(),
  }
}

/** 排空并核对：排空脚本跑满 --max-jobs 时也以 0 退出（T10 备注），所以要看到 idle，且本课没有排队或运行中的任务 */
async function drainAndVerify(label: string, courseId: string): Promise<Record<string, unknown>> {
  const drained = await drainRenderQueue(COURSE_SCHEMA, { fakeCapture })
  const counts = (drained.counts ?? {}) as Record<string, number>
  check(counts.idle === 1, `${label} 排空没有跑到 idle：${JSON.stringify(counts)}`)
  const left = (await pool!.query(`select count(*)::int as n from ${COURSE_SCHEMA}.render_jobs where course_id = $1 and status in ('queued', 'running')`, [courseId])).rows[0] as { n: number }
  check(left.n === 0, `${label} 排空后仍有 ${left.n} 个排队或运行中的任务`)
  return { label, ...drained, leftActive: left.n }
}

/** A 的课程快照：文档 updated_at 与任务数（老师 B 的越权调用前后对比） */
async function courseSnapshot(courseId: string): Promise<{ updatedAt: string; jobs: number }> {
  const doc = (await pool!.query(`select updated_at from ${COURSE_SCHEMA}.documents where id = $1`, [courseId])).rows[0] as { updated_at: unknown } | undefined
  const jobs = (await pool!.query(`select count(*)::int as n from ${COURSE_SCHEMA}.render_jobs where course_id = $1`, [courseId])).rows[0] as { n: number }
  return { updatedAt: String(doc?.updated_at ?? ''), jobs: jobs.n }
}

try {
  const course = await loadCourseForTests()
  await resetPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners, fixtures: course })
  // 第一张由模型生成正文的页，第一轮的全部请求返回过不了闸门的正文：生成器一轮内的重试全失败 → 整轮 blocked → 门面自动修一次
  let brokenPageFills = GENERATOR_ATTEMPTS_PER_ROUND
  fake = await startFakeOpenAI()
  gateway = await startFakeCourseLlm((request) => {
    if (brokenPageFills > 0 && course.isPageFillRequest(request)) {
      brokenPageFills -= 1
      return course.fixtureBrokenPageReply(request)!
    }
    return course.fixtureLlmReply(request)
  })
  host = await startHost({
    FAKE_OPENAI_BASE_URL: fake.baseUrl, YUNYI_LLM_BASE_URL: gateway.baseUrl, YUNYI_PREP_PG_URL: prepPgUrl(),
    YUNYI_COURSE_SCHEMA: COURSE_SCHEMA, YUNYI_PREP_KNOWLEDGE_SCHEMA: KNOWLEDGE_SCHEMA, YUNYI_PREP_MODEL: 'fake-course',
  }, { readyTimeoutMs: 120_000 })
  pool = new pg.Pool({ connectionString: prepPgUrl(), max: 1 })

  const teacher = await openSession(TEACHER, 'e2e-cred')
  // 会话工具恰为 prep 白名单（同 prep-host.test.ts；host.ts 开了诊断工具，所以多一个 whoami）
  const toolNames = [...((await host.api('GET', `/sessions/${teacher.id}/tools`)).json as { names: string[] }).names].sort()
  summary.tools = toolNames
  check(JSON.stringify(toolNames) === JSON.stringify(withWhoami(PREP_TOOLS)), `prep 会话工具应恰为 PREP_TOOLS + whoami，实际 ${JSON.stringify(toolNames)}`)

  // 两知识点建课（单知识点的课教材与课标审查会是 insufficient-evidence，T3 备注）
  const planned = await teacher.call('plan', 'plan_course', { kpIds: [...course.PREP_FIXTURE_KP_IDS] })
  check(planned.ok === true, `plan_course: ${planned.reason}`)
  const courseId = planned.course.courseId as string
  summary.courseId = courseId
  summary.kpIds = [...course.PREP_FIXTURE_KP_IDS]
  check((await teacher.call('approve', 'approve_plan', { courseId, action: 'approve', updates: [] })).ok === true, 'approve_plan')

  let repairs = 0
  let requeues = 0
  let generated = 0
  for (let i = 0; i < 40; i += 1) {
    const result = await teacher.call('generate', 'generate_page', { courseId })
    if (!result.ok) {
      check(result.reason === 'session-not-ready', `generate_page 意外失败：${result.reason} ${result.message}`)
      break
    }
    generated += 1
    repairs += Number(result.page.repairs ?? 0)
    requeues += Number(result.page.requeues ?? 0)
    if (Number(result.page.repairs ?? 0) > 0) check(result.page.repairs === 1 && result.page.rounds === 2, `自动修复应恰好一次，实际 ${JSON.stringify(result.page)}`)
  }
  summary.pages = generated
  summary.repairs = repairs
  summary.requeues = requeues
  // 第一张由模型生成正文的页第一轮过不了闸门：全课恰好自动修一次；没有模型或网络错误造成的重排（裁决 F8 分开计数）
  check(repairs === 1, `全课应恰好自动修复 1 次，实际 ${repairs}`)
  check(requeues === 0, `不应有模型或网络错误造成的重排，实际 ${requeues}`)
  check(brokenPageFills === 0, `坏正文应答没有用完，剩 ${brokenPageFills}`)

  const gates: Record<string, unknown> = {}
  const generatedPages = (await teacher.call('read', 'read_course', { courseId })).course.pages as Array<{ pageId: string }>
  const firstPageId = generatedPages[0]!.pageId
  // 反向闸门 1：还没有通过的截图证据时逐页验收被拒
  const earlyAccept = await teacher.call('gate-accept-before-render', 'accept_page', { courseId, pageId: firstPageId })
  gates.acceptPageBeforeRender = earlyAccept.reason ?? null
  check(earlyAccept.ok === false && earlyAccept.reason === 'render-evidence-missing', `截图前 accept_page 应为 render-evidence-missing，实际 ${JSON.stringify({ ok: earlyAccept.ok, reason: earlyAccept.reason })}`)

  const rendered = await teacher.call('render', 'render_page', { courseId })
  check(rendered.ok === true && rendered.queued.length === generated, `render_page 应投 ${generated} 页`)
  check(rendered.ok === true && (rendered.queued as Array<{ created: boolean }>).every((item) => item.created === true), 'render_page 首次投递每页都应是新任务（created:true）')
  const drains: unknown[] = [await drainAndVerify('render', courseId)]
  const afterRender = await teacher.call('read', 'read_course', { courseId })
  check(afterRender.course.sessionStatus === 'course-audit', `截图后会话应为 course-audit，实际 ${afterRender.course.sessionStatus}`)
  check(afterRender.course.pages.every((page: { render: { blocking: boolean } | null }) => page.render && !page.render.blocking), '每页都应有通过的截图')

  const audit = await teacher.call('audit', 'audit_course', { courseId })
  // 没通过时是 { ok:false, reason:'audit-blocked', details: { findings, factIssues, … } }（裁决 F1）
  check(audit.ok === true && audit.audit.acceptable === true, `audit_course 应可验收：${JSON.stringify(audit.ok ? audit.audit : { reason: audit.reason, details: audit.details })}`)
  const pageIds = (afterRender.course.pages as Array<{ pageId: string }>).map((page) => page.pageId)
  const lastPageId = pageIds.at(-1)!
  for (const pageId of pageIds.slice(0, -1)) {
    const accepted = await teacher.call('accept-page', 'accept_page', { courseId, pageId })
    check(accepted.ok === true, `accept_page ${pageId}: ${accepted.reason}`)
  }
  // 反向闸门 2：尚有页未验收时整课验收被拒，并点名未验收的页
  const earlyCourse = await teacher.call('gate-accept-course-early', 'accept_course', { courseId })
  gates.acceptCourseWithPageLeft = { reason: earlyCourse.reason ?? null, pageIds: earlyCourse.details?.pageIds ?? null }
  check(earlyCourse.ok === false && earlyCourse.reason === 'pages-not-accepted' && JSON.stringify(earlyCourse.details?.pageIds) === JSON.stringify([lastPageId]),
    `尚有页未验收时 accept_course 应为 pages-not-accepted 并列出 ${lastPageId}，实际 ${JSON.stringify({ ok: earlyCourse.ok, reason: earlyCourse.reason, details: earlyCourse.details })}`)
  summary.gates = gates
  const lastAccepted = await teacher.call('accept-page', 'accept_page', { courseId, pageId: lastPageId })
  check(lastAccepted.ok === true, `accept_page ${lastPageId}: ${lastAccepted.reason}`)
  const acceptedCourse = await teacher.call('accept-course', 'accept_course', { courseId })
  check(acceptedCourse.ok === true, `accept_course: ${acceptedCourse.reason} ${acceptedCourse.message ?? ''}`)

  const exported = await teacher.call('export', 'export_pptx', { courseId })
  check(exported.ok === true && exported.job?.created === true, `export_pptx: ${exported.reason}`)
  drains.push(await drainAndVerify('export', courseId))
  summary.drains = drains
  const afterExport = await teacher.call('read', 'read_course', { courseId })
  const exportJob = (afterExport.jobs as Array<{ kind: string; status: string; jobId: string; result: { url: string | null; filename: string | null } | null }>).find((job) => job.kind === 'export-pptx')
  check(exportJob?.status === 'succeeded', `导出任务应成功，实际 ${exportJob?.status}`)
  const row = (await pool.query(`select result from ${COURSE_SCHEMA}.render_jobs where id = $1`, [exportJob?.jobId])).rows[0] as { result?: { artifactId?: string; pageCount?: number } } | undefined
  const meta = row?.result?.artifactId ? await new PgCourseArtifacts(pool, { schema: COURSE_SCHEMA }).forOwner(TEACHER).head(row.result.artifactId) : undefined
  summary.export = { url: exportJob?.result?.url ?? null, filename: exportJob?.result?.filename ?? null, pageCount: row?.result?.pageCount ?? null, bytes: meta?.byteSize ?? null, contentType: meta?.contentType ?? null }
  check(Boolean(meta && meta.byteSize > 0), '导出件应存在且非空')
  check(row?.result?.pageCount === generated, `导出页数应为 ${generated}，实际 ${row?.result?.pageCount}`)

  const rehearsed = await teacher.call('rehearse', 'rehearse', { courseId })
  check(rehearsed.ok === true, `rehearse: ${rehearsed.reason}`)
  summary.rehearse = rehearsed.report ?? null

  // 跨户：B 用 A 的课程 id 与页 id 读、改、截图、验收、导出，全部 not-found；A 的课程文档与任务数不变
  const other = await openSession(OTHER, 'e2e-cred-other')
  const before = await courseSnapshot(courseId)
  const requestsBefore = gateway.requests.length
  const crossRead = await other.call('cross-owner', 'read_course', { courseId })
  const crossList = await other.call('cross-owner', 'list_courses', {})
  const crossWrites: Record<string, string | null> = {}
  for (const [tool, args] of [
    ['generate_page', { courseId }], ['render_page', { courseId, pageId: firstPageId }],
    ['accept_page', { courseId, pageId: firstPageId }], ['export_pptx', { courseId }],
  ] as const) {
    const result = await other.call('cross-owner', tool, { ...args })
    crossWrites[tool] = result.reason ?? null
    check(result.ok === false && result.reason === 'not-found', `老师 B 调 ${tool}（A 的 id）应为 not-found，实际 ${JSON.stringify({ ok: result.ok, reason: result.reason })}`)
  }
  const after = await courseSnapshot(courseId)
  summary.crossOwner = { read: crossRead.reason ?? null, listed: (crossList.courses as unknown[]).length, writes: crossWrites, courseUnchanged: after.updatedAt === before.updatedAt, newJobs: after.jobs - before.jobs }
  check(crossRead.reason === 'not-found' && (crossList.courses as unknown[]).length === 0, '老师 B 不应看到老师 A 的课')
  check(after.updatedAt === before.updatedAt && before.updatedAt !== '', 'B 的越权调用后 A 的课程文档 updated_at 不应变化')
  check(after.jobs === before.jobs, `B 的越权调用不应给 A 的课投任务，实际新增 ${after.jobs - before.jobs}`)
  check(gateway.requests.length === requestsBefore, 'B 的越权调用不应触发工具内模型请求')
  await teacher.close()
  await other.close()

  summary.gateway = {
    requests: gateway.requests.length,
    credentials: [...new Set(gateway.requests.map((request) => request.authorization))],
    models: [...new Set(gateway.requests.map((request) => request.model))],
    reasoningEfforts: [...new Set(gateway.requests.map((request) => request.reasoningEffort ?? null))],
    maxTokens: [...new Set(gateway.requests.map((request) => request.maxTokens ?? null))],
  }
  check(gateway.requests.length > 0, '工具内模型应至少收到一次请求')
  check(gateway.requests.every((request) => request.authorization === 'Bearer e2e-cred'), '工具内模型请求只应带老师 A 的会话凭证（老师 B 没有触发模型）')
} catch (error) {
  problems.push(`异常：${error instanceof Error ? error.message : String(error)}`)
} finally {
  // 每一步单独兜住：任何一步失败都记进 problems，后面的清理照做，summary 照写
  const teardown: Array<[string, () => Promise<unknown> | undefined]> = [
    ['host.stop', () => host?.stop()], ['fake.close', () => fake?.close()], ['gateway.close', () => gateway?.close()], ['pool.end', () => pool?.end()],
    ['dropPrepSchemas', () => dropPrepSchemas({ courseSchema: COURSE_SCHEMA, knowledgeSchema: KNOWLEDGE_SCHEMA, owners })],
  ]
  for (const [label, step] of teardown) {
    try { await step() } catch (error) { problems.push(`清理 ${label} 失败：${error instanceof Error ? error.message : String(error)}`) }
  }
}
summary.elapsedMs = Date.now() - started
summary.steps = steps
summary.problems = problems
summary.ok = problems.length === 0
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`)
process.stdout.write(`${JSON.stringify({ ok: summary.ok, elapsedMs: summary.elapsedMs, pages: summary.pages, repairs: summary.repairs, problems }, null, 2)}\n`)
process.exit(summary.ok ? 0 : 1)
