import { expect, test } from 'vitest'
import { MAX_AUTOMATIC_PAGE_ATTEMPTS } from '../src/mainline/generation-session.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import type { CourseDocumentStore } from '../src/ports.js'
import { createCourseGenerationServices } from '../src/services/generation.js'
import { createPrepFacade, prepFailureOf, type PrepFacadeInternals } from '../src/services/prep-facade.js'
import { defaultGenerationPageRunnerDependencies } from '../src/mainline/generation-page-runner.js'
import type { PrepLlmRequest, PrepRuntime } from '../src/services/prep-facade-types.js'
import { fixtureBrokenPageReply, fixtureLlmReply, isPageFillRequest, PREP_FIXTURE_KP_IDS, prepFixtureKnowledge } from '../src/testing/prep-fixtures.js'

/**
 * 每轮里生成器最多几次带闸门反馈的重试。迁入源码没有导出这个数：
 * 来源 src/mainline/generation-page-runner.ts 的 defaultGenerationPageRunnerDependencies（maxPageAttempts: 3），
 * 循环在 src/mainline/planning/page-content-generator.ts 的 fillOnePlannedPage（for attempt <= maxPageAttempts）
 */
const GENERATOR_ATTEMPTS_PER_ROUND = 3

let seq = 0
const newId = () => `gen-${++seq}`

/** 假的会话模型通道：broken(n) 为真时第 n 次逐页生成请求返回过不了闸门的正文 */
function fixtureRuntime(broken: (pageFillIndex: number) => boolean = () => false) {
  const calls: Array<{ system: string; user: string }> = []
  let pageFills = 0
  const runtime: PrepRuntime = {
    sleep: async () => {},
    llm: {
      async completeJson(request: PrepLlmRequest) {
        calls.push({ system: request.system ?? '', user: request.user })
        if (isPageFillRequest(request)) {
          pageFills += 1
          const brokenReply = broken(pageFills) ? fixtureBrokenPageReply(request) : undefined
          if (brokenReply) return brokenReply
        }
        return fixtureLlmReply(request)
      },
    },
  }
  return { runtime, calls, pageFills: () => pageFills }
}

async function approved(options: { documents?: CourseDocumentStore; internals?: PrepFacadeInternals } = {}) {
  const documents = options.documents ?? createMemoryCourseDocuments()
  const prep = createPrepFacade({ documents, knowledge: prepFixtureKnowledge(), newId }, options.internals)
  const planned = await prep.planCourse({ kpIds: [...PREP_FIXTURE_KP_IDS] })
  if (!planned.ok) throw new Error(planned.message)
  const courseId = (planned.course as { courseId: string }).courseId
  const approval = await prep.updatePlan(courseId, { action: 'approve', updates: [] }, { imagesAvailable: false })
  if (!approval.ok) throw new Error(approval.message)
  return { prep, courseId, store: createMainlineCourseStore(documents) }
}
const imagesOff = { imagesAvailable: false } as const
/** repairs 只计闸门修复；模型或瞬时错误后会话自己放回队列的重跑计在 requeues（裁决 F8） */
type PageView = { pageId: string; order: number; status: string; rounds: number; repairs: number; requeues: number; attempts: number; sessionStatus: string; remaining: number }

async function generateAll(prep: Awaited<ReturnType<typeof approved>>['prep'], courseId: string, runtime: PrepRuntime): Promise<PageView[]> {
  const views: PageView[] = []
  for (let i = 0; i < 40; i += 1) {
    const result = await prep.generateNextPage(courseId, runtime, imagesOff)
    if (!result.ok) {
      if (result.reason === 'session-not-ready') return views
      throw new Error(`${result.reason}: ${result.message}`)
    }
    views.push(result.page as PageView)
  }
  throw new Error('页数超过 40，夹具异常')
}

