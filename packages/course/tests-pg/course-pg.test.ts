import { afterAll, beforeAll, expect, test } from 'vitest'
import { applyCourseDdl, CourseOwnerMismatchError, PgCourseDocuments, PgCourseKnowledge } from '@maolab/domain'
import type { MainlineCourse } from '../src/mainline/domain.js'
import type { CourseDocumentStore } from '../src/ports.js'
import { completePageContent, createGenerationSession, generationInputHash, startPageGeneration } from '../src/mainline/generation-session.js'
import type { CoursePlanningState, LessonPagePlan } from '../src/mainline/planning/page-contract.js'
import { createSeason } from '../src/mainline/season.js'
import { buildPrepBriefForCourse, createCourseFromKps, createCourseGenerationServices, createMainlineCourseStore, updateCoursePlan } from '../src/index.js'
import { fetchKpMetadata } from '../src/mainline/kp-metadata.js'
import { testPool } from './helpers.js'

const pool = testPool()
const DOCS = 'course_test_documents'
const KN = 'course_test_knowledge'
const A = 'course_test_teacher_a'
const B = 'course_test_teacher_b'
const documents = new PgCourseDocuments(pool, { schema: DOCS })
const knowledge = new PgCourseKnowledge(pool, { schema: KN })
// 编译期契合检查（Task 5 留给 T7）：@maolab/domain 的 forOwner() 必须满足 @maolab/course 的 CourseDocumentStore（typecheck 覆盖 tests-pg）
const storeA = createMainlineCourseStore(documents.forOwner(A) satisfies CourseDocumentStore)
const storeB = createMainlineCourseStore(documents.forOwner(B) satisfies CourseDocumentStore)

beforeAll(async () => {
  for (const s of [DOCS, KN]) await pool.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
  await pool.query(`insert into account.users (username, external_id, created_at, updated_at) values ($1, $1, 0, 0), ($2, $2, 0, 0) on conflict do nothing`, [A, B])
  await applyCourseDdl(pool, DOCS)
  await pool.query(`CREATE SCHEMA ${KN}`)
  await pool.query(`CREATE TABLE ${KN}.knowledge_points (id text primary key, canonical_name text not null, subject text not null, grade_band text not null default '', annotations jsonb not null default '{}')`)
  await pool.query(`CREATE TABLE ${KN}.knowledge_point_sources (id text primary key, knowledge_point_id text not null, source text not null, external_id text, evidence_snippet text, confidence double precision)`)
  await pool.query(`INSERT INTO ${KN}.knowledge_points (id, canonical_name, subject, grade_band) VALUES ('kp-pyth', '勾股定理', '数学', '初中'), ('kp-pyth-inv', '勾股定理的逆定理', '数学', '初中')`)
  // 真实形状的 jsonb 标注（终审：annotations::text 经迁入解析器）
  await pool.query(`INSERT INTO ${KN}.knowledge_points (id, canonical_name, subject, grade_band, annotations) VALUES ('kp-annotated', '勾股定理的应用', '数学', '初中', $1::jsonb)`, [JSON.stringify({ knowledgeType: { value: 'procedural', source: 'llm' }, learningObjectives: { value: ['能用勾股定理求直角三角形的未知边长', ' '], source: 'llm' }, misconceptions: { value: ['忘记区分斜边'] } })])
  await pool.query(`INSERT INTO ${KN}.knowledge_point_sources (id, knowledge_point_id, source, external_id, evidence_snippet, confidence) VALUES ('src-1', 'kp-pyth', 'textbook-body', 'pep-math-8b-17-1', '直角三角形两直角边的平方和等于斜边的平方。', 0.9)`)
})
afterAll(async () => {
  for (const s of [DOCS, KN]) await pool.query(`DROP SCHEMA IF EXISTS ${s} CASCADE`)
  await pool.query('delete from account.users where username = any($1)', [[A, B]])
  await pool.end()
})

let courseId = ''

test('a teacher builds a course from PG knowledge points, approves the plan and reads the brief', async () => {
  const created = await createCourseFromKps({ kpIds: ['kp-pyth', 'kp-pyth-inv'] }, { store: storeA, knowledge })
  courseId = created.courseId
  expect(created).toMatchObject({ subject: 'math', gradeBand: 'middle-school', planStatus: 'planning' })
  const plan = await updateCoursePlan(courseId, { action: 'approve', updates: [] }, { store: storeA })
  expect(plan.generationSessionId).toEqual(expect.any(String))
  const course = (await storeA.findMainlineCourse(courseId))!
  expect(course.generationSession!.jobs).toHaveLength(created.plannedPages!)
  const raw = await pool.query(`select payload::text as t from ${DOCS}.documents where id = $1`, [courseId])
  expect(raw.rows[0].t).toBe(JSON.stringify(course))
  const brief = (await buildPrepBriefForCourse(courseId, { store: storeA, knowledge }))!
  expect(brief.kps).toHaveLength(2)
})

