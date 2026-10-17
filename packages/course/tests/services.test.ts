import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import type { MainlineCourse } from '../src/mainline/domain.js'
import { createGenerationSession } from '../src/mainline/generation-session.js'
import type { GeneratedLessonPage } from '../src/mainline/planning/page-content-contract.js'
import type { CoursePlanningState, LessonPagePlan } from '../src/mainline/planning/page-contract.js'
import { buildPrepBriefForCourse } from '../src/mainline/prep-brief.js'
import { createSeason } from '../src/mainline/season.js'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import type { CourseDocumentStore, CourseKnowledgePort, CourseKnowledgeRow } from '../src/ports.js'
import { runWithCourseRuntime } from '../src/runtime.js'
import { createCourseFromKps } from '../src/services/course-from-kps.js'
import { CourseServiceError } from '../src/services/errors.js'
import { createCourseGenerationServices } from '../src/services/generation.js'
import { updateCoursePlan } from '../src/services/plan.js'

const KPS: CourseKnowledgeRow[] = [
  { id: 'kp-pyth', canonical_name: '勾股定理', subject: '数学', grade_band: '初中', annotations: JSON.stringify({ knowledgeType: { value: 'procedural', source: 'llm' }, learningObjectives: { value: ['能用勾股定理求直角三角形的未知边长'], source: 'llm' } }) },
  { id: 'kp-pyth-inv', canonical_name: '勾股定理的逆定理', subject: '数学', grade_band: '初中', annotations: null },
  { id: 'kp-optics', canonical_name: '凸透镜成像', subject: '物理', grade_band: '初中', annotations: null },
  { id: 'kp-cell', canonical_name: '细胞的结构', subject: '生物', grade_band: 'middle', annotations: null },
  { id: 'kp-ratio', canonical_name: '比例', subject: '数学', grade_band: '初中阶段', annotations: null },
  { id: 'kp-odd', canonical_name: '未标学段', subject: '数学', grade_band: 'grade-x', annotations: null },
  { id: 'kp-blank', canonical_name: '空学段', subject: '数学', grade_band: null, annotations: null },
  { id: 'kp-proto', canonical_name: '内置键', subject: 'constructor', grade_band: 'constructor', annotations: null },
]
function fakeKnowledge() {
  const asked: string[][] = []
  const port: CourseKnowledgePort = {
    async knowledgePoints(ids) { asked.push([...ids]); return KPS.filter((kp) => ids.includes(kp.id)) },
    async knowledgePointSources(ids) {
      return ids.includes('kp-pyth') ? [{ knowledgePointId: 'kp-pyth', source: 'textbook-body', externalId: 'pep-math-8b-17-1', evidenceSnippet: '直角三角形两直角边的平方和等于斜边的平方。', confidence: 0.9 }] : []
    },
  }
  return { port, asked }
}
function deps() {
  const store = createMainlineCourseStore(createMemoryCourseDocuments())
  const knowledge = fakeKnowledge()
  let n = 0
  return { store, knowledge, deps: { store, knowledge: knowledge.port, newId: () => `course-${++n}` } }
}

test('a draft course is compiled from knowledge points without any mastery input and saved', async () => {
  const t = deps()
  const created = await createCourseFromKps({ kpIds: ['kp-pyth', 'kp-pyth-inv'] }, t.deps)
  expect(created).toMatchObject({ courseId: 'course-1', subject: 'math', gradeBand: 'middle-school', planStatus: 'planning', qualityStatus: expect.any(String) })
  expect(created.plannedPages).toBeGreaterThan(0)
  expect(created.sourceCoverage.resourceCatalogAvailable).toBe(false)
  expect(created).not.toHaveProperty('reinforcedKpIds')
  expect(t.knowledge.asked).toEqual([['kp-pyth', 'kp-pyth-inv']])
  const course = (await t.store.findMainlineCourse('course-1'))!
  expect(course.revision).toEqual({ familyId: 'course-1', revisionNo: 1 })
  expect(course.planning!.pages).toHaveLength(created.plannedPages!)
})

