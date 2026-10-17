import { expect, test } from 'vitest'
import { createMainlineCourseStore, type MainlineCourseStore } from '../src/mainline/store.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import { createCourseGenerationServices } from '../src/services/generation.js'
import { createPrepFacade, type PrepFacadeInternals } from '../src/services/prep-facade.js'
import type { CourseDocumentStore } from '../src/ports.js'
import type { PrepFacade, PrepLlmRequest, PrepRuntime } from '../src/services/prep-facade-types.js'
import { fixtureLlmReply, PREP_FIXTURE_KP_IDS, prepFixtureKnowledge } from '../src/testing/prep-fixtures.js'

let seq = 0
const newId = () => `acc-${++seq}`
const imagesOff = { imagesAvailable: false } as const
const goodMetrics = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, visualElementCount: 1, occupiedAreaRatio: 0.35 }

function fixtureRuntime() {
  const calls: Array<{ system: string; user: string }> = []
  const runtime: PrepRuntime = { sleep: async () => {}, llm: { async completeJson(request: PrepLlmRequest) { calls.push({ system: request.system ?? '', user: request.user }); return fixtureLlmReply(request) } } }
  return { runtime, calls }
}

/** 模拟 3b 的 worker：另一个服务实例、同一份仓储（跨实例写者，靠 CAS），截图走固定度量 */
function worker(store: MainlineCourseStore, metrics: (pageNumber: number) => typeof goodMetrics = () => goodMetrics) {
  return createCourseGenerationServices(store, {
    render: {
      capture: async (_url, pageNumber) => ({ screenshot: Buffer.from([pageNumber]), metrics: metrics(pageNumber) }),
      writeEvidence: async (_courseId, pageId, evidenceId) => `/api/prep/artifacts/ar_${pageId}_${evidenceId.slice(0, 8)}`,
      pageUrl: (origin, courseId, pageNumber) => `${origin}/prep/render/?course=${courseId}&page=${pageNumber}`,
    },
  }).render!
}

async function renderAll(store: MainlineCourseStore, courseId: string): Promise<void> {
  const render = worker(store)
  for (let i = 0; i < 40; i += 1) if ((await render.runNext(courseId, 'http://web.test')).done) return
  throw new Error('截图超过 40 页')
}

async function generated(knowledge = prepFixtureKnowledge(), kpIds: readonly string[] = PREP_FIXTURE_KP_IDS, options: { documents?: CourseDocumentStore; internals?: PrepFacadeInternals } = {}) {
  const documents = options.documents ?? createMemoryCourseDocuments()
  const store = createMainlineCourseStore(documents)
  const prep = createPrepFacade({ documents, knowledge, newId }, options.internals)
  const planned = await prep.planCourse({ kpIds })
  if (!planned.ok) throw new Error(planned.message)
  const courseId = (planned.course as { courseId: string }).courseId
  const approved = await prep.updatePlan(courseId, { action: 'approve', updates: [] }, imagesOff)
  if (!approved.ok) throw new Error(approved.message)
  const fixture = fixtureRuntime()
  for (let i = 0; i < 40; i += 1) {
    const result = await prep.generateNextPage(courseId, fixture.runtime, imagesOff)
    if (!result.ok) { if (result.reason === 'session-not-ready') break; throw new Error(result.message) }
  }
  return { prep, store, courseId, fixture }
}

async function pageIds(prep: PrepFacade, courseId: string): Promise<string[]> {
  const summary = await prep.readCourse(courseId)
  return ((summary as unknown as { course: { pages: Array<{ pageId: string }> } }).course.pages).map((page) => page.pageId)
}