test('generate_page walks the plan page by page through the given runtime only', async () => {
  const { prep, courseId, store } = await approved()
  const { runtime, calls } = fixtureRuntime()
  const views = await generateAll(prep, courseId, runtime)
  const course = (await store.findMainlineCourse(courseId))!
  expect(views.map((view) => view.pageId)).toEqual(course.planning!.pages.map((page) => page.id))
  expect(views.every((view) => view.repairs === 0 && view.requeues === 0 && view.rounds === 1)).toBe(true)
  expect(views.at(-1)).toMatchObject({ sessionStatus: 'rendering', remaining: 0 })
  expect(calls.length).toBeGreaterThanOrEqual(views.length)
  // 全部生成后再调：下一步是截图
  expect(await prep.generateNextPage(courseId, runtime, imagesOff)).toMatchObject({ ok: false, reason: 'session-not-ready' })
  // 没有模型通道：不抛异常，给出 model-channel-missing
  const fresh = await approved()
  expect(await fresh.prep.generateNextPage(fresh.courseId, {}, imagesOff)).toMatchObject({ ok: false, reason: 'model-channel-missing' })
})

/** 一直调 generate_page 直到第一次失败（程序锁定正文的页不经模型生成正文，不受 broken 影响，会先顺利通过） */
async function generateUntilFailure(prep: Awaited<ReturnType<typeof approved>>['prep'], courseId: string, runtime: PrepRuntime) {
  const passed: PageView[] = []
  for (let i = 0; i < 40; i += 1) {
    const result = await prep.generateNextPage(courseId, runtime, imagesOff)
    if (!result.ok) return { failure: result, passed }
    passed.push(result.page as PageView)
  }
  throw new Error('40 页内没有失败')
}

test('a page that keeps failing the gate is repaired at most MAX_AUTOMATIC_PAGE_ATTEMPTS rounds, then stays blocked', async () => {
  const { prep, courseId, store } = await approved()
  const fixture = fixtureRuntime(() => true)
  const { failure } = await generateUntilFailure(prep, courseId, fixture.runtime)
  expect(failure).toMatchObject({ ok: false, reason: 'page-blocked', details: { rounds: MAX_AUTOMATIC_PAGE_ATTEMPTS, repairs: MAX_AUTOMATIC_PAGE_ATTEMPTS - 1 } })
  expect(fixture.pageFills()).toBe(MAX_AUTOMATIC_PAGE_ATTEMPTS * GENERATOR_ATTEMPTS_PER_ROUND)
  const job = (await store.findMainlineCourse(courseId))!.generationSession!.jobs.find((candidate) => candidate.status === 'blocked')!
  expect(job.pageId).toBe((failure as unknown as { details: { pageId: string } }).details.pageId)
  // 再调 generate_page 不会再跑模型：明确告诉老师先修这一页
  const before = fixture.calls.length
  expect(await prep.generateNextPage(courseId, fixture.runtime, imagesOff)).toMatchObject({ ok: false, reason: 'page-blocked', details: { pageId: job.pageId } })
  expect(fixture.calls.length).toBe(before)
})

test('a page that fails the gate once is repaired automatically and says so', async () => {
  const { prep, courseId } = await approved()
  const fixture = fixtureRuntime((n) => n <= 3)
  const views = await generateAll(prep, courseId, fixture.runtime)
  const repaired = views.filter((view) => view.repairs > 0)
  expect(repaired).toHaveLength(1)
  expect(repaired[0]).toMatchObject({ status: 'content-ready', rounds: 2, repairs: 1 })
})

test('repair_page resumes a blocked page and puts the teacher feedback into the generator prompt', async () => {
  const { prep, courseId } = await approved()
  const { failure } = await generateUntilFailure(prep, courseId, fixtureRuntime(() => true).runtime)
  const pageId = (failure as unknown as { details: { pageId: string } }).details.pageId
  const fixture = fixtureRuntime()
  const feedback = '标题里不要出现任何内部字段名，直接写学生能看懂的标题'
  const repaired = await prep.repairPage(courseId, pageId, fixture.runtime, { imagesAvailable: false, feedback: [feedback] })
  expect(repaired).toMatchObject({ ok: true, page: { pageId, status: 'content-ready' } })
  // 实测为准：老师意见经 qualityFeedback 进入逐页生成的提示词（system 或 user 其一）
  expect(fixture.calls.some((call) => call.user.includes(feedback) || call.system.includes(feedback))).toBe(true)
})

