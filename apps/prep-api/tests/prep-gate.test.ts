// 闸门：名单外的老师在 /api/prep/* 一律 403（含未知路径与任意方法），不触发 harness；渲染数据路径对任何人 404 且没有数据。
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/server.ts'
import { PgCredentialStore } from '@maolab-core/auth'
import type { HarnessClient } from '../src/harness/client.ts'
import { TEST_KEY, resetDb, testPool } from './helpers/db.ts'
import { prepConfig } from './helpers/config.ts'

const pool = testPool()
const store = new PgCredentialStore(pool, TEST_KEY)
const calls: string[] = []
const harness: HarnessClient = {
  ensure: async () => { calls.push('ensure'); return 'created' }, create: async () => { calls.push('create') },
  openEvents: async () => { calls.push('events'); throw new Error('not used') }, prompt: async () => { calls.push('prompt') },
  cancel: async () => { calls.push('cancel') }, dispose: async () => { calls.push('dispose') },
}
const ROUTES: Array<[string, string]> = [
  ['GET', '/api/prep/status'], ['GET', '/api/prep/courses'], ['POST', '/api/prep/courses'], ['GET', '/api/prep/courses/c-1'],
  ['GET', '/api/prep/courses/c-1/brief'], ['GET', '/api/prep/courses/c-1/pages/p-1'], ['GET', '/api/prep/courses/c-1/jobs'],
  ['PATCH', '/api/prep/courses/c-1/plan'], ['POST', '/api/prep/courses/c-1/pages/p-1/accept'], ['POST', '/api/prep/courses/c-1/accept'],
  ['POST', '/api/prep/courses/c-1/render'], ['POST', '/api/prep/courses/c-1/export'], ['GET', '/api/prep/artifacts/a-1'],
  ['GET', '/api/prep/sessions'], ['POST', '/api/prep/sessions'], ['GET', '/api/prep/sessions/s-1'],
  ['POST', '/api/prep/sessions/s-1/messages'], ['POST', '/api/prep/sessions/s-1/cancel'], ['DELETE', '/api/prep/courses/c-1'], ['PUT', '/api/prep/nope/deeper'],
  ['POST', '/api/prep/courses/c-1/revise'], ['GET', '/api/prep/knowledge/search?q=x'], ['GET', '/api/prep/knowledge/facets'],
]
const RENDER = ['/api/prep/render', '/api/prep/render/', '/api/prep/render/c-1/', '/api/prep/render/c-1/x?token=abc', '/api//prep/render/c-1/', '/api/prep/./render/c-1/', '/api/prep%2Frender/c-1/']

async function appWith(env: Record<string, string>): Promise<FastifyInstance> {
  return buildServer({ pool, config: prepConfig(env), store, harness })
}
let adultToken = ''
let otherAdultToken = ''

beforeAll(async () => {
  await resetDb(pool)
  await store.getOrCreateUser('yy_course_test_prep_gate_t1')
  await store.setCredential('course_test_prep_gate_t1', { apiKey: 'key-t1' })
  adultToken = await store.createToken('course_test_prep_gate_t1')
  await store.getOrCreateUser('yy_course_test_prep_gate_t2')
  otherAdultToken = await store.createToken('course_test_prep_gate_t2')
})
afterAll(async () => { await pool.end() })