test('the whole chain at course level: generate, render, audit, accept every page, accept the course, export is ready', async () => {
  const { prep, store, courseId, fixture } = await generated()
  await renderAll(store, courseId)
  const audit = await prep.auditCourse(courseId, fixture.runtime)
  // 判据：两知识点夹具（教材 + 课标权威摘录）必须让 AI 教学审查记录为 passed，否则任何课程都无法验收（计划"已定事实"）
  expect(audit).toMatchObject({ ok: true, audit: { sessionStatus: 'awaiting-teacher-acceptance', teachingQuality: 'passed', acceptable: true } })
  const ids = await pageIds(prep, courseId)
  for (const pageId of ids) expect(await prep.acceptPage(courseId, pageId)).toMatchObject({ ok: true })
  // 与渲染 worker 的 NOT_READY 同形：details 为 { blockers }（审查 M5）
  expect(await prep.exportReadiness(courseId)).toMatchObject({ ok: false, reason: 'not-ready', details: { blockers: expect.any(Array) } })
  expect(await prep.acceptCourse(courseId)).toMatchObject({ ok: true, acceptance: { planStatus: 'ready' } })
  expect(await prep.exportReadiness(courseId)).toMatchObject({ ok: true, export: { pageCount: expect.any(Number), filename: expect.stringMatching(/\.pptx$/) } })
})

test('accept_page refuses a page without passing screenshot evidence', async () => {
  const { prep, store, courseId } = await generated()
  const ids = await pageIds(prep, courseId)
  expect(await prep.acceptPage(courseId, ids[0]!)).toMatchObject({ ok: false, reason: 'render-evidence-missing' })
  // 第 1 页截图字号过小被门禁拦下：证据写进课程，但不是"通过的证据"
  await expect(worker(store, () => ({ ...goodMetrics, minimumFontPx: 12 })).runNext(courseId, 'http://web.test')).rejects.toMatchObject({ code: 'RENDER_BLOCKED' })
  expect(await prep.acceptPage(courseId, ids[0]!)).toMatchObject({ ok: false, reason: 'render-evidence-missing' })
  expect(await prep.acceptPage(courseId, 'no-such-page')).toMatchObject({ ok: false, reason: 'not-found' })
})

test('accept_course refuses while any page is unaccepted and lists the missing pages', async () => {
  const { prep, store, courseId, fixture } = await generated()
  await renderAll(store, courseId)
  await prep.auditCourse(courseId, fixture.runtime)
  const ids = await pageIds(prep, courseId)
  for (const pageId of ids.slice(0, -1)) await prep.acceptPage(courseId, pageId)
  expect(await prep.acceptCourse(courseId)).toMatchObject({ ok: false, reason: 'pages-not-accepted', details: { pageIds: [ids.at(-1)] } })
})

test('repairing a page after audit voids the course audit and every page acceptance', async () => {
  const { prep, store, courseId, fixture } = await generated()
  await renderAll(store, courseId)
  await prep.auditCourse(courseId, fixture.runtime)
  const ids = await pageIds(prep, courseId)
  expect(await prep.acceptPage(courseId, ids[0]!)).toMatchObject({ ok: true })
  expect(await prep.repairPage(courseId, ids[1]!, fixture.runtime, { imagesAvailable: false, feedback: ['把第二页的例句换成新的诗句'] })).toMatchObject({ ok: true, page: { sessionStatus: 'rendering' } })
  expect(await prep.readCourse(courseId)).toMatchObject({ ok: true, course: { courseAudit: null, acceptance: null, sessionStatus: 'rendering' } })
  // 第 1 页证据仍在，但会话已不在待验收：必须重新截图、审查后才能验收
  expect(await prep.acceptPage(courseId, ids[0]!)).toMatchObject({ ok: false, reason: 'session-not-ready' })
  // 整课验收同样先看会话：不在待验收时说 session-not-ready，不把全部页列成"没验收"（审查附带项）
  expect(await prep.acceptCourse(courseId)).toMatchObject({ ok: false, reason: 'session-not-ready' })
  // 修过的页带它当前的正文修订 id（终审 M4）：正文变了 id 就变，渲染任务的 requestKey 跟着变
  const current = (await store.findMainlineCourse(courseId))!.generationSession!.jobs.find((job) => job.pageId === ids[1])!.contentCheckpoint!.contentRevisionId
  expect(await prep.renderablePages(courseId)).toEqual({ ok: true, pageIds: [ids[1]], revisions: { [ids[1]!]: current } })
})