test('audit_page reports plan, diagnostics and the deterministic content check without calling the model', async () => {
  const { prep, courseId, store } = await approved()
  const fixture = fixtureRuntime()
  await prep.generateNextPage(courseId, fixture.runtime, imagesOff)
  const pageId = (await store.findMainlineCourse(courseId))!.generationSession!.jobs[0]!.pageId
  const before = fixture.calls.length
  const audit = await prep.auditPage(courseId, pageId)
  expect(audit).toMatchObject({ ok: true, audit: { pageId, status: 'content-ready', contentIssues: [], render: null, accepted: false } })
  expect(fixture.calls.length).toBe(before)
  expect(await prep.auditPage(courseId, 'no-such-page')).toMatchObject({ ok: false, reason: 'not-found' })
})

test('renderable pages are the content-ready pages in plan order, only once every page is generated', async () => {
  const { prep, courseId, store } = await approved()
  const { runtime } = fixtureRuntime()
  await prep.generateNextPage(courseId, runtime, imagesOff)
  expect(await prep.renderablePages(courseId)).toMatchObject({ ok: false, reason: 'session-not-ready' })
  await generateAll(prep, courseId, runtime)
  const course = (await store.findMainlineCourse(courseId))!
  // 每页带当前正文修订 id（终审 M4：渲染任务的 requestKey 带上它，修页后重新截图投新任务）
  const revisions = Object.fromEntries(course.generationSession!.jobs.map((job) => [job.pageId, job.contentCheckpoint!.contentRevisionId]))
  expect(await prep.renderablePages(courseId)).toEqual({ ok: true, pageIds: course.planning!.pages.map((page) => page.id), revisions })
  expect(Object.values(revisions).every((revision) => typeof revision === 'string' && revision.length > 0)).toBe(true)
})

test('a page that needs an image is refused before any model call when images are unavailable', async () => {
  const { prep, courseId, store } = await approved()
  const course = (await store.findMainlineCourse(courseId))!
  const first = course.planning!.pages[0]!
  await store.saveMainlineCourse({ ...course, planning: { ...course.planning!, pages: course.planning!.pages.map((page) => page.id === first.id ? { ...page, visualSpec: { ...page.visualSpec, required: true, form: 'instructional-image' } } : page) } })
  const fixture = fixtureRuntime()
  expect(await prep.generateNextPage(courseId, fixture.runtime, imagesOff)).toMatchObject({ ok: false, reason: 'images-unavailable', details: { pageIds: [first.id] } })
  expect(await prep.repairPage(courseId, first.id, fixture.runtime, imagesOff)).toMatchObject({ ok: false, reason: 'images-unavailable' })
  expect(fixture.calls).toHaveLength(0)
})

test('two concurrent generate_page calls on one facade generate two different pages, no write conflict', async () => {
  const { prep, courseId } = await approved()
  const { runtime } = fixtureRuntime()
  const [a, b] = await Promise.all([prep.generateNextPage(courseId, runtime, imagesOff), prep.generateNextPage(courseId, runtime, imagesOff)])
  expect(a.ok && b.ok).toBe(true)
  expect((a as unknown as { page: PageView }).page.pageId).not.toBe((b as unknown as { page: PageView }).page.pageId)
})

