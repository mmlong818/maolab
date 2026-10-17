// S4：课程包导出、列表、撤回单。worker 不在这里跑：投递后用 PgExports.appendVersion + 存一份 zip 模拟 worker 完成（worker 自己的测试在 workers/render）。
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { generateSigningKeyPair, publicKeysFromPem, readRecall } from '@maolab-core/course-package'
import { PgCourseArtifacts, PgCourseDocuments, PgExports, PgRenderJobs } from '@maolab/domain'
import { prepTestApp } from './helpers/prep.ts'
import { exportKeyFiles } from '../scripts/package-keygen.ts'

const A = 'course_test_prep_pkg_a'
const B = 'course_test_prep_pkg_b'
const SCHEMA = 'course_test_prep_pkg'
const KP = 'course_test_prep_pkg_kp'
const dir = mkdtempSync(join(tmpdir(), 'maolab-pkg-'))
const keys = generateSigningKeyPair()
writeFileSync(join(dir, 'private.pem'), keys.privateKeyPem)
let env: Awaited<ReturnType<typeof prepTestApp>>
const tokens: Record<string, string> = {}
let courseId = ''
let draftOnly = ''

const send = (method: 'GET' | 'POST', url: string, token: string, payload?: unknown) =>
  env.app.inject({ method, url, headers: { 'x-session-token': token, ...(payload ? { 'content-type': 'application/json' } : {}) }, ...(payload ? { payload: JSON.stringify(payload) } : {}) })

/** 模拟 worker 完成 export-package：按 payload 的包 id 追加一个版本，包字节存成产物 */
async function completeJob(owner: string, jobId: string, signature: string, sourceCourseId: string): Promise<void> {
  const job = (await new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(owner).get(jobId))!
  expect(job.kind).toBe('export-package')
  const stored = await new PgCourseArtifacts(env.pool, { schema: SCHEMA }).forOwner(owner).put({ bytes: new TextEncoder().encode(`PK-fake-${signature}`), contentType: 'application/zip', kind: 'package', courseId: sourceCourseId })
  await new PgExports(env.pool, { schema: SCHEMA }).forOwner(owner).appendVersion(job.payload.packageId as string, {
    sourceCourseId, signature, build: async () => ({ artifactId: stored.id, sha256: stored.sha256, bytes: stored.byteSize, pageCount: 3 }),
  })
}
const signatureOf = async (id: string): Promise<string> => {
  const draft = await (await env.app.prep.courses.facade(A)).packageDraft(id)
  if (!draft.ok) throw new Error(draft.message)
  return draft.draft.signature
}

beforeAll(async () => {
  env = await prepTestApp({ owners: [A, B], courseSchema: SCHEMA, knowledgeSchema: KP, env: { MAOLAB_PACKAGE_SIGNING_KEY: join(dir, 'private.pem') } })
  tokens.a = await env.token(A)
  tokens.b = await env.token(B)
  courseId = (await env.course.buildReadyFixtureCourse(new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A))).courseId
  const planned = await (await env.app.prep.courses.facade(A)).planCourse({ kpIds: [...env.course.PREP_FIXTURE_KP_IDS] })
  if (!planned.ok) throw new Error(planned.message)
  draftOnly = (planned.course as { courseId: string }).courseId
}, 300_000)
afterAll(async () => { await env?.close() })

test('needs a login; a course that is not accepted is refused with blockers and nothing is queued', async () => {
  expect((await env.app.inject({ method: 'POST', url: `/api/prep/courses/${courseId}/package`, payload: { requestId: 'req-pkg-noauth' } })).statusCode).toBe(401)
  const refused = await send('POST', `/api/prep/courses/${draftOnly}/package`, tokens.a!, { requestId: 'req-pkg-draft01' })
  expect(refused.statusCode).toBe(422)
  expect(refused.json()).toMatchObject({ reason: 'not-ready' })
  expect((await send('POST', `/api/prep/courses/${courseId}/package`, tokens.a!, {})).statusCode).toBe(400)
  expect((await send('POST', `/api/prep/courses/${courseId}/package`, tokens.b!, { requestId: 'req-pkg-other01' })).statusCode).toBe(404)
})

test('a course edited after acceptance is refused with blockers and nothing is queued (review focus 3)', async () => {
  const docs = new PgCourseDocuments(env.pool, { schema: SCHEMA }).forOwner(A)
  const { courseId: edited } = await env.course.buildReadyFixtureCourse(docs)
  const store = env.course.createMainlineCourseStore(docs)
  const course = (await store.findMainlineCourse(edited))!
  await store.saveMainlineCourse({ ...course, topic: `${course.topic}（改过）` })
  const refused = await send('POST', `/api/prep/courses/${edited}/package`, tokens.a!, { requestId: 'req-pkg-edited01' })
  expect(refused.statusCode).toBe(422)
  expect(refused.json()).toMatchObject({ reason: 'not-ready', details: { blockers: expect.arrayContaining([expect.anything()]) } })
  expect((await new PgRenderJobs(env.pool, { schema: SCHEMA }).forOwner(A).listForCourse(edited)).filter((j) => j.kind === 'export-package')).toEqual([])
}, 300_000)