test('another teacher cannot read, list, overwrite, edit or delete it', async () => {
  const before = JSON.stringify(await storeA.findMainlineCourse(courseId))
  expect(await storeB.findMainlineCourse(courseId)).toBeUndefined()
  expect(await storeB.listMainlineCourses()).toEqual([])
  await expect(storeB.saveMainlineCourse({ ...JSON.parse(before) as MainlineCourse, topic: '抢写' })).rejects.toBeInstanceOf(CourseOwnerMismatchError)
  await expect(updateCoursePlan(courseId, { action: 'save', updates: [] }, { store: storeB })).rejects.toMatchObject({ code: 'COURSE_NOT_FOUND' })
  await storeB.deleteMainlineCourse(courseId)
  expect(JSON.stringify(await storeA.findMainlineCourse(courseId))).toBe(before)
  // CAS 也不能越过 owner：用 A 的真实版本号也只得到 false
  const snapshotA = (await storeA.findMainlineCourseSnapshot(courseId))!
  expect(await storeB.saveMainlineCourseIfUnchanged({ ...snapshotA.course, topic: 'CAS 抢写' }, snapshotA.updatedAt)).toBe(false)
  expect(JSON.stringify(await storeA.findMainlineCourse(courseId))).toBe(before)
  expect((await storeA.findMainlineCourseSnapshot(courseId))!.updatedAt).toBe(snapshotA.updatedAt)
  // A 的课程季对 B 不存在
  await storeA.saveSeason(createSeason({ id: 'course-test-season-a', title: '数学季', subject: 'math', gradeBand: 'middle-school', seasonTheme: '看见数量关系', createdAt: '2026-10-13T00:00:00.000Z' }))
  await expect(createCourseFromKps({ kpIds: ['kp-pyth'], seasonId: 'course-test-season-a' }, { store: storeB, knowledge })).rejects.toMatchObject({ code: 'UNKNOWN_SEASON' })
  expect(await storeB.listMainlineCourses()).toEqual([])
})

test('compare-and-set through the store rejects a stale writer', async () => {
  const snapshot = (await storeA.findMainlineCourseSnapshot(courseId))!
  expect(await storeA.saveMainlineCourseIfUnchanged({ ...snapshot.course, topic: '第一次修改' }, snapshot.updatedAt)).toBe(true)
  expect(await storeA.saveMainlineCourseIfUnchanged({ ...snapshot.course, topic: '过期覆盖' }, snapshot.updatedAt)).toBe(false)
  expect((await storeA.findMainlineCourse(courseId))!.topic).toBe('第一次修改')
})

// maolab generation-render-runner.test 同款：一页内容已就绪、等待截图
const planPage: LessonPagePlan = {
  id: 'page-1', order: 1, fragmentId: 'fragment-1', knowledgePointIds: ['kp-pyth'], purpose: 'explain',
  audience: 'student', learningAction: '观察并说明。', newInformation: '呈现定义。', sourceRefs: [],
  contentSpec: { kind: 'explanation', focus: '定义', requiredElements: ['定义', '例子'] },
  visualSpec: { required: false, form: 'none', reason: '文字讲解。', sourceAssetPolicy: 'none' },
  teacherCompanion: { scriptGoal: '讲清定义。', teachingMove: '追问依据。', pace: 'normal' }, arcStepId: 'arc-1',
}
function renderingCourse(id: string): MainlineCourse {
  const planning: CoursePlanningState = { schemaVersion: 'mainline-page-v2', courseId: id, planRevisionId: 'plan-1', status: 'plan-approved', learningContracts: [], arc: { id: 'arc-1', courseId: id, steps: [] }, pages: [planPage] }
  const base = { id, topic: '渲染测试课', planning, qualityStatus: 'draft' } as unknown as MainlineCourse
  const inputHash = generationInputHash({ pageId: 'page-1' })
  let session = startPageGeneration(createGenerationSession(base, 'session-1'), 'page-1', inputHash, '2026-10-13T00:00:00.000Z')
  session = completePageContent(session, { pageId: 'page-1', planRevisionId: 'plan-1', inputHash, contentRevisionId: 'content-1', factAuditRevisionId: 'fact-1', createdAt: '2026-10-13T00:01:00.000Z' }, '2026-10-13T00:01:00.000Z')
  return {
    ...base,
    generationSession: session,
    pageContent: {
      schemaVersion: 'mainline-page-content-v1', courseId: id, planRevisionId: 'plan-1', contentRevisionId: 'content-all-1', status: 'review',
      pages: [{ pageId: 'page-1', order: 1, purpose: 'explain', planRevisionId: 'plan-1', sourceRefs: [], content: { kind: 'explanation', title: '定义', coreStatement: '这是需要学生理解的完整定义。', evidence: [{ text: '例子能够支持这一定义。' }], boundary: '不要超出本课讨论范围。' }, teacherCompanion: { script: '讲稿。', notes: [], pace: 'normal' } }],
    },
  } as MainlineCourse
}
const goodMetrics = { stageWidth: 1920, stageHeight: 1080, minimumFontPx: 28, clippedElementCount: 0, overlappingTextCount: 0, brokenImageCount: 0, occupiedAreaRatio: 0.35, visualElementCount: 0 }