test('render_page has nothing to queue once the screenshots passed, and the note names the next step', async () => {
  const { prep, store, courseId, fixture } = await generated()
  await renderAll(store, courseId)
  expect(await prep.renderablePages(courseId)).toMatchObject({ ok: true, pageIds: [], note: expect.stringContaining('audit_course') })
  await prep.auditCourse(courseId, fixture.runtime)
  expect(await prep.renderablePages(courseId)).toMatchObject({ ok: true, pageIds: [], note: expect.stringContaining('accept_page') })
})

test('without both authoritative textbook and curriculum sources the teaching review blocks the audit and returns findings', async () => {
  // 单知识点（只有教材摘录）：迁入的 audit.run 存下 insufficient-evidence 的审查记录后抛 AUDIT_BLOCKED（3c 裁决 F1/F17/F18），
  // 门面重读课程，把审查状态与 findings 交给模型；会话停在 course-audit，逐页验收被拒
  const { prep, store, courseId, fixture } = await generated(prepFixtureKnowledge(), [PREP_FIXTURE_KP_IDS[0]])
  await renderAll(store, courseId)
  const audit = await prep.auditCourse(courseId, fixture.runtime)
  expect(audit).toMatchObject({ ok: false, reason: 'audit-blocked', details: { teachingQuality: 'insufficient-evidence', findings: expect.arrayContaining([expect.objectContaining({ severity: 'insufficient-evidence' })]) } })
  expect(await prep.readCourse(courseId)).toMatchObject({ ok: true, course: { qualityStatus: 'blocked', sessionStatus: 'course-audit' } })
  const ids = await pageIds(prep, courseId)
  expect(await prep.acceptPage(courseId, ids[0]!)).toMatchObject({ ok: false, reason: 'session-not-ready' })
})

test('accept_course on a revision marks the previous course superseded through CAS', async () => {
  const { prep, store, courseId, fixture } = await generated()
  await renderAll(store, courseId)
  await prep.auditCourse(courseId, fixture.runtime)
  for (const pageId of await pageIds(prep, courseId)) await prep.acceptPage(courseId, pageId)
  // 把本课登记为 previous 的修订版（revision 不进 AI 教学审查的输入哈希，验收记录仍有效）
  const current = (await store.findMainlineCourseSnapshot(courseId))!
  const previous = { ...current.course, id: 'acc-previous', revision: { familyId: 'acc-previous', revisionNo: 1 } }
  await store.saveMainlineCourse(previous)
  expect(await store.saveMainlineCourseIfUnchanged({ ...current.course, revision: { familyId: 'acc-previous', revisionNo: 2, basedOnCourseId: 'acc-previous' } }, current.updatedAt)).toBe(true)
  const before = (await store.findMainlineCourseSnapshot('acc-previous'))!.updatedAt
  expect(await prep.acceptCourse(courseId)).toMatchObject({ ok: true, acceptance: { planStatus: 'ready' } })
  const after = (await store.findMainlineCourseSnapshot('acc-previous'))!
  expect(after.course.revision).toMatchObject({ supersededByCourseId: courseId })
  expect(after.updatedAt).toBeGreaterThan(before)
})

/** 事实核查替身：把重读到的课程原样返回并挂上给定的核查记录（迁入的 audit.run 在教学审查之前据此阻断） */
function factAuditInternals(record: (pageIds: string[], contentRevisionId: string) => Record<string, unknown>): PrepFacadeInternals {
  return {
    generation: {
      auditFacts: async (course) => {
        const ids = course.pageContent!.pages.map((page) => page.pageId)
        return { course: { ...course, factAudit: record(ids, course.pageContent!.contentRevisionId) as never } }
      },
    },
  }
}