test('export → queued job; once done the list shows v1 with a zip download; the same course again is unchanged', async () => {
  const first = await send('POST', `/api/prep/courses/${courseId}/package`, tokens.a!, { requestId: 'req-pkg-first01' })
  expect(first.statusCode).toBe(202)
  const { job, packageId } = first.json() as { job: { jobId: string; kind: string }; packageId: string }
  expect(job.kind).toBe('export-package')
  expect(packageId).toMatch(/^pk_/)
  // 并发再点一次（不同请求编号）：同一个包（版本由 worker 在锁内定，见 PgExports 测试）
  const second = await send('POST', `/api/prep/courses/${courseId}/package`, tokens.a!, { requestId: 'req-pkg-second1' })
  expect([second.statusCode, second.json().packageId]).toEqual([202, packageId])
  await completeJob(A, job.jobId, await signatureOf(courseId), courseId)

  const listed = await send('GET', `/api/prep/packages?courseId=${courseId}`, tokens.a!)
  expect(listed.statusCode).toBe(200)
  const [pkg] = listed.json().packages
  expect(pkg).toMatchObject({ packageId, status: 'active', versions: [{ version: 1, sourceCourseId: courseId, url: expect.stringMatching(/^\/api\/prep\/artifacts\/ar_/) }] })
  const download = await env.app.inject({ method: 'GET', url: `${pkg.versions[0].url}?token=${tokens.a}&name=${encodeURIComponent('分数的意义-v1')}` })
  expect(download.statusCode).toBe(200)
  expect(download.headers['content-type']).toBe('application/zip')
  expect(String(download.headers['content-disposition'])).toMatch(/^attachment; .*\.maolab-course\.zip/)

  const again = await send('POST', `/api/prep/courses/${courseId}/package`, tokens.a!, { requestId: 'req-pkg-again01' })
  expect(again.statusCode).toBe(200)
  expect(again.json()).toMatchObject({ unchanged: true, packageId, version: { version: 1 } })
})

test('another teacher sees no packages and cannot recall them', async () => {
  const [pkg] = (await send('GET', '/api/prep/packages', tokens.a!)).json().packages
  expect((await send('GET', '/api/prep/packages', tokens.b!)).json()).toEqual({ packages: [] })
  expect((await send('POST', `/api/prep/packages/${pkg.packageId}/recall`, tokens.b!, { requestId: 'req-pkg-brecall' })).statusCode).toBe(404)
})

test('recall: a signed recall slip to download; recalled again returns the same slip; the next export starts a new package', async () => {
  const [pkg] = (await send('GET', `/api/prep/packages?courseId=${courseId}`, tokens.a!)).json().packages
  const recalled = await send('POST', `/api/prep/packages/${pkg.packageId}/recall`, tokens.a!, { requestId: 'req-pkg-recall1', reason: '有一页写错了' })
  expect(recalled.statusCode).toBe(200)
  const { recallUrl } = recalled.json() as { recallUrl: string }
  expect(recalled.json().package).toMatchObject({ packageId: pkg.packageId, status: 'recalled' })
  const slip = await env.app.inject({ method: 'GET', url: `${recallUrl}?token=${tokens.a}` })
  expect(slip.statusCode).toBe(200)
  expect(String(slip.headers['content-disposition'])).toMatch(/\.recall\.json/)
  expect(readRecall(new Uint8Array(slip.rawPayload), { publicKeys: publicKeysFromPem([keys.publicKeyPem]) })).toMatchObject({ packageId: pkg.packageId, reason: '有一页写错了' })
  const twice = await send('POST', `/api/prep/packages/${pkg.packageId}/recall`, tokens.a!, { requestId: 'req-pkg-recall2' })
  expect(twice.json().recallUrl).toBe(recallUrl)

  const listed = (await send('GET', `/api/prep/packages?courseId=${courseId}`, tokens.a!)).json().packages
  expect(listed[0]).toMatchObject({ status: 'recalled', recallUrl })
  const fresh = await send('POST', `/api/prep/courses/${courseId}/package`, tokens.a!, { requestId: 'req-pkg-fresh01' })
  expect(fresh.statusCode).toBe(202)
  expect(fresh.json().packageId).not.toBe(pkg.packageId)
})

test('without a signing key export and recall answer 503', async () => {
  const prep = env.app.deps.config.prep
  const saved = prep.packageSigningKey
  prep.packageSigningKey = undefined
  try {
    const out = await send('POST', `/api/prep/courses/${courseId}/package`, tokens.a!, { requestId: 'req-pkg-nokey01' })
    expect([out.statusCode, out.json().code]).toEqual([503, 'PACKAGE_SIGNING_UNCONFIGURED'])
    const [pkg] = (await send('GET', '/api/prep/packages', tokens.a!)).json().packages
    expect((await send('POST', `/api/prep/packages/${pkg.packageId}/recall`, tokens.a!, { requestId: 'req-pkg-nokey02' })).statusCode).toBe(503)
  } finally {
    prep.packageSigningKey = saved
  }
})

test('keygen writes a private key the api can load and a public key with the same key id', () => {
  const out = exportKeyFiles(mkdtempSync(join(tmpdir(), 'maolab-keygen-')))
  expect(out.keyId).toMatch(/^[0-9a-f]{16}$/)
  expect([...publicKeysFromPem([out.publicKeyPem]).keys()]).toEqual([out.keyId])
})
