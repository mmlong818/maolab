import { expect, test } from 'vitest'
import { createPrep, type PrepSessions } from '@maolab/prep-bundle/prep'
import type { LlmStreamer } from '@maolab/prep-bundle/prep-model'
import { loadCourseForTests } from './helpers/prep.ts'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createPrepService, type PrepConfig, type YunyiPrep } from '@maolab/prep-bundle/prep'
import { cachedLoader, type CourseApi } from '@maolab/prep-bundle/prep-course-loader'
import type { LlmStreamOptions } from '@maolab/prep-bundle/prep-model'

const course = await loadCourseForTests()
type Entry = { owner?: string; credential?: string; private?: boolean }
const sessions = (entries: Record<string, Entry>): PrepSessions => ({
  ownerOf: (agent) => entries[String(agent.id)]?.owner,
  credentialOf: (agent) => entries[String(agent.id)]?.credential,
  isPrivateSession: (id) => entries[id]?.private === true,
})
const llm: LlmStreamer = { async *stream() { yield { type: 'text-delta', text: '{"issues":[]}' } } }
const noKnowledge = { knowledgePoints: async () => [], knowledgePointSources: async () => [] }

function build(entries: Record<string, Entry>, extra: { maxOwners?: number; imageModel?: string; assets?: boolean } = {}) {
  const owners: string[] = []
  let created = 0
  const prep = createPrep({
    course: { ...course, createPrepFacade: (deps) => { created += 1; return course.createPrepFacade(deps) } },
    sessions: sessions(entries),
    llm,
    documentsFor: (owner) => { owners.push(owner); return course.createMemoryCourseDocuments() },
    knowledge: noKnowledge,
    ...(extra.assets ? { assetsFor: () => ({ put: async () => '/api/prep/artifacts/ar_x' }) } : {}),
    model: 'glm-5.3',
    imageModel: extra.imageModel ?? '',
    baseUrl: 'http://gw.test/v1',
    ...(extra.maxOwners ? { maxOwners: extra.maxOwners } : {}),
  })
  return { prep, owners, created: () => created }
}

test('no agent, an unowned session and a private session are refused', async () => {
  const { prep } = build({ 's-none': {}, 's-private': { owner: 't-a', private: true } })
  expect(await prep.scope(undefined)).toMatchObject({ ok: false, reason: 'no-session' })
  expect(await prep.scope({ id: 's-none' })).toMatchObject({ ok: false, reason: 'no-session' })
  expect(await prep.scope({ id: 's-private' })).toMatchObject({ ok: false, reason: 'private-session' })
})

test('one facade per owner, shared by that owner sessions; the owner comes from the session only', async () => {
  const { prep, owners, created } = build({ 's-a1': { owner: 't-a' }, 's-a2': { owner: 't-a' }, 's-b': { owner: 't-b' } })
  const a1 = await prep.scope({ id: 's-a1' })
  const a2 = await prep.scope({ id: 's-a2' })
  const b = await prep.scope({ id: 's-b' })
  if ('ok' in a1 || 'ok' in a2 || 'ok' in b) throw new Error('scope refused')
  expect(a1.facade).toBe(a2.facade)
  expect(b.facade).not.toBe(a1.facade)
  expect([a1.owner, b.owner]).toEqual(['t-a', 't-b'])
  expect(owners).toEqual(['t-a', 't-b'])
  expect(created()).toBe(2)
})

test('the facade cache is bounded: the least recently used owner is evicted', async () => {
  const { prep, created } = build({ 's-a': { owner: 't-a' }, 's-b': { owner: 't-b' }, 's-c': { owner: 't-c' } }, { maxOwners: 2 })
  await prep.scope({ id: 's-a' })
  await prep.scope({ id: 's-b' })
  await prep.scope({ id: 's-a' })
  await prep.scope({ id: 's-c' })
  expect(created()).toBe(3)
  await prep.scope({ id: 's-a' })
  expect(created()).toBe(3)
  await prep.scope({ id: 's-b' })
  expect(created()).toBe(4)
})

test('runtime: none without a credential; with one, a metered model channel and images only when configured', async () => {
  const signal = new AbortController().signal
  const bare = build({ 's-nocred': { owner: 't-a' }, 's-cred': { owner: 't-a', credential: 'cred-a' } })
  const nocred = await bare.prep.scope({ id: 's-nocred' })
  const cred = await bare.prep.scope({ id: 's-cred' })
  if ('ok' in nocred || 'ok' in cred) throw new Error('scope refused')
  expect(nocred.runtime('c-1', signal)).toBeUndefined()
  const first = cred.runtime('c-1', signal)!
  const second = cred.runtime('c-1', signal)!
  expect(first.runtime.llm).toBeDefined()
  expect(first.runtime.image).toBeUndefined()
  expect(first.meter).not.toBe(second.meter)
  expect(cred.imagesAvailable).toBe(false)
  const withImages = build({ 's-cred': { owner: 't-a', credential: 'cred-a' } }, { imageModel: 'img-1', assets: true })
  const scope = await withImages.prep.scope({ id: 's-cred' })
  if ('ok' in scope) throw new Error('scope refused')
  expect(scope.imagesAvailable).toBe(true)
  expect(scope.runtime('c-1', signal)!.runtime).toMatchObject({ llm: expect.any(Object), image: expect.any(Object), assets: expect.any(Object) })
})