test('a fact-check block returns the fact issues with their pages and advises repairing them', async () => {
  const internals = factAuditInternals((ids, contentRevisionId) => ({
    contentRevisionId, auditedAt: '2026-10-14T00:00:00.000Z', auditedSceneCount: ids.length, auditedSceneIds: ids, requiredSceneIds: ids,
    unverifiedSceneIds: [], pendingSceneIds: [], fatalCount: 1,
    issues: [
      { id: 'f-1', severity: 'blocking', targetId: ids[1], message: '把重章叠句说成了对偶', impact: '学生会混淆两种修辞', fix: '改为重章叠句并举出第二章的诗句' },
      { id: 'f-2', severity: 'info', targetId: ids[0], message: '提示', impact: '无', fix: '无' },
    ],
  }))
  const { prep, store, courseId, fixture } = await generated(prepFixtureKnowledge(), PREP_FIXTURE_KP_IDS, { internals })
  await renderAll(store, courseId)
  const ids = await pageIds(prep, courseId)
  const audit = await prep.auditCourse(courseId, fixture.runtime)
  expect(audit).toMatchObject({
    ok: false, reason: 'audit-blocked',
    details: {
      teachingQuality: null, qualityStatus: 'blocked', findings: [],
      factIssues: [{ severity: 'blocking', pageId: ids[1], message: '把重章叠句说成了对偶', impact: '学生会混淆两种修辞', fix: '改为重章叠句并举出第二章的诗句' }],
      unverifiedPageIds: [], pendingPageIds: [],
      advice: expect.stringContaining('repair_page'),
    },
  })
})

test('a failed fact-check service lists the unverified pages and advises re-running audit_course, not repairing', async () => {
  const internals = factAuditInternals((ids, contentRevisionId) => ({
    contentRevisionId, auditedSceneCount: 0, auditedSceneIds: [], requiredSceneIds: ids, unverifiedSceneIds: ids, fatalCount: 0,
    issues: ids.map((id, index) => ({ id: `u-${index}`, severity: 'info', targetId: id, message: '整课事实核查未完成，当前投影片未经验证。', impact: '未验证', fix: '重新运行整课核查。' })),
  }))
  const { prep, store, courseId, fixture } = await generated(prepFixtureKnowledge(), PREP_FIXTURE_KP_IDS, { internals })
  await renderAll(store, courseId)
  const ids = await pageIds(prep, courseId)
  const audit = await prep.auditCourse(courseId, fixture.runtime)
  expect(audit).toMatchObject({ ok: false, reason: 'audit-blocked', details: { factIssues: [], unverifiedPageIds: ids, advice: expect.stringContaining('audit_course') } })
  const advice = (audit as unknown as { details: { advice: string } }).details.advice
  expect(advice).not.toContain('repair_page')
  expect((audit as { message: string }).message).not.toContain('repair_page')
})

/** 已逐页验收、登记为 acc-previous 修订版的课程；previous 为 false 时只登记不建旧课 */
async function acceptedRevision(documents: CourseDocumentStore, previousExists = true) {
  const { prep, store, courseId, fixture } = await generated(prepFixtureKnowledge(), PREP_FIXTURE_KP_IDS, { documents })
  await renderAll(store, courseId)
  await prep.auditCourse(courseId, fixture.runtime)
  for (const pageId of await pageIds(prep, courseId)) await prep.acceptPage(courseId, pageId)
  const current = (await store.findMainlineCourseSnapshot(courseId))!
  if (previousExists) await store.saveMainlineCourse({ ...current.course, id: 'acc-previous', revision: { familyId: 'acc-previous', revisionNo: 1 } })
  expect(await store.saveMainlineCourseIfUnchanged({ ...current.course, revision: { familyId: 'acc-previous', revisionNo: 2, basedOnCourseId: 'acc-previous' } }, current.updatedAt)).toBe(true)
  return { prep, store, courseId }
}

/** 对 acc-previous 的 CAS 写入一律冲突（或抛错）的文档仓储，其余照常 */
function previousWrites(mode: 'conflict' | 'throw') {
  const inner = createMemoryCourseDocuments()
  let attempts = 0
  const documents: CourseDocumentStore = {
    ...inner,
    async saveIfUnchanged(kind, doc, expected) {
      if (doc.id !== 'acc-previous') return inner.saveIfUnchanged(kind, doc, expected)
      attempts += 1
      if (mode === 'throw') throw new Error('存储不可用')
      return false
    },
  }
  return { documents, attempts: () => attempts }
}