test('a storage error before the page starts generating is returned as is, not counted as a requeue', async () => {
  const base = createMemoryCourseDocuments()
  let failNextSave = false
  const documents: CourseDocumentStore = {
    find: (kind, id) => base.find(kind, id),
    save: (kind, doc) => base.save(kind, doc),
    list: (kind) => base.list(kind),
    delete: (kind, id) => base.delete(kind, id),
    async saveIfUnchanged(kind, doc, expectedUpdatedAt) {
      if (failNextSave) {
        failNextSave = false
        throw new Error('存储暂时不可用')
      }
      return base.saveIfUnchanged(kind, doc, expectedUpdatedAt)
    },
  }
  const { prep, courseId, store } = await approved({ documents })
  const fixture = fixtureRuntime()
  failNextSave = true
  const failed = await prep.generateNextPage(courseId, fixture.runtime, imagesOff)
  expect(failed).toMatchObject({ ok: false, reason: 'failed', message: '存储暂时不可用' })
  expect(fixture.calls).toHaveLength(0)
  const job = (await store.findMainlineCourse(courseId))!.generationSession!.jobs[0]!
  expect(job).toMatchObject({ status: 'queued', attempt: 0, diagnostics: [] })
  // 存储恢复后同一页照常生成
  expect(await prep.generateNextPage(courseId, fixture.runtime, imagesOff)).toMatchObject({ ok: true, page: { pageId: job.pageId, rounds: 1, requeues: 0 } })
})

test('repair_page only takes the earliest unfinished page and names it otherwise (cancelled session)', async () => {
  const { prep, courseId, store } = await approved()
  const services = createCourseGenerationServices(store)
  const session = (await store.findMainlineCourse(courseId))!.generationSession!
  await services.session.execute(courseId, { action: 'cancel', expectedUpdatedAt: session.updatedAt })
  const pages = (await store.findMainlineCourse(courseId))!.planning!.pages
  const fixture = fixtureRuntime()
  const refused = await prep.repairPage(courseId, pages[3]!.id, fixture.runtime, imagesOff)
  expect(refused).toMatchObject({ ok: false, reason: 'plan-conflict', details: { pageId: pages[0]!.id } })
  expect((refused as { message: string }).message).toContain(`第 ${pages[0]!.order} 页`)
  expect(fixture.calls).toHaveLength(0)
  expect((await store.findMainlineCourse(courseId))!.generationSession!.status).toBe('cancelled')
  expect(await prep.repairPage(courseId, pages[0]!.id, fixture.runtime, imagesOff)).toMatchObject({ ok: true, page: { pageId: pages[0]!.id, status: 'content-ready' } })
})

test('repair_page on a page that already has content regenerates it with the feedback and counts no gate repair', async () => {
  const { prep, courseId, store } = await approved()
  await generateAll(prep, courseId, fixtureRuntime().runtime)
  const target = (await store.findMainlineCourse(courseId))!.planning!.pages.find((page) => page.contentSpec.kind === 'explanation')!
  const fixture = fixtureRuntime()
  const feedback = '核心表述再短一些，先给结论'
  const repaired = await prep.repairPage(courseId, target.id, fixture.runtime, { imagesAvailable: false, feedback: [feedback] })
  expect(repaired).toMatchObject({ ok: true, page: { pageId: target.id, status: 'content-ready', sessionStatus: 'rendering', rounds: 1, repairs: 0, requeues: 0 } })
  expect(fixture.calls.some((call) => call.user.includes(feedback) || call.system.includes(feedback))).toBe(true)
  expect(await prep.renderablePages(courseId)).toMatchObject({ ok: true })
})

test('a page still queued after the last round reports the real model error, not page-blocked', async () => {
  const documents = createMemoryCourseDocuments()
  const side = createMainlineCourseStore(documents)
  const baseGenerate = defaultGenerationPageRunnerDependencies().generate
  let failures = 0
  const internals: PrepFacadeInternals = {
    generation: {
      pages: {
        // 每次失败前改一下课题：页的输入哈希随之变化，startPageGeneration 把 attempt 重置为 1，failPageGeneration 因 attempt < MAX 把这一页放回 queued
        async generate(input) {
          if (input.planPage.order !== 1) return baseGenerate(input)
          const course = (await side.findMainlineCourse(input.course.id))!
          await side.saveMainlineCourse({ ...course, topic: `${course.topic}·` })
          failures += 1
          throw new Error('模型服务暂时不可用')
        },
      },
    },
  }
  const { prep, courseId } = await approved({ documents, internals })
  const result = await prep.generateNextPage(courseId, fixtureRuntime().runtime, imagesOff)
  expect(failures).toBe(MAX_AUTOMATIC_PAGE_ATTEMPTS)
  expect(result).toMatchObject({ ok: false, reason: 'failed', details: { status: 'queued', rounds: MAX_AUTOMATIC_PAGE_ATTEMPTS, repairs: 0, requeues: MAX_AUTOMATIC_PAGE_ATTEMPTS - 1 } })
  expect((result as { message: string }).message).toContain('模型服务暂时不可用')
})