describe('prep gate', () => {
  test('in list mode an unlisted teacher gets 403 PREP_NOT_ENABLED on every /api/prep route, any method, known or not; the harness sees nothing', async () => {
    const app = await appWith({ YUNYI_PREP: 'list', YUNYI_PREP_USERS: 'course_test_prep_gate_t1' })
    for (const [method, url] of ROUTES) {
      const res = await app.inject({ method: method as 'GET', url, headers: { 'x-session-token': otherAdultToken, 'content-type': 'application/json' }, ...(method === 'GET' || method === 'DELETE' ? {} : { payload: '{}' }) })
      expect([url, res.statusCode, res.json().code]).toEqual([url, 403, 'PREP_NOT_ENABLED'])
    }
    expect(calls).toEqual([])
    await app.close()
  })

  test('the render data path is 404 for everyone (listed, unlisted, anonymous) and never carries course data', async () => {
    const app = await appWith({ YUNYI_PREP: 'all' })
    for (const url of RENDER) {
      for (const headers of [{ 'x-session-token': adultToken }, { 'x-session-token': otherAdultToken }, {}]) {
        for (const method of ['GET', 'POST'] as const) {
          const res = await app.inject({ method, url, headers })
          expect([url, method, res.statusCode]).toEqual([url, method, 404])
          expect(res.body).not.toMatch(/planning|pageContent|contract/)
        }
      }
    }
    await app.close()
  })

  test('rollout: off → 403 PREP_NOT_ENABLED; list → only listed teachers; the default is all; status says whether the teacher has a yunyi credential', async () => {
    const off = await appWith({ YUNYI_PREP: 'off' })
    expect((await off.inject({ method: 'GET', url: '/api/prep/status', headers: { 'x-session-token': adultToken } })).json().code).toBe('PREP_NOT_ENABLED')
    await off.close()
    const list = await appWith({ YUNYI_PREP: 'list', YUNYI_PREP_USERS: 'course_test_prep_gate_t1' })
    const ok = await list.inject({ method: 'GET', url: '/api/prep/status', headers: { 'x-session-token': adultToken } })
    expect(ok.statusCode).toBe(200)
    expect(ok.json()).toEqual({ enabled: true, hasCredential: true, imagesAvailable: false })
    const other = await list.inject({ method: 'GET', url: '/api/prep/status', headers: { 'x-session-token': otherAdultToken } })
    expect([other.statusCode, other.json().code]).toEqual([403, 'PREP_NOT_ENABLED'])
    await list.close()
    const all = await appWith({})
    expect((await all.inject({ method: 'GET', url: '/api/prep/status', headers: { 'x-session-token': otherAdultToken } })).json()).toEqual({ enabled: true, hasCredential: false, imagesAvailable: false })
    expect((await all.inject({ method: 'GET', url: '/api/prep/nope/deeper', headers: { 'x-session-token': adultToken } })).statusCode).toBe(404)
    await all.close()
  })

  test('without accounts (single-user dev mode) prep is unavailable; anonymous requests are 401', async () => {
    const devConfig = prepConfig({ YUNYI_PREP: 'all', OIDC_CLIENT_ID: '', PORTAL_BASE_URL: '' })
    const dev = await buildServer({ pool, config: devConfig, store, harness })
    expect((await dev.inject({ method: 'GET', url: '/api/prep/status' })).json().code).toBe('PREP_UNAVAILABLE')
    await dev.close()
    const app = await appWith({ YUNYI_PREP: 'all' })
    expect((await app.inject({ method: 'GET', url: '/api/prep/status' })).statusCode).toBe(401)
    await app.close()
  })
})

// Ruling [T4] F6：渲染路径判定先归一（重复斜杠、点段、百分号编码、大小写、分号参数），全局鉴权之前就 404
test('isPrepRenderPath normalizes before matching', async () => {
  const { isPrepRenderPath } = await import('../src/routes/prep.ts')
  const yes = ['/api/prep/render', '/api/prep/render/', '/api/prep/render/c-1/x?token=abc', '/api//prep/render/c-1/', '/api/prep/./render/c-1/', '/api/prep%2Frender/c-1/',
    '/api/prep%2frender', '/api/prep%252Frender/c-1/', '/api/x/../prep/render/c-1/', '/API/Prep/Render/', '/api/prep/%72ender/', '/api/prep/render;x=1/c-1/', '/api\\prep\\render', '//api///prep//render',
    // M1：非法 % 转义不让判定半途而废
    '/api/prep/%72ender/%zz', '/api/%70rep/render/c-1/%E0%A4%A']
  const no = ['/api/prep/status', '/api/prep/renderx', '/api/prep/courses/c-1/render', '/api/prep', '/api/learning/render', '/prep/render', '/api/prep/rend%2Fer']
  expect(yes.filter((p) => !isPrepRenderPath(p))).toEqual([])
  expect(no.filter((p) => isPrepRenderPath(p))).toEqual([])
})

