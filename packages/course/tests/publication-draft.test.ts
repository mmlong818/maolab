import { expect, test } from 'vitest'
import { createMainlineCourseStore } from '../src/mainline/store.js'
import { lessonPresentationPages } from '../src/mainline/presentation/presentation-pages.js'
import { sourceEvidenceView } from '../src/mainline/presentation/course-source-evidence.js'
import { createMemoryCourseDocuments } from '../src/memory-documents.js'
import type { MainlineCourse } from '../src/mainline/domain.js'
import { kpIdsOf, PUBLICATION_STRIPPED_CANDIDATE_FIELDS, PUBLICATION_STRIPPED_FIELDS, PUBLICATION_STRIPPED_PLANNING_FIELDS, publicationDraftOf } from '../src/services/publication.js'
import { buildReadyFixtureCourse } from '../src/testing/ready-course.js'
import { PREP_FIXTURE_KP_IDS } from '../src/testing/prep-fixtures.js'

function withoutField<K extends keyof MainlineCourse>(course: MainlineCourse, field: K): MainlineCourse {
  const { [field]: _dropped, ...rest } = course
  return rest as MainlineCourse
}

async function readyCourse() {
  const documents = createMemoryCourseDocuments()
  const { courseId, facade } = await buildReadyFixtureCourse(documents)
  const course = (await createMainlineCourseStore(documents).findMainlineCourse(courseId))!
  return { documents, courseId, facade, course }
}

test('a fully accepted course yields a draft: signature, both knowledge points, page count, family = course id', async () => {
  const { course } = await readyCourse()
  const out = publicationDraftOf(course)
  expect(out.ok).toBe(true)
  if (!out.ok) return
  expect(out.draft).toMatchObject({ familyId: course.id, signature: course.teacherAcceptance!.finalSignature, title: course.topic, subject: course.subject, gradeBand: course.gradeBand, pageCount: lessonPresentationPages(course).length })
  // 实测为准：3c 夹具课程的两个知识点都从 sourceMaterial 取到
  expect(out.draft.kpIds).toEqual([...PREP_FIXTURE_KP_IDS])
  expect(kpIdsOf(course)).toEqual([...PREP_FIXTURE_KP_IDS])
  expect(kpIdsOf({ ...course, scenes: [] })).toEqual([...PREP_FIXTURE_KP_IDS])
})

test('the snapshot drops every process field, keeps presentation identical and holds no /api/prep/ string', async () => {
  const { course } = await readyCourse()
  const out = publicationDraftOf(course)
  if (!out.ok) throw new Error(out.message)
  for (const field of PUBLICATION_STRIPPED_FIELDS) expect(Object.keys(out.draft.snapshot)).not.toContain(field)
  expect(PUBLICATION_STRIPPED_FIELDS).toEqual(['generationSession', 'pageRenderEvidence', 'generationCourseAudit', 'teachingQualityAudit', 'factAudit', 'teacherAcceptance', 'revision', 'season'])
  expect(lessonPresentationPages(out.draft.snapshot)).toEqual(lessonPresentationPages(course))
  expect(JSON.stringify(out.draft.snapshot)).not.toContain('/api/prep/')
  // 草稿不带老师账号数据：快照里没有任何 owner/account/user/email 类键（teacherId 是虚拟教师人设 id，不是账号）
  expect(JSON.stringify(out.draft.snapshot)).not.toMatch(/"(owner\w*|account\w*|user\w*|email)"\s*:/i)
  // 原课程对象没被改
  expect(course.teacherAcceptance).toBeDefined()
  expect(course.pageRenderEvidence?.length).toBeGreaterThan(0)
})

test('a course whose content no longer matches its acceptance is not ready (same blockers as export)', async () => {
  const { course } = await readyCourse()
  // Ruling F4：改 pageContent.contentRevisionId（页上没有这个字段）
  const revised = { ...course, pageContent: { ...course.pageContent!, contentRevisionId: `${course.pageContent!.contentRevisionId}-edited` } }
  expect(publicationDraftOf(revised)).toMatchObject({ ok: false, reason: 'not-ready', blockers: expect.any(Array) })
  // Ruling F4：改某页正文
  const pages = course.pageContent!.pages
  const first = pages[0]!
  const textEdited = { ...course, pageContent: { ...course.pageContent!, pages: [{ ...first, content: { ...first.content, title: `${first.content.title}（改）` } }, ...pages.slice(1)] } }
  expect(publicationDraftOf(textEdited as typeof course)).toMatchObject({ ok: false, reason: 'not-ready', blockers: expect.any(Array) })
  const unaccepted = publicationDraftOf(withoutField(course, 'teacherAcceptance'))
  expect(unaccepted).toMatchObject({ ok: false, reason: 'not-ready' })
})

test('Ruling F1: no planning (imported maolab course) or no final signature → not-ready', async () => {
  const { course } = await readyCourse()
  expect(publicationDraftOf(withoutField(course, 'planning'))).toMatchObject({ ok: false, reason: 'not-ready' })
  expect(publicationDraftOf({ ...course, teacherAcceptance: { ...course.teacherAcceptance!, finalSignature: '' } })).toMatchObject({ ok: false, reason: 'not-ready' })
})