test('invalid input and unknown knowledge points are rejected before anything is saved', async () => {
  const t = deps()
  await expect(createCourseFromKps({ kpIds: [] }, t.deps)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  await expect(createCourseFromKps({ kpIds: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }, t.deps)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const unknown = await createCourseFromKps({ kpIds: ['kp-pyth', 'kp-nope'] }, t.deps).catch((e: unknown) => e)
  expect(unknown).toBeInstanceOf(CourseServiceError)
  expect(unknown).toMatchObject({ code: 'UNKNOWN_KP', details: { missing: ['kp-nope'] } })
  expect(await t.store.listMainlineCourses()).toEqual([])
})

test('grade band spellings already used in the repo map without an assumption warning', async () => {
  const t = deps()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    for (const kpId of ['kp-cell', 'kp-ratio', 'kp-pyth']) {
      const created = await createCourseFromKps({ kpIds: [kpId] }, t.deps)
      expect(created.gradeBand).toBe('middle-school')
      expect(created).not.toHaveProperty('gradeBandAssumed')
    }
    // 回退值本身也是初中，所以用"没有记录未映射值"区分真映射与静默回退
    expect(warn).not.toHaveBeenCalled()
  } finally {
    warn.mockRestore()
  }
})

test('an unmapped grade band still falls back to middle school but says so and logs only the raw values', async () => {
  const t = deps()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const created = await createCourseFromKps({ kpIds: ['kp-odd', 'kp-blank'] }, t.deps)
    expect(created).toMatchObject({ gradeBand: 'middle-school', gradeBandAssumed: true })
    expect(warn).toHaveBeenCalledTimes(1)
    const logged = warn.mock.calls[0]!.map(String).join(' ')
    expect(logged).toContain('grade-x')
    expect(logged).not.toContain('未标学段')
    warn.mockClear()
    // 有一个知识点能映射时按映射结果走，不报假设，但仍记录无法映射的值
    const mixed = await createCourseFromKps({ kpIds: ['kp-odd', 'kp-ratio'] }, t.deps)
    expect(mixed).not.toHaveProperty('gradeBandAssumed')
    expect(warn.mock.calls.map((call) => call.map(String).join(' ')).join(' | ')).toContain('grade-x')
  } finally {
    warn.mockRestore()
  }
})

test('built-in object keys such as constructor are not valid grade or subject spellings', async () => {
  const t = deps()
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const created = await createCourseFromKps({ kpIds: ['kp-proto'] }, t.deps)
    expect(created).toMatchObject({ subject: 'general', gradeBand: 'middle-school', gradeBandAssumed: true })
    expect(warn.mock.calls.map((call) => call.map(String).join(' ')).join(' | ')).toContain('constructor')
  } finally {
    warn.mockRestore()
  }
})

test('a course joins a matching season as the next episode; a mismatched season is refused', async () => {
  const t = deps()
  await t.store.saveSeason(createSeason({ id: 'season-math', title: '数学季', subject: 'math', gradeBand: 'middle-school', seasonTheme: '看见数量关系', createdAt: '2026-10-13T00:00:00.000Z' }))
  const created = await createCourseFromKps({ kpIds: ['kp-pyth'], seasonId: 'season-math', lessonPhase: 'review' }, t.deps)
  expect(created.season).toEqual({ seasonId: 'season-math', episodeNo: 1 })
  expect((await t.store.findMainlineCourse(created.courseId))!.lessonPhase).toBe('review')
  await expect(createCourseFromKps({ kpIds: ['kp-optics'], seasonId: 'season-math' }, t.deps)).rejects.toMatchObject({ code: 'SEASON_MISMATCH' })
  await expect(createCourseFromKps({ kpIds: ['kp-pyth'], seasonId: 'season-none' }, t.deps)).rejects.toMatchObject({ code: 'UNKNOWN_SEASON' })
})