/**
 * 审查 I2（3c 裁决 T4/T12）：传输失败（超时、取消、网络）不是闸门失败。bundle 的传输抛的错误消息以 "[prep-transport:<kind>] " 开头
 * （packages/bundle/src/prep/model.ts 的 PrepTransportError），迁入的生成器把它吞成闸门理由后文案仍在诊断里，门面按前缀识别
 */
function transportRuntime(kind: 'timeout' | 'abort' | 'network' | 'auth', onFill?: () => void) {
  const fixture = fixtureRuntime()
  let pageFills = 0
  const runtime: PrepRuntime = {
    ...fixture.runtime,
    llm: {
      async completeJson(request: PrepLlmRequest) {
        if (isPageFillRequest(request)) {
          pageFills += 1
          onFill?.()
          const error = new Error(`[prep-transport:${kind}] 模型调用${kind === 'timeout' ? '超时' : kind === 'abort' ? '已取消' : kind === 'auth' ? '失败：yunyi-llm: HTTP 401: invalid key' : '失败：fetch failed'}。`)
          error.name = kind === 'timeout' ? 'PrepModelTimeoutError' : kind === 'abort' ? 'AbortError' : kind === 'auth' ? 'PrepModelAuthError' : 'PrepModelNetworkError'
          throw error
        }
        return fixture.runtime.llm!.completeJson(request)
      },
    },
  }
  return { runtime, pageFills: () => pageFills }
}

test('a transport failure swallowed by the generator is a requeue, stops after one round and reports model-unavailable', async () => {
  const { prep, courseId, store } = await approved()
  // 先走到第一张经模型生成正文的页（程序锁定正文的页不调模型）
  let target: string | undefined
  for (let i = 0; i < 40 && !target; i += 1) {
    const session = (await store.findMainlineCourse(courseId))!.generationSession!
    const next = [...session.jobs].sort((a, b) => a.order - b.order).find((job) => job.status === 'queued')!
    const probe = transportRuntime('timeout')
    const result = await prep.generateNextPage(courseId, probe.runtime, imagesOff)
    if (probe.pageFills() > 0) {
      target = next.pageId
      expect(result).toMatchObject({ ok: false, reason: 'model-unavailable', details: { pageId: next.pageId, rounds: 1, repairs: 0, requeues: 1, status: 'queued' } })
      expect((result as { message: string }).message).toContain('超时')
      // 一轮之内不再起第二轮：生成器的尝试次数之内就停了
      expect(probe.pageFills()).toBeLessThanOrEqual(GENERATOR_ATTEMPTS_PER_ROUND * 3)
    } else {
      expect(result).toMatchObject({ ok: true })
    }
  }
  expect(target).toBeDefined()
  // 页已放回队列（不是 page-blocked）；通道恢复后直接 generate_page，传输失败的文案不会当成质量反馈进提示词
  const healthy = fixtureRuntime()
  const retried = await prep.generateNextPage(courseId, healthy.runtime, imagesOff)
  expect(retried).toMatchObject({ ok: true, page: { pageId: target, status: 'content-ready', rounds: 1, repairs: 0, requeues: 0 } })
  expect(healthy.calls.some((call) => call.user.includes('[prep-transport:') || call.system.includes('[prep-transport:'))).toBe(false)
})

test('network failures are recognised the same way', async () => {
  const { prep, courseId } = await approved()
  const network = transportRuntime('network')
  const { failure } = await generateUntilFailure(prep, courseId, network.runtime)
  expect(failure).toMatchObject({ ok: false, reason: 'model-unavailable', details: { rounds: 1, repairs: 0, requeues: 1 } })
})