test('Ruling F5: a course superseded by a newer revision → not-ready', async () => {
  const { course } = await readyCourse()
  const superseded = { ...course, revision: { familyId: course.id, revisionNo: 1, supersededByCourseId: 'newer' } }
  expect(publicationDraftOf(superseded)).toMatchObject({ ok: false, reason: 'not-ready' })
})

test('实测：只改课程标题（topic）也让草稿 not-ready（AI 教学审查的输入哈希含标题），重新发布前要重新审查与验收', async () => {
  const { course } = await readyCourse()
  expect(publicationDraftOf(course).ok).toBe(true)
  expect(publicationDraftOf({ ...course, topic: `${course.topic}（新标题）` })).toMatchObject({ ok: false, reason: 'not-ready', blockers: [expect.objectContaining({ source: 'teacher-acceptance' })] })
})

test('no knowledge point on the course → no-knowledge-point; revisions share the family id', async () => {
  const { course } = await readyCourse()
  const noKp = { ...course, sourceMaterial: course.sourceMaterial.map(({ kpId: _k, ...rest }) => rest), scenes: course.scenes.map(({ kpId: _k, ...rest }) => rest) }
  expect(publicationDraftOf(noKp as typeof course)).toMatchObject({ ok: false, reason: 'no-knowledge-point' })
  const revised = { ...course, revision: { familyId: 'family-1', revisionNo: 2, basedOnCourseId: 'old' } }
  const out = publicationDraftOf(revised)
  expect(out.ok && out.draft.familyId).toBe('family-1')
  expect(out.ok && 'revision' in out.draft.snapshot).toBe(false)
})

test('final M1: a revision\'s planning.basedOnPlanRevisionId (carries the old course id) is stripped; presentation unchanged; the course object is untouched', async () => {
  const { course } = await readyCourse()
  const based = `old-course-id:plan:1`
  const revised = { ...course, revision: { familyId: 'old-course-id', revisionNo: 2, basedOnCourseId: 'old-course-id' }, planning: { ...course.planning!, basedOnPlanRevisionId: based } }
  const out = publicationDraftOf(revised)
  if (!out.ok) throw new Error(out.message)
  expect(PUBLICATION_STRIPPED_PLANNING_FIELDS).toEqual(['basedOnPlanRevisionId'])
  expect(out.draft.snapshot.planning).toBeDefined()
  expect(Object.keys(out.draft.snapshot.planning!)).not.toContain('basedOnPlanRevisionId')
  expect(JSON.stringify(out.draft.snapshot)).not.toContain('old-course-id')
  expect(lessonPresentationPages(out.draft.snapshot)).toEqual(lessonPresentationPages(revised))
  expect(revised.planning.basedOnPlanRevisionId).toBe(based)
})

test('re-review D9: a textbook-grounded course keeps candidateResources (pages fall back to them as images), drops only their sourceUrl; presentation and source evidence are otherwise identical', async () => {
  const documents = createMemoryCourseDocuments()
  const candidate = { id: 'tb-1', kind: 'textbook-asset' as const, title: '教材插图', assetUrl: '/api/v2/education-resources/file/textbook-assets%2Fx.jpg', mediaType: 'image/jpeg', sourceUrl: 'https://publisher.example/book/1', citation: '人教版', revealPolicy: 'explanation-only' }
  const { courseId } = await buildReadyFixtureCourse(documents, { candidateResources: [candidate] })
  const course = (await createMainlineCourseStore(documents).findMainlineCourse(courseId))!
  const out = publicationDraftOf(course)
  if (!out.ok) throw new Error(out.message)
  expect(PUBLICATION_STRIPPED_CANDIDATE_FIELDS).toEqual(['sourceUrl'])
  const pages = lessonPresentationPages(course)
  // 前提：夹具里确有页拿教材候选图当页图（剥掉 candidateResources 就会改变孩子看到的页面，所以只剥 sourceUrl）
  expect(JSON.stringify(pages)).toContain(candidate.assetUrl)
  expect(lessonPresentationPages(out.draft.snapshot)).toEqual(pages)
  const { sourceUrl: _dropped, ...withoutLink } = candidate
  for (const [i, source] of course.sourceMaterial.entries()) {
    const before = sourceEvidenceView(source, i)
    const after = sourceEvidenceView(out.draft.snapshot.sourceMaterial[i]!, i)
    expect(after).toEqual({ ...before, resources: before.resources.map((r) => { const { sourceUrl: _s, ...rest } = r; return rest }) })
    expect(out.draft.snapshot.sourceMaterial[i]!.candidateResources).toEqual([withoutLink])
  }
  expect(JSON.stringify(out.draft.snapshot)).not.toContain('publisher.example')
  expect(course.sourceMaterial[0]!.candidateResources![0]!.sourceUrl).toBe(candidate.sourceUrl)
})