test('approving the plan attaches a generation session; a second approval conflicts', async () => {
  const t = deps()
  const { courseId, plannedPages } = await createCourseFromKps({ kpIds: ['kp-pyth'] }, t.deps)
  await expect(updateCoursePlan('course-missing', { action: 'approve', updates: [] }, t.deps)).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' })
  await expect(updateCoursePlan(courseId, { action: 'publish' }, t.deps)).rejects.toMatchObject({ code: 'INVALID_INPUT' })
  const approved = await updateCoursePlan(courseId, { action: 'approve', updates: [] }, t.deps)
  expect(approved).toMatchObject({ ok: true, courseId, plannedPages, generationSessionId: expect.any(String) })
  const course = (await t.store.findMainlineCourse(courseId))!
  expect(course.generationSession!.jobs.map((job) => job.status).every((status) => status === 'queued')).toBe(true)
  await expect(updateCoursePlan(courseId, { action: 'approve', updates: [] }, t.deps)).rejects.toMatchObject({ code: 'PLAN_CONFLICT' })
})

test('the prep brief comes from the store and knowledge port with no mastery section', async () => {
  const t = deps()
  const { courseId } = await createCourseFromKps({ kpIds: ['kp-pyth', 'kp-pyth-inv'] }, t.deps)
  const brief = (await buildPrepBriefForCourse(courseId, { store: t.store, knowledge: t.knowledge.port }))!
  expect(brief.courseId).toBe(courseId)
  expect(brief.kps).toHaveLength(2)
  expect(await buildPrepBriefForCourse('course-missing', { store: t.store, knowledge: t.knowledge.port })).toBeUndefined()
})