test('accept_course still succeeds when marking the previous course keeps conflicting, and says it was not marked', async () => {
  const writes = previousWrites('conflict')
  const { prep, store, courseId } = await acceptedRevision(writes.documents)
  const result = await prep.acceptCourse(courseId)
  expect(result).toMatchObject({ ok: true, acceptance: { planStatus: 'ready', supersededCourseId: null, note: expect.stringContaining('不会再标') } })
  expect(writes.attempts()).toBe(2)
  expect((await store.findMainlineCourse('acc-previous'))!.revision?.supersededByCourseId).toBeUndefined()
})

test('accept_course still succeeds when marking the previous course throws', async () => {
  const writes = previousWrites('throw')
  const { prep, courseId } = await acceptedRevision(writes.documents)
  expect(await prep.acceptCourse(courseId)).toMatchObject({ ok: true, acceptance: { planStatus: 'ready', supersededCourseId: null, note: expect.stringContaining('存储不可用') } })
})

test('accept_course does not report a superseded course it could not read', async () => {
  const { prep, courseId } = await acceptedRevision(createMemoryCourseDocuments(), false)
  const result = await prep.acceptCourse(courseId)
  expect(result).toMatchObject({ ok: true, acceptance: { planStatus: 'ready', supersededCourseId: null } })
})

test('rehearse is one student-persona model call over the generated pages and does not write the course', async () => {
  const { prep, store, courseId, fixture } = await generated()
  const before = (await store.findMainlineCourseSnapshot(courseId))!.updatedAt
  const calls = fixture.calls.length
  const report = await prep.rehearse(courseId, fixture.runtime)
  expect(report).toMatchObject({ ok: true, report: { issues: [], clearestPageNo: 1 } })
  expect(fixture.calls.length).toBe(calls + 1)
  expect(fixture.calls.at(-1)!.system).toContain('你现在是一名初中生')
  expect((await store.findMainlineCourseSnapshot(courseId))!.updatedAt).toBe(before)
  // 还没生成完的课程不能试学
  const fresh = createPrepFacade({ documents: createMemoryCourseDocuments(), knowledge: prepFixtureKnowledge(), newId })
  const planned = await fresh.planCourse({ kpIds: [...PREP_FIXTURE_KP_IDS] })
  expect(await fresh.rehearse((planned as unknown as { course: { courseId: string } }).course.courseId, fixture.runtime)).toMatchObject({ ok: false, reason: 'session-not-ready' })
})

/**
 * 终审 I1 与 [final-fix]：整课审查的模型请求由 audit 替身决定，其余请求照常走固定回复。
 * 迁入的事实核查把模型异常吞成 unverified 并把错误原文放进 info 项的 fix（page-content-fact-audit.ts），门面从保存的记录里认出来
 */
function auditRuntime(fixture: ReturnType<typeof fixtureRuntime>, audit: { reply: (request: PrepLlmRequest) => string }): PrepRuntime {
  return {
    ...fixture.runtime,
    llm: {
      async completeJson(request: PrepLlmRequest) {
        if ((request.system ?? '').includes('整课事实与教学一致性核查官')) return audit.reply(request)
        return fixture.runtime.llm!.completeJson(request)
      },
    },
  }
}

function transportError(kind: 'auth' | 'timeout' | 'abort'): Error {
  const text = kind === 'auth' ? '模型调用失败：yunyi-llm: HTTP 401: invalid key' : kind === 'timeout' ? '模型调用超时' : '模型调用已取消'
  const error = new Error(`[prep-transport:${kind}] ${text}。`)
  error.name = kind === 'auth' ? 'PrepModelAuthError' : kind === 'timeout' ? 'PrepModelTimeoutError' : 'AbortError'
  return error
}

for (const [kind, reason] of [['auth', 'model-channel-missing'], ['timeout', 'model-unavailable'], ['abort', 'cancelled']] as const) {
  test(`a ${kind} transport failure during audit_course returns ${reason}, not audit-blocked`, async () => {
    const { prep, store, courseId, fixture } = await generated()
    await renderAll(store, courseId)
    const audit = await prep.auditCourse(courseId, auditRuntime(fixture, { reply: () => { throw transportError(kind) } }))
    expect(audit).toMatchObject({ ok: false, reason })
    const text = JSON.stringify(audit)
    // 凭证失效时不能引导模型重跑：每次重跑都会带着失效的凭证再出网一次
    if (kind === 'auth') {
      expect(text).toContain('重新登录')
      expect(text).not.toMatch(/直接重跑|重跑 audit_course|稍后再/)
    }
    expect(text).not.toContain('repair_page')
    // 会话仍停在整课审查，通道恢复后可以再审
    expect(await prep.readCourse(courseId)).toMatchObject({ ok: true, course: { sessionStatus: 'course-audit' } })
  })
}