// ---- 3c 裁决 F4 与 Note for T5：通道按调用新建、只用本会话；按 owner 缓存的门面不持有会话通道；课程模块懒加载 ----

const request = (signal: AbortSignal) => ({ user: 'u', temperature: 0, timeoutMs: 1000, signal, attempt: 1 })

function recordingLlm() {
  const calls: LlmStreamOptions[] = []
  const streamer: LlmStreamer = {
    async *stream(options) {
      calls.push(options)
      yield { type: 'finish', reason: { kind: 'error', failure: { code: 'AUTH', message: 'HTTP 401' } } }
    },
  }
  return { streamer, calls }
}

test('each call gets a fresh model channel bound to its own session; the shared facade never holds one', async () => {
  const signal = new AbortController().signal
  const recorded = recordingLlm()
  const facadeDeps: unknown[] = []
  const prep = createPrep({
    course: { ...course, createPrepFacade: (deps) => { facadeDeps.push(deps); return course.createPrepFacade(deps) } },
    sessions: sessions({ 's-a1': { owner: 't-a', credential: 'cred-a1' }, 's-a2': { owner: 't-a', credential: 'cred-a2' }, 's-b': { owner: 't-b', credential: 'cred-b' } }),
    llm: recorded.streamer,
    documentsFor: () => course.createMemoryCourseDocuments(),
    knowledge: noKnowledge,
    model: 'glm-5.3',
    imageModel: '',
    baseUrl: 'http://gw.test/v1',
  })
  const a1 = await prep.scope({ id: 's-a1' })
  const a2 = await prep.scope({ id: 's-a2' })
  const b = await prep.scope({ id: 's-b' })
  if ('ok' in a1 || 'ok' in a2 || 'ok' in b) throw new Error('scope refused')
  expect(a1.facade).toBe(a2.facade)
  // 门面的依赖只有 owner 绑定的文档仓储与知识点：没有凭证、模型、图像或产物通道
  expect(facadeDeps).toHaveLength(2)
  for (const deps of facadeDeps) expect(Object.keys(deps as object).sort()).toEqual(['documents', 'knowledge'])
  // 认证失败后这一通道短路（实例状态）；同一会话的下一次调用、同 owner 的另一会话、别的 owner 都拿新通道，各自带自己的 sessionId
  const first = a1.runtime('c-1', signal)!
  await expect(first.runtime.llm!.completeJson(request(signal))).rejects.toThrow(/prep-transport:auth/)
  await expect(first.runtime.llm!.completeJson(request(signal))).rejects.toThrow(/prep-transport:auth/)
  expect(recorded.calls).toHaveLength(1)
  const again = a1.runtime('c-1', signal)!
  expect(again.runtime.llm).not.toBe(first.runtime.llm)
  await expect(again.runtime.llm!.completeJson(request(signal))).rejects.toThrow(/prep-transport:auth/)
  await expect(a2.runtime('c-1', signal)!.runtime.llm!.completeJson(request(signal))).rejects.toThrow(/prep-transport:auth/)
  await expect(b.runtime('c-1', signal)!.runtime.llm!.completeJson(request(signal))).rejects.toThrow(/prep-transport:auth/)
  expect(recorded.calls.map((call) => call.sessionId)).toEqual(['s-a1', 's-a1', 's-a2', 's-b'])
  expect(first.meter.calls).toBe(1)
})

test('the runtime reads the credential at call time, wires sleep to the tool signal, and sends images with this session credential', async () => {
  const entries: Record<string, Entry> = { 's-a': { owner: 't-a' } }
  const fetched: string[] = []
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]).toString('base64')
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    fetched.push(String((init.headers as Record<string, string>).authorization))
    return new Response(JSON.stringify({ data: [{ b64_json: png }] }), { status: 200 })
  }) as unknown as typeof fetch
  const prep = createPrep({
    course,
    sessions: sessions(entries),
    llm,
    documentsFor: () => course.createMemoryCourseDocuments(),
    knowledge: noKnowledge,
    assetsFor: (owner, courseId) => ({ put: async () => `/api/prep/artifacts/${owner}/${courseId}` }),
    model: 'glm-5.3',
    imageModel: 'img-1',
    baseUrl: 'http://gw.test/v1',
    fetchImpl,
  })
  const scope = await prep.scope({ id: 's-a' })
  if ('ok' in scope) throw new Error('scope refused')
  const controller = new AbortController()
  expect(scope.runtime('c-1', controller.signal)).toBeUndefined()
  entries['s-a'] = { owner: 't-a', credential: 'cred-later' }
  const made = scope.runtime('c-1', controller.signal)!
  expect(await made.runtime.image!.generate('p', { size: '1024x1024' })).toBe('/api/prep/artifacts/t-a/c-1')
  expect(fetched).toEqual(['Bearer cred-later'])
  expect(made.meter.imageCalls).toBe(1)
  const started = Date.now()
  const slept = made.runtime.sleep!(60_000)
  controller.abort()
  await slept
  expect(Date.now() - started).toBeLessThan(5_000)
})