// 生成会话装配：用 maolab generation-page-runner.test 同款的两页解释型计划，正文生成与核查注入桩
const planPages: LessonPagePlan[] = [1, 2].map((order) => ({
  id: `page-${order}`, order, fragmentId: 'fragment-1', knowledgePointIds: [], purpose: 'explain', audience: 'student',
  learningAction: `理解第 ${order} 个要点。`, newInformation: `第 ${order} 个新信息。`, sourceRefs: [],
  contentSpec: { kind: 'explanation', focus: `概念 ${order}`, requiredElements: [`要点 ${order}`] },
  visualSpec: { required: false, form: 'none', reason: '不需要图像。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '讲清要点。', teachingMove: '追问依据。', pace: 'brief' }, arcStepId: 'arc-1',
  ...(order === 2 ? { previousPageId: 'page-1' } : {}),
}))
// 第 1 页要求教学图像：走默认 prepareVisual（fillImages → generateImage → requireCourseImage）
const imagePlanPages: LessonPagePlan[] = planPages.map((page) => page.order === 1
  ? { ...page, visualSpec: { required: true, form: 'instructional-image', reason: '帮助观察。', sourceAssetPolicy: 'grounded-or-generate' } }
  : page)
function approvedCourse(id: string, pages: LessonPagePlan[] = planPages): MainlineCourse {
  const planning: CoursePlanningState = { schemaVersion: 'mainline-page-v2', courseId: id, planRevisionId: 'plan-1', status: 'plan-approved', learningContracts: [], arc: { id: 'arc-1', courseId: id, steps: [] }, pages }
  const course = { id, topic: '装配测试课', subject: 'math', gradeBand: 'middle-school', boundary: '', sourceMaterial: [], planning, qualityStatus: 'draft' } as unknown as MainlineCourse
  course.generationSession = createGenerationSession(course, 'session-1', '2026-10-13T00:00:00.000Z')
  return course
}
const generatedPage = (planPage: LessonPagePlan): GeneratedLessonPage => ({
  pageId: planPage.id, order: planPage.order, purpose: planPage.purpose, planRevisionId: 'plan-1', sourceRefs: [],
  content: { kind: 'explanation', title: `概念 ${planPage.order}`, coreStatement: `先理解第 ${planPage.order} 个概念。`, evidence: [{ text: `这是第 ${planPage.order} 个新信息。` }], boundary: '仅用于测试。' },
  teacherCompanion: { script: '请观察并说明依据。', notes: [], pace: 'brief' },
})

test('generation services bind the migrated runners to the store and survive a new instance', async () => {
  const t = deps()
  await t.store.saveMainlineCourse(approvedCourse('course-gen'))
  const options = { pages: { generate: async ({ planPage }: { planPage: LessonPagePlan }) => generatedPage(planPage), auditFacts: async (_c: MainlineCourse, page: GeneratedLessonPage) => ({ revisionId: `fact:${page.pageId}` }) } }
  const first = await createCourseGenerationServices(t.store, options).pages.runNext('course-gen', '2026-10-13T00:01:00.000Z')
  expect(first.done).toBe(false)
  const second = await createCourseGenerationServices(t.store, options).pages.runNext('course-gen', '2026-10-13T00:02:00.000Z')
  expect(second).toMatchObject({ done: true, session: { status: 'rendering' } })
  expect((await t.store.findMainlineCourse('course-gen'))!.pageContent!.pages.map((page) => page.pageId)).toEqual(['page-1', 'page-2'])
  expect(createCourseGenerationServices(t.store).render).toBeUndefined()
})

test('default page generation needs an injected model channel and uses it', async () => {
  const t = deps()
  await t.store.saveMainlineCourse(approvedCourse('course-default'))
  // 全部用默认依赖（generate、auditFacts、prepareVisual）；没有通道时在 generate 处就失败
  const services = createCourseGenerationServices(t.store)
  await expect(services.pages.runNext('course-default')).rejects.toThrow()
  const blocked = (await t.store.findMainlineCourse('course-default'))!.generationSession!.jobs[0]!
  expect(JSON.stringify(blocked)).toContain('备课模型通道未配置') // 诊断里带通道缺失的原因
  let calls = 0
  const llm = { async completeJson() { calls += 1; return 'not json' } }
  await t.store.saveMainlineCourse(approvedCourse('course-default-2'))
  await expect(runWithCourseRuntime({ llm, sleep: async () => {} }, () => services.pages.runNext('course-default-2'))).rejects.toThrow()
  expect(calls).toBeGreaterThan(0)
})

const stubGenerate = { generate: async ({ planPage }: { planPage: LessonPagePlan }) => generatedPage(planPage) }
const passingAudit = () => {
  const seen: string[] = []
  const llm = { async completeJson(request: { user: string }) { seen.push(request.user); return '{"issues":[]}' } }
  return { llm, seen }
}
const jobDiagnostics = async (store: ReturnType<typeof createMainlineCourseStore>, id: string) =>
  JSON.stringify((await store.findMainlineCourse(id))!.generationSession!.jobs[0]!.diagnostics)

test('the default per-page fact audit needs the model channel and calls it', async () => {
  const t = deps()
  const services = createCourseGenerationServices(t.store, { pages: stubGenerate })
  await t.store.saveMainlineCourse(approvedCourse('course-audit-missing'))
  await expect(services.pages.runNext('course-audit-missing')).rejects.toThrow('备课模型通道未配置')
  expect(await jobDiagnostics(t.store, 'course-audit-missing')).toContain('备课模型通道未配置')

  await t.store.saveMainlineCourse(approvedCourse('course-audit-ok'))
  const audit = passingAudit()
  const result = await runWithCourseRuntime({ llm: audit.llm, sleep: async () => {} }, () => services.pages.runNext('course-audit-ok'))
  expect(result.done).toBe(false)
  expect(audit.seen).toHaveLength(1)
  expect(JSON.parse(audit.seen[0]!)).toMatchObject({ page: { pageId: 'page-1' } })
  const job = (await t.store.findMainlineCourse('course-audit-ok'))!.generationSession!.jobs[0]!
  expect(JSON.stringify(job)).toMatch(/page-fact:page-1:[a-f0-9]{16}/)
})

test('the default visual step needs the image channel and uses it without writing into the repo', async () => {
  const generatedDir = resolve(process.cwd(), 'public', 'generated-images')
  const dirExisted = existsSync(generatedDir)
  const t = deps()
  const services = createCourseGenerationServices(t.store, { pages: stubGenerate })

  // 只有模型通道、没有图像通道：图像步骤失败，单页核查不会被调用
  await t.store.saveMainlineCourse(approvedCourse('course-image-missing', imagePlanPages))
  const noImage = passingAudit()
  await expect(runWithCourseRuntime({ llm: noImage.llm, sleep: async () => {} }, () => services.pages.runNext('course-image-missing'))).rejects.toThrow('备课图像通道未配置')
  expect(noImage.seen).toHaveLength(0)
  // 3b：通道缺失原样上抛，诊断点明缺的是图像通道（3a 终审 Note for 3b）
  const diagnostics = await jobDiagnostics(t.store, 'course-image-missing')
  expect(diagnostics).toContain('备课图像通道未配置')

  await t.store.saveMainlineCourse(approvedCourse('course-image-ok', imagePlanPages))
  const prompts: { prompt: string; size: string }[] = []
  const image = { async generate(prompt: string, request: { size: string }) { prompts.push({ prompt, size: request.size }); return 'artifact:image-1' } }
  const withImage = passingAudit()
  const result = await runWithCourseRuntime({ llm: withImage.llm, image, sleep: async () => {} }, () => services.pages.runNext('course-image-ok'))
  expect(result.done).toBe(false)
  expect(prompts).toHaveLength(1)
  expect(prompts[0]!.size).toBe('1024x768')
  expect(withImage.seen).toHaveLength(1)
  expect((await t.store.findMainlineCourse('course-image-ok'))!.pageContent!.pages[0]).toMatchObject({ pageId: 'page-1', imageUrl: 'artifact:image-1' })

  // 数学课不会走经纬网 SVG 落盘分支（fill-images 写 cwd/public/generated-images，3b 修）
  expect(existsSync(generatedDir)).toBe(dirExisted)
})

test('the default whole-course fact audit goes through the model channel exactly once', async () => {
  const t = deps()
  // 整课核查的提示负载要读 course.goals，装配夹具补一个空数组
  await t.store.saveMainlineCourse({ ...approvedCourse('course-final'), goals: [] })
  const services = createCourseGenerationServices(t.store, {
    pages: { ...stubGenerate, auditFacts: async (_c: MainlineCourse, page: GeneratedLessonPage) => ({ revisionId: `fact:${page.pageId}` }) },
    render: {
      capture: async () => ({ screenshot: Buffer.from('png-bytes'), metrics: { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, occupiedAreaRatio: 0.35, visualElementCount: 0 } }),
      writeEvidence: async (_courseId, _pageId, evidenceId) => `artifact:${evidenceId}`,
    },
  })
  while (!(await services.pages.runNext('course-final')).done) { /* 逐页生成 */ }
  let rendered = await services.render!.runNext('course-final', 'http://render.invalid')
  while (!rendered.done) rendered = await services.render!.runNext('course-final', 'http://render.invalid')
  expect(rendered.session.status).toBe('course-audit')

  // 没有通道：整课核查记为未验证并阻断，原因写进核查记录
  await expect(services.audit.run('course-final')).rejects.toMatchObject({ code: 'AUDIT_BLOCKED' })
  const blocked = (await t.store.findMainlineCourse('course-final'))!
  expect(blocked.qualityStatus).toBe('blocked')
  expect(JSON.stringify(blocked.factAudit)).toContain('备课模型通道未配置')

  // 有通道：默认 auditFacts 只发一次请求（maxAttempts: 1）
  let calls = 0
  const llm = { async completeJson() { calls += 1; return 'not json' } }
  await expect(runWithCourseRuntime({ llm, sleep: async () => {} }, () => services.audit.run('course-final'))).rejects.toMatchObject({ code: 'AUDIT_BLOCKED' })
  expect(calls).toBe(1)
})

// 终审：多写者（3b worker、3c 工具、3d 接口写同一课程）。racingStore 在第 n 次写入前插入另一写者的写入，模拟跨进程交错。
function racingStore(beforeWrite: (call: number, direct: ReturnType<typeof createMainlineCourseStore>) => Promise<void>) {
  const documents = createMemoryCourseDocuments()
  const direct = createMainlineCourseStore(documents)
  let calls = 0
  const wrapped: CourseDocumentStore = {
    find: documents.find,
    list: documents.list,
    delete: documents.delete,
    async save(kind, doc) { calls += 1; await beforeWrite(calls, direct); return documents.save(kind, doc) },
    async saveIfUnchanged(kind, doc, expected) { calls += 1; await beforeWrite(calls, direct); return documents.saveIfUnchanged(kind, doc, expected) },
  }
  return { racing: createMainlineCourseStore(wrapped), direct, writes: () => calls }
}
const stubPages = { pages: { ...stubGenerate, auditFacts: async (_c: MainlineCourse, page: GeneratedLessonPage) => ({ revisionId: `fact:${page.pageId}` }) } }
const otherWriterEdits = async (direct: ReturnType<typeof createMainlineCourseStore>, id: string, boundary: string) => {
  const current = (await direct.findMainlineCourse(id))!
  await direct.saveMainlineCourse({ ...current, boundary })
}

test('a page write that races another writer re-reads, merges the page and keeps the other write', async () => {
  const t = racingStore(async (call, direct) => { if (call === 2) await otherWriterEdits(direct, 'course-race', '另一写者的修改') })
  await t.direct.saveMainlineCourse(approvedCourse('course-race'))
  const result = await createCourseGenerationServices(t.racing, stubPages).pages.runNext('course-race', '2026-10-13T00:01:00.000Z')
  expect(result.done).toBe(false)
  const stored = (await t.direct.findMainlineCourse('course-race'))!
  expect(stored.boundary).toBe('另一写者的修改')
  expect(stored.pageContent!.pages.map((page) => page.pageId)).toEqual(['page-1'])
  expect(stored.generationSession!.jobs[0]!.status).toBe('content-ready')
  expect(t.writes()).toBe(3) // 开始页 1 次 + 合并写冲突 1 次 + 重读后重试 1 次
})

test('a page write that races a session change is refused and the other write survives', async () => {
  const t = racingStore(async (call, direct) => {
    if (call !== 2) return
    const session = (await direct.findMainlineCourse('course-race-cancel'))!.generationSession!
    await createCourseGenerationServices(direct).session.execute('course-race-cancel', { action: 'cancel', expectedUpdatedAt: session.updatedAt }, '2026-10-13T00:01:30.000Z')
  })
  await t.direct.saveMainlineCourse(approvedCourse('course-race-cancel'))
  await expect(createCourseGenerationServices(t.racing, stubPages).pages.runNext('course-race-cancel', '2026-10-13T00:01:00.000Z')).rejects.toMatchObject({ code: 'SESSION_CONFLICT' })
  const stored = (await t.direct.findMainlineCourse('course-race-cancel'))!
  expect(stored.generationSession!.status).toBe('cancelled')
  expect(stored.pageContent).toBeUndefined()
})

test('a page write that keeps conflicting gives up after three attempts with a write-conflict error', async () => {
  const t = racingStore(async (call, direct) => { if (call >= 2) await otherWriterEdits(direct, 'course-race-busy', `第 ${call} 次插入`) })
  await t.direct.saveMainlineCourse(approvedCourse('course-race-busy'))
  const error = await createCourseGenerationServices(t.racing, stubPages).pages.runNext('course-race-busy', '2026-10-13T00:01:00.000Z').catch((e: unknown) => e)
  expect(error).toMatchObject({ code: 'WRITE_CONFLICT', courseId: 'course-race-busy' })
  expect(String((error as Error).message)).toContain('写入冲突')
  expect(t.writes()).toBe(7) // 开始页 1 次 + 合并写 3 次 + 失败记录 3 次，全部冲突
  const stored = (await t.direct.findMainlineCourse('course-race-busy'))!
  expect(stored.boundary).toBe('第 7 次插入')
  expect(stored.pageContent).toBeUndefined()
})

test('a session command that races another writer is refused instead of overwriting it', async () => {
  const t = racingStore(async (call, direct) => { if (call === 1) await otherWriterEdits(direct, 'course-race-session', '另一写者的修改') })
  await t.direct.saveMainlineCourse(approvedCourse('course-race-session'))
  const session = (await t.direct.findMainlineCourse('course-race-session'))!.generationSession!
  await expect(createCourseGenerationServices(t.racing).session.execute('course-race-session', { action: 'cancel', expectedUpdatedAt: session.updatedAt })).rejects.toMatchObject({ code: 'WRITE_CONFLICT' })
  const stored = (await t.direct.findMainlineCourse('course-race-session'))!
  expect(stored.boundary).toBe('另一写者的修改')
  expect(stored.generationSession!.status).toBe('generating')
})

test('two service instances running the same course at once: one wins, the other gets a write conflict', async () => {
  const t = deps()
  await t.store.saveMainlineCourse(approvedCourse('course-two-writers'))
  const slow = { pages: { ...stubPages.pages, generate: async ({ planPage }: { planPage: LessonPagePlan }) => { await new Promise((r) => setTimeout(r, 5)); return generatedPage(planPage) } } }
  const results = await Promise.allSettled([
    createCourseGenerationServices(t.store, slow).pages.runNext('course-two-writers', '2026-10-13T00:01:00.000Z'),
    createCourseGenerationServices(t.store, slow).pages.runNext('course-two-writers', '2026-10-13T00:01:01.000Z'),
  ])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
  expect(rejected).toHaveLength(1)
  expect(rejected[0]!.reason).toMatchObject({ code: 'WRITE_CONFLICT' })
  const stored = (await t.store.findMainlineCourse('course-two-writers'))!
  expect(stored.pageContent!.pages.map((page) => page.pageId)).toEqual(['page-1'])
  expect(stored.generationSession!.jobs.map((job) => job.status)).toEqual(['content-ready', 'queued'])
})

test('a plan update that races another writer is refused as a plan conflict', async () => {
  const t = racingStore(async (call, direct) => { if (call === 2) await otherWriterEdits(direct, 'course-1', '另一写者的修改') })
  const { courseId } = await createCourseFromKps({ kpIds: ['kp-pyth'] }, { store: t.racing, knowledge: fakeKnowledge().port, newId: () => 'course-1' })
  await expect(updateCoursePlan(courseId, { action: 'approve', updates: [] }, { store: t.racing })).rejects.toMatchObject({ code: 'PLAN_CONFLICT' })
  const stored = (await t.direct.findMainlineCourse(courseId))!
  expect(stored.boundary).toBe('另一写者的修改')
  expect(stored.generationSession).toBeUndefined()
})

test('a render write that races another writer re-reads and binds the evidence without losing the other write', async () => {
  // 两页逐页生成共 4 次写，第 5 次是第一页截图证据的写入：在它之前插入另一写者
  const t = racingStore(async (call, direct) => { if (call === 5) await otherWriterEdits(direct, 'course-race-render', '另一写者的修改') })
  await t.direct.saveMainlineCourse(approvedCourse('course-race-render'))
  const services = createCourseGenerationServices(t.racing, {
    ...stubPages,
    render: {
      capture: async () => ({ screenshot: Buffer.from('png-bytes'), metrics: { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, occupiedAreaRatio: 0.35, visualElementCount: 0 } }),
      writeEvidence: async (_courseId, _pageId, evidenceId) => `artifact:${evidenceId}`,
    },
  })
  while (!(await services.pages.runNext('course-race-render')).done) { /* 逐页生成 */ }
  expect(t.writes()).toBe(4)
  const rendered = await services.render!.runNext('course-race-render', 'http://render.invalid')
  expect(rendered.done).toBe(false)
  expect(t.writes()).toBe(6)
  const stored = (await t.direct.findMainlineCourse('course-race-render'))!
  expect(stored.boundary).toBe('另一写者的修改')
  expect(stored.pageRenderEvidence!.map((item) => item.pageId)).toEqual(['page-1'])
  expect(stored.generationSession!.jobs[0]!.status).toBe('passed')
})

test('a failing image channel keeps its reason in the diagnostics', async () => {
  const t = deps()
  const services = createCourseGenerationServices(t.store, { pages: stubGenerate })
  await t.store.saveMainlineCourse(approvedCourse('course-image-down', imagePlanPages))
  const image = { async generate(): Promise<string> { throw new Error('HTTP 503 上游图像服务不可用') } }
  const audit = passingAudit()
  await expect(runWithCourseRuntime({ llm: audit.llm, image, sleep: async () => {} }, () => services.pages.runNext('course-image-down')))
    .rejects.toThrow('页面 1 需要教学图像，但图像生成失败。（HTTP 503 上游图像服务不可用）')
  expect(await jobDiagnostics(t.store, 'course-image-down')).toContain('HTTP 503 上游图像服务不可用')
  expect(audit.seen).toHaveLength(0)
})

test('the coordinate grid goes to the injected asset sink, never to the process directory', async () => {
  const generatedDir = resolve(process.cwd(), 'public', 'generated-images')
  const dirExisted = existsSync(generatedDir)
  const t = deps()
  const gridPage = (planPage: LessonPagePlan): GeneratedLessonPage => ({
    ...generatedPage(planPage),
    content: { kind: 'explanation', title: '经纬网定位', coreStatement: 'A点位于东经120°、北纬40°。', evidence: [{ text: '先读经度再读纬度。' }], boundary: '仅用于测试。' },
  })
  const services = createCourseGenerationServices(t.store, { pages: { generate: async ({ planPage }: { planPage: LessonPagePlan }) => gridPage(planPage) } })
  const geography = (id: string) => ({ ...approvedCourse(id, imagePlanPages), subject: 'geography', topic: '经纬网定位' }) as MainlineCourse

  // 没有产物存储：经纬网走确定性 SVG，不调图像通道，以"产物存储未配置"失败
  await t.store.saveMainlineCourse(geography('course-grid-missing'))
  const first = passingAudit()
  await expect(runWithCourseRuntime({ llm: first.llm, sleep: async () => {} }, () => services.pages.runNext('course-grid-missing'))).rejects.toThrow('备课产物存储未配置')
  expect(await jobDiagnostics(t.store, 'course-grid-missing')).toContain('备课产物存储未配置')

  // 有产物存储：SVG 交给它，页面图片地址就是它返回的地址；图像通道一次都不调
  await t.store.saveMainlineCourse(geography('course-grid-ok'))
  const puts: { contentType: string; name: string; text: string }[] = []
  const assets = { async put(input: { bytes: Uint8Array; contentType: string; name: string }) { puts.push({ contentType: input.contentType, name: input.name, text: new TextDecoder().decode(input.bytes) }); return '/api/prep/artifacts/ar_grid' } }
  const image = { async generate(): Promise<string> { throw new Error('经纬网不应调用图像通道') } }
  const second = passingAudit()
  await runWithCourseRuntime({ llm: second.llm, image, assets, sleep: async () => {} }, () => services.pages.runNext('course-grid-ok'))
  expect(puts).toHaveLength(1)
  expect(puts[0]).toMatchObject({ contentType: 'image/svg+xml', name: expect.stringMatching(/^coordinate-grid-course-grid-ok-page-1-[a-f0-9]{12}\.svg$/) })
  expect(puts[0]!.text).toContain('120°E')
  expect((await t.store.findMainlineCourse('course-grid-ok'))!.pageContent!.pages[0]).toMatchObject({ pageId: 'page-1', imageUrl: '/api/prep/artifacts/ar_grid' })
  expect(existsSync(generatedDir)).toBe(dirExisted)
})

test('k12 knowledge points carry no textbook evidence: the course is still created and coverage says so', async () => {
  const annotations = JSON.stringify({
    knowledgeType: { value: 'conceptual', source: 'llm', confidence: 0.95 },
    learningObjectives: { value: ['能说出二力平衡的四个条件', '能判断物体受力是否平衡'], source: 'llm', confidence: 0.95 },
    misconceptions: { value: ['认为物体运动就一定受力不平衡'], source: 'llm', confidence: 0.95 },
  })
  const store = createMainlineCourseStore(createMemoryCourseDocuments())
  const knowledge: CourseKnowledgePort = {
    async knowledgePoints(ids) { return ids.includes('kp-k12') ? [{ id: 'kp-k12', canonical_name: '二力平衡', subject: '物理', grade_band: '初中', annotations }] : [] },
    async knowledgePointSources() { return [] },
  }
  const created = await createCourseFromKps({ kpIds: ['kp-k12'] }, { store, knowledge, newId: () => 'course-k12' })
  expect(created).toMatchObject({ courseId: 'course-k12', subject: 'physics', gradeBand: 'middle-school', planStatus: 'planning' })
  expect(created.plannedPages).toBeGreaterThan(0)
  expect(created.sourceCoverage).toMatchObject({ authoritativeExcerptKps: 0, aiExtractedKps: 0, unverifiedExcerptKps: 0, unprovenancedKps: 1 })
  expect(created.qualityStatus).toBe('draft')
})