// Ruling [T4] fix round 1（C1/C1′）：鉴权与闸门按路由视角分类。路由会解码 %70、%61 这类非保留字符，
// 钩子若按原始 req.url 判断，就会漏掉身份解析（名单外的老师进 prep、匿名进账号接口）
describe('encoded paths are classified the way the router matches them', () => {
  const PREP_VARIANTS: Array<[string, string]> = [
    ['GET', '/api/%70rep/status'], ['GET', '/%61pi/prep/status'], ['POST', '/api/pre%70/sessions'], ['GET', '/%61pi/%70rep/courses'],
    ['HEAD', '/api/%70rep/status'], ['HEAD', '/%61pi/prep/status'], ['DELETE', '/api/%70rep/courses/c-1'], ['GET', '/%61%70%69/%70%72%65%70/status'],
  ]
  const send = (app: FastifyInstance, method: string, url: string, headers: Record<string, string>) =>
    app.inject({ method: method as 'GET', url, headers: { ...headers, 'content-type': 'application/json' }, ...(method === 'POST' ? { payload: '{}' } : {}) })

  test('unlisted teacher: 403 PREP_NOT_ENABLED on encoded prep paths (HEAD included); anonymous: 401; the harness sees nothing', async () => {
    calls.length = 0
    const app = await appWith({ YUNYI_PREP: 'list', YUNYI_PREP_USERS: 'course_test_prep_gate_t1' })
    for (const [method, url] of PREP_VARIANTS) {
      const other = await send(app, method, url, { 'x-session-token': otherAdultToken })
      expect([method, url, other.statusCode]).toEqual([method, url, 403])
      if (method !== 'HEAD') expect(other.json().code).toBe('PREP_NOT_ENABLED')
      const anon = await send(app, method, url, {})
      expect([method, url, anon.statusCode]).toEqual([method, url, 401])
    }
    // 大小写：路由区分大小写，这些路径匹配不到 prep 路由，绝不能 200
    for (const url of ['/api/Prep/status', '/API/prep/status', '/api/%50rep/status']) {
      for (const headers of [{ 'x-session-token': otherAdultToken }, {}]) {
        const res = await send(app, 'GET', url, headers)
        expect([url, res.statusCode]).not.toEqual([url, 200])
        expect(res.body).not.toMatch(/hasCredential/)
      }
    }
    // 编码的渲染路径同样先 404
    for (const url of ['/api/%70rep/render/c-1/', '/%61pi/prep/render']) expect([url, (await send(app, 'GET', url, {})).statusCode]).toEqual([url, 404])
    // 非法转义：Fastify 在路由之前就回 400（Nginx 同样 400），不会进任何处理函数
    expect((await send(app, 'GET', '/api/prep/%72ender/%zz', {})).statusCode).toBe(400)
    expect(calls).toEqual([])
    await app.close()
  })

  test('a teacher on an encoded prep path is served like the canonical path (no 401 surprises)', async () => {
    const app = await appWith({ YUNYI_PREP: 'all' })
    const res = await send(app, 'GET', '/api/%70rep/status', { 'x-session-token': adultToken })
    expect([res.statusCode, res.json()]).toEqual([200, { enabled: true, hasCredential: true, imagesAvailable: false }])
    await app.close()
  })

  test('C1′: anonymous requests to encoded account and wallet paths are 401', async () => {
    const app = await appWith({ YUNYI_PREP: 'all' })
    for (const [method, url] of [['GET', '/%61pi/account/me'], ['GET', '/api/%61ccount/me'], ['GET', '/%61pi/auth/wallet']] as const) {
      const res = await send(app, method, url, {})
      expect([method, url, res.statusCode, res.json().code]).toEqual([method, url, 401, 'LOGIN_REQUIRED'])
    }
    // 公开路径照旧公开
    expect((await send(app, 'GET', '/%61pi/health', {})).statusCode).toBe(200)
    expect((await send(app, 'GET', '/api/health', {})).statusCode).toBe(200)
    await app.close()
  })
})