test('the shared facade and its document store are created outside the calling session async context', async () => {
  const als = new AsyncLocalStorage<string>()
  const outside = AsyncLocalStorage.snapshot()
  const seen: Array<string | undefined> = []
  const prep = createPrep({
    course: { ...course, createPrepFacade: (deps) => { seen.push(als.getStore()); return course.createPrepFacade(deps) } },
    sessions: sessions({ 's-a': { owner: 't-a' } }),
    llm,
    documentsFor: () => { seen.push(als.getStore()); return course.createMemoryCourseDocuments() },
    knowledge: noKnowledge,
    model: 'glm-5.3',
    imageModel: '',
    baseUrl: 'http://gw.test/v1',
    detached: outside,
  })
  await als.run('session-a', () => prep.scope({ id: 's-a' }))
  expect(seen).toEqual([undefined, undefined])
})

test('cachedLoader shares one in-flight load and does not cache a failure', async () => {
  let n = 0
  let fail = true
  const load = cachedLoader(async () => {
    n += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (fail) throw new Error('boom')
    return { n }
  })
  const [x, y] = await Promise.allSettled([load(), load()])
  expect([x.status, y.status, n]).toEqual(['rejected', 'rejected', 1])
  fail = false
  const [p, q] = await Promise.all([load(), load()])
  expect(p).toBe(q)
  expect(await load()).toBe(p)
  expect(n).toBe(2)
})

test('apply does not load the course module; the first scope loads it once and a failed load is retried', async () => {
  let loads = 0
  let fail = true
  const load = async (): Promise<CourseApi> => {
    loads += 1
    await new Promise((resolve) => setTimeout(resolve, 10))
    if (fail) throw new Error('tsImport failed')
    return course
  }
  let service: YunyiPrep | undefined
  const disposers: Array<() => unknown> = []
  const ctx = {
    yunyiSessions: sessions({ 's-a': { owner: 't-a' } }),
    llm,
    provide: (name: string, value: unknown) => { if (name === 'yunyiPrep') service = value as YunyiPrep },
    effect: (fn: () => () => unknown) => { disposers.push(fn()) },
  }
  const config: PrepConfig = {}
  createPrepService(ctx, config, load)
  await new Promise((resolve) => setTimeout(resolve, 30))
  expect(loads).toBe(0)
  const refused = await Promise.all([service!.scope({ id: 's-a' }), service!.scope({ id: 's-a' })])
  expect(refused).toMatchObject([{ ok: false, reason: 'prep-unavailable' }, { ok: false, reason: 'prep-unavailable' }])
  expect(loads).toBe(1)
  fail = false
  const [one, two] = await Promise.all([service!.scope({ id: 's-a' }), service!.scope({ id: 's-a' })])
  if ('ok' in one || 'ok' in two) throw new Error('scope refused')
  expect(one.facade).toBe(two.facade)
  expect(loads).toBe(2)
  for (const dispose of disposers) await dispose()
})

// 3c 审查 M1：createPrepService 自己的 snapshot 与懒加载（service.ts 的 outside 与 cachedLoader(() => outside(...))）。
// 首个调用在会话的异步上下文里触发；课程模块加载、门面与进程内文档仓储的创建都不得看到这个会话（getStore() 为 undefined）。
test('createPrepService loads the module and builds the shared facade outside the first caller async context', async () => {
  const als = new AsyncLocalStorage<string>()
  const seen: Record<string, Array<string | undefined>> = { load: [], facade: [], documents: [] }
  const load = async (): Promise<CourseApi> => {
    seen.load!.push(als.getStore())
    await new Promise((resolve) => setTimeout(resolve, 5))
    seen.load!.push(als.getStore())
    return {
      createPrepFacade: (deps) => { seen.facade!.push(als.getStore()); return course.createPrepFacade(deps) },
      createMemoryCourseDocuments: () => { seen.documents!.push(als.getStore()); return course.createMemoryCourseDocuments() },
    }
  }
  let service: YunyiPrep | undefined
  const ctx = {
    yunyiSessions: sessions({ 's-a': { owner: 't-a' }, 's-b': { owner: 't-b' } }),
    llm,
    provide: (name: string, value: unknown) => { if (name === 'yunyiPrep') service = value as YunyiPrep },
    effect: () => {},
  }
  createPrepService(ctx, {}, load)
  const first = await als.run('session-a', () => service!.scope({ id: 's-a' }))
  if ('ok' in first) throw new Error('scope refused')
  // 之后别的会话首次用到的 owner：门面同样在会话之外创建
  const second = await als.run('session-b', () => service!.scope({ id: 's-b' }))
  if ('ok' in second) throw new Error('scope refused')
  expect(seen).toEqual({ load: [undefined, undefined], facade: [undefined, undefined], documents: [undefined, undefined] })
})