test('a transport failure that escapes the generator (page left queued) also stops at once', async () => {
  const internals: PrepFacadeInternals = {
    generation: {
      pages: {
        async generate() {
          const error = new Error('[prep-transport:network] 模型调用失败：yunyi-llm: HTTP 503: upstream')
          error.name = 'PrepModelNetworkError'
          throw error
        },
      },
    },
  }
  const { prep, courseId } = await approved({ internals })
  const result = await prep.generateNextPage(courseId, fixtureRuntime().runtime, imagesOff)
  expect(result).toMatchObject({ ok: false, reason: 'model-unavailable', details: { status: 'queued', rounds: 1, repairs: 0, requeues: 1 } })
})

test('an aborted tool signal stops generation at once: before any model call, and after the round it fired in', async () => {
  const { prep, courseId, store } = await approved()
  const done = new AbortController()
  done.abort()
  const idle = fixtureRuntime()
  expect(await prep.generateNextPage(courseId, idle.runtime, { imagesAvailable: false, signal: done.signal })).toMatchObject({ ok: false, reason: 'cancelled' })
  expect(idle.calls).toHaveLength(0)
  expect((await store.findMainlineCourse(courseId))!.generationSession!.jobs[0]).toMatchObject({ status: 'queued', attempt: 0 })

  const tool = new AbortController()
  const cancelling = transportRuntime('abort', () => tool.abort())
  let result: Awaited<ReturnType<typeof prep.generateNextPage>> | undefined
  for (let i = 0; i < 40; i += 1) {
    result = await prep.generateNextPage(courseId, cancelling.runtime, { imagesAvailable: false, signal: tool.signal })
    if (!result.ok) break
  }
  expect(result).toMatchObject({ ok: false, reason: 'cancelled', details: { rounds: 1, repairs: 0, requeues: 1, status: 'queued' } })
  // 取消后 repair 或 generate 都能接着做；这里用不带信号的健康通道
  expect(await prep.generateNextPage(courseId, fixtureRuntime().runtime, imagesOff)).toMatchObject({ ok: true })
})

// Task 4 修复轮（最后一条 Ruling [T4]）：认证失败（401、凭证缺失、身份不一致）是通道问题，不是正文问题
test('an auth failure returns model-channel-missing, counts no repair and leaves the page queued', async () => {
  const { prep, courseId, store } = await approved()
  const auth = transportRuntime('auth')
  const { failure } = await generateUntilFailure(prep, courseId, auth.runtime)
  expect(failure).toMatchObject({ ok: false, reason: 'model-channel-missing', details: { rounds: 1, repairs: 0, status: 'queued' } })
  const pageId = (failure as unknown as { details: { pageId: string } }).details.pageId
  expect((await store.findMainlineCourse(courseId))!.generationSession!.jobs.find((job) => job.pageId === pageId)).toMatchObject({ status: 'queued' })
  expect(await prep.generateNextPage(courseId, fixtureRuntime().runtime, imagesOff)).toMatchObject({ ok: true, page: { pageId, repairs: 0 } })
})

test('transport failures outside page generation map to model-channel-missing / model-unavailable / cancelled', () => {
  expect(prepFailureOf(new Error('callLLMJson failed after 3 attempts: PrepModelAuthError: [prep-transport:auth] 模型调用失败：HTTP 401'))).toMatchObject({ reason: 'model-channel-missing' })
  expect(prepFailureOf(new Error('callLLMJson failed after 3 attempts: PrepModelTimeoutError: [prep-transport:timeout] 模型调用超时。'))).toMatchObject({ reason: 'model-unavailable' })
  expect(prepFailureOf(new Error('callLLMJson failed after 3 attempts: AbortError: [prep-transport:abort] 模型调用已取消。'))).toMatchObject({ reason: 'cancelled' })
  expect(prepFailureOf(new Error('模型输出不合格'))).toMatchObject({ reason: 'failed' })
})