test('the migrated render runner promotes a page with screenshot evidence stored in PG', async () => {
  await storeA.saveMainlineCourse(renderingCourse('course-render-1'))
  const captured: string[] = []
  const services = createCourseGenerationServices(storeA, {
    render: {
      capture: async (url) => { captured.push(url); return { screenshot: Buffer.from('png-bytes'), metrics: goodMetrics } },
      writeEvidence: async (_courseId, _pageId, evidenceId) => `artifact:${evidenceId}`,
    },
  })
  const result = await services.render!.runNext('course-render-1', 'http://render.invalid', '2026-10-13T00:02:00.000Z')
  expect(result).toMatchObject({ done: true, session: { status: 'course-audit' } })
  expect(captured).toEqual(['http://render.invalid/mainline/course-render-1/render?export=1&page=1'])
  const stored = (await storeA.findMainlineCourse('course-render-1'))!
  expect(stored.pageRenderEvidence?.[0]).toMatchObject({ screenshotPath: expect.stringMatching(/^artifact:[a-f0-9]{64}$/), issues: [] })
  expect(await storeB.findMainlineCourse('course-render-1')).toBeUndefined()
})

test('real jsonb annotations reach the migrated parser through PgCourseKnowledge', async () => {
  const metadata = await fetchKpMetadata(['kp-annotated', 'kp-pyth', 'kp-missing'], knowledge)
  expect([...metadata.keys()].sort()).toEqual(['kp-annotated', 'kp-pyth'])
  expect(metadata.get('kp-annotated')).toMatchObject({ canonicalName: '勾股定理的应用', knowledgeType: 'procedural', learningObjectives: ['能用勾股定理求直角三角形的未知边长'] })
  // 缺省 '{}' 的行解析为空标注，不抛错
  expect(metadata.get('kp-pyth')).toMatchObject({ canonicalName: '勾股定理' })
  expect(metadata.get('kp-pyth')!.learningObjectives ?? []).toEqual([])
})

test('two generation service instances on one PG course: one page write wins, the other is a write conflict', async () => {
  const id = 'course-test-two-writers'
  const course = renderingCourse(id)
  const planning: CoursePlanningState = { ...course.planning!, status: 'plan-approved' }
  const approved = { ...course, planning, pageContent: undefined, generationSession: undefined } as unknown as MainlineCourse
  approved.generationSession = createGenerationSession(approved, 'session-two', '2026-10-13T00:00:00.000Z')
  await storeA.saveMainlineCourse(approved)
  const page = renderingCourse(id).pageContent!.pages[0]!
  const options = { pages: { generate: async () => { await new Promise((r) => setTimeout(r, 20)); return page }, auditFacts: async () => ({ revisionId: 'fact-1' }) } }
  // 两个实例的第一次读取互相等待，保证两边读到同一版本后才各自写（模拟两个进程同时开工）
  let arrivals = 0
  let release!: () => void
  const bothRead = new Promise<void>((resolve) => { release = resolve })
  const racing = {
    ...storeA,
    async findMainlineCourseSnapshot(courseId: string) {
      const snapshot = await storeA.findMainlineCourseSnapshot(courseId)
      if (arrivals < 2) { arrivals += 1; if (arrivals === 2) release(); await bothRead }
      return snapshot
    },
  }
  const results = await Promise.allSettled([
    createCourseGenerationServices(racing, options).pages.runNext(id, '2026-10-13T00:01:00.000Z'),
    createCourseGenerationServices(racing, options).pages.runNext(id, '2026-10-13T00:01:01.000Z'),
  ])
  expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
  expect((results.find((r) => r.status === 'rejected') as PromiseRejectedResult).reason).toMatchObject({ code: 'WRITE_CONFLICT' })
  const stored = (await storeA.findMainlineCourse(id))!
  expect(stored.generationSession!.jobs[0]!.status).toBe('content-ready')
  expect(stored.pageContent!.pages.map((p) => p.pageId)).toEqual(['page-1'])
})