test('an audit output that fails parsing or validation puts the reason in details and advises re-running, without blaming the model channel', async () => {
  const { prep, store, courseId, fixture } = await generated()
  await renderAll(store, courseId)
  const ids = await pageIds(prep, courseId)
  const audit = await prep.auditCourse(courseId, auditRuntime(fixture, { reply: () => '{"issues":[{"pageIds":[],"severity":"fatal"}],"goalCoverage":[]}' }))
  expect(audit).toMatchObject({ ok: false, reason: 'audit-blocked', details: { unverifiedPageIds: ids, auditError: expect.stringContaining('callLLMJson failed') } })
  const advice = (audit as unknown as { details: { advice: string } }).details.advice
  expect(advice).toContain('重跑 audit_course')
  expect(advice).toContain('auditError')
  expect(advice).not.toContain('模型通道有问题')
  expect(advice).not.toContain('repair_page')
})

test('a fact check that did not finish this run does not carry the previous run\'s teaching findings', async () => {
  // 单知识点：第一次审查跑到教学审查，记下 insufficient-evidence；第二次事实核查失败，教学审查没有跑
  const { prep, store, courseId, fixture } = await generated(prepFixtureKnowledge(), [PREP_FIXTURE_KP_IDS[0]])
  await renderAll(store, courseId)
  const first = await prep.auditCourse(courseId, fixture.runtime)
  expect(first).toMatchObject({ ok: false, reason: 'audit-blocked', details: { teachingQuality: 'insufficient-evidence', findings: expect.arrayContaining([expect.objectContaining({ severity: 'insufficient-evidence' })]) } })
  const second = await prep.auditCourse(courseId, auditRuntime(fixture, { reply: () => 'not json' }))
  expect(second).toMatchObject({ ok: false, reason: 'audit-blocked', details: { teachingQuality: null, findings: [], unverifiedPageIds: expect.any(Array) } })
  expect((second as unknown as { details: { unverifiedPageIds: string[] } }).details.unverifiedPageIds.length).toBeGreaterThan(0)
})

test('when a finding\'s own fix asks to re-run the review, the advice follows the finding instead of telling the model to repair pages', async () => {
  // 教学审查结果缺失（迁入代码记为 review-integrity 的 insufficient-evidence，fix 是"重新运行审查"），事实核查本身通过
  const { prep, store, courseId, fixture } = await generated()
  await renderAll(store, courseId)
  const audit = await prep.auditCourse(courseId, auditRuntime(fixture, {
    reply: (request) => {
      const full = JSON.parse(fixtureLlmReply(request)) as Record<string, unknown>
      delete full.teachingQualityReview
      return JSON.stringify(full)
    },
  }))
  expect(audit).toMatchObject({ ok: false, reason: 'audit-blocked', details: { teachingQuality: 'insufficient-evidence', findings: [expect.objectContaining({ action: 'rerun-audit' })], factIssues: [] } })
  const advice = (audit as unknown as { details: { advice: string } }).details.advice
  expect(advice).toContain('重跑 audit_course')
  expect(advice).not.toContain('repair_page')
})

test('missing authoritative sources are reported as add-source, not as pages to repair', async () => {
  const { prep, store, courseId, fixture } = await generated(prepFixtureKnowledge(), [PREP_FIXTURE_KP_IDS[0]])
  await renderAll(store, courseId)
  const audit = await prep.auditCourse(courseId, fixture.runtime)
  const details = (audit as unknown as { details: { findings: Array<{ action: string }>; advice: string } }).details
  expect(details.findings.length).toBeGreaterThan(0)
  expect(details.findings.every((finding) => finding.action === 'add-source')).toBe(true)
  expect(details.advice).toContain('来源')
  expect(details.advice).not.toContain('repair_page')
})