// I1：D7 的凭证判定不回退站点密钥
test('prep ignores YUNYI_TURN_FALLBACK_KEY: a teacher without a yunyi credential still has no credential', async () => {
  const app = await appWith({ YUNYI_PREP: 'all', YUNYI_TURN_FALLBACK_KEY: 'site-key' })
  const res = await app.inject({ method: 'GET', url: '/api/prep/status', headers: { 'x-session-token': otherAdultToken } })
  expect(res.json()).toEqual({ enabled: true, hasCredential: false, imagesAvailable: false })
  const { resolvePrepCredential } = await import('../src/harness/credential.ts')
  expect(await resolvePrepCredential(store, 'course_test_prep_gate_t2')).toBeUndefined()
  expect(await resolvePrepCredential(store, 'course_test_prep_gate_t1')).toBe('key-t1')
  await app.close()
})

// T4 M-a（终审修复）：绝对形式的请求行（直连 Node 时可能出现，Nginx 会先解析成路径）同样在鉴权前 404
test('absolute-form render URLs are 404 before authentication, for anonymous requests too', async () => {
  const { isPrepRenderPath } = await import('../src/routes/prep.ts')
  for (const url of ['http://evil/api/prep/render', 'http://evil/api/prep/render/c-1/', 'https://h:8001/api/prep/render?x=1', 'HTTP://evil//api/prep/%72ender']) expect([url, isPrepRenderPath(url)]).toEqual([url, true])
  for (const url of ['http://evil/api/prep/status', 'http://evil/', 'http:/api/prep/render-not']) expect([url, isPrepRenderPath(url)]).toEqual([url, false])
  const app = await appWith({ YUNYI_PREP: 'all' })
  for (const url of ['http://evil/api/prep/render', 'http://evil/api/prep/render/c-1/x']) {
    const res = await app.inject({ method: 'GET', url })
    expect([url, res.statusCode]).toEqual([url, 404])
  }
  await app.close()
})

// T4 M-b（终审修复）：只靠 prep 插件自己的闸门（根级钩子没有解析身份时）也拒绝——不经 server.ts，单独挂 prepRoutes
describe('the prep gate on its own (no root hook)', () => {
  async function bare(authenticate: (req: { user_id?: string }, reply: { code(n: number): { send(b: unknown): unknown } }) => Promise<boolean>) {
    const { default: Fastify } = await import('fastify')
    const { prepRoutes } = await import('../src/routes/prep.ts')
    const app = Fastify()
    const seen: string[] = []
    app.decorate('deps', { config: prepConfig({ YUNYI_PREP: 'all' }), store } as never)
    app.decorate('prep', { courses: { facade: async () => { seen.push('facade'); throw new Error('not reached') } }, conversations: { forOwner: () => { seen.push('conversations'); throw new Error('not reached') } } } as never)
    app.decorate('authenticateRequest', authenticate as never)
    await app.register(prepRoutes)
    return { app, seen }
  }
  test('identity is resolved by the gate itself; a failed, missing or throwing resolution never reaches a handler', async () => {
    const cases: Array<[string, Parameters<typeof bare>[0], number, string | undefined]> = [
      ['401 from the resolver', async (_req, reply) => { reply.code(401).send({ error: '请先登录。', code: 'LOGIN_REQUIRED' }); return false }, 401, 'LOGIN_REQUIRED'],
      ['resolver says ok but sets no identity', async () => true, 403, 'PREP_UNAVAILABLE'],
      ['resolver throws', async () => { throw new Error('auth down') }, 500, undefined],
    ]
    for (const [label, authenticate, status, code] of cases) {
      const { app, seen } = await bare(authenticate)
      for (const [method, url] of [['GET', '/api/prep/status'], ['GET', '/api/prep/courses'], ['POST', '/api/prep/sessions'], ['GET', '/api/prep/sessions/s-1']] as const) {
        const res = await app.inject({ method, url, ...(method === 'POST' ? { payload: {} } : {}) })
        expect([label, url, res.statusCode]).toEqual([label, url, status])
        if (code) expect(res.json().code).toBe(code)
        expect(res.body).not.toMatch(/hasCredential|sessions/)
      }
      expect([label, seen]).toEqual([label, []])
      await app.close()
    }
  })
})
