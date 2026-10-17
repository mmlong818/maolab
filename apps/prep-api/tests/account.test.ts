import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { resetDb } from './helpers/db.ts'
import { testApp } from './helpers/app.ts'

let ctx: Awaited<ReturnType<typeof testApp>>
beforeAll(async () => { ctx = await testApp() })
beforeEach(() => resetDb(ctx.pool))
afterAll(async () => { await ctx.app.close(); await ctx.pool.end() })

test('health is public', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/health' })
  expect(r.statusCode).toBe(200)
  expect(r.headers['x-served-by']).toBe('api')
})

test('me without token is 401 with the LOGIN_REQUIRED shape', async () => {
  const r = await ctx.app.inject({ method: 'GET', url: '/api/account/me' })
  expect(r.statusCode).toBe(401)
  expect(r.json()).toEqual({ error: '未登录或登录已过期', code: 'LOGIN_REQUIRED' })
})

test('me for a yunyi teacher via X-Session-Token', async () => {
  await ctx.store.getOrCreateUser('yy_admin1')
  await ctx.store.setCredential('admin1', { apiKey: 'k' })
  const token = await ctx.store.createToken('admin1')
  const r = await ctx.app.inject({ method: 'GET', url: '/api/account/me', headers: { 'x-session-token': token } })
  expect(r.statusCode).toBe(200)
  expect(r.json()).toEqual({ enabled: true, user: { id: 'admin1', displayName: null, email: null, channel: 'yunyi', isAdmin: true }, billing: 'user' })
})

test('me for a portal account without a credential bills to the site and is not admin', async () => {
  const id = String(await ctx.store.getOrCreateUser('pt_teacher2'))
  const token = await ctx.store.createToken(id)
  const r = await ctx.app.inject({ method: 'GET', url: '/api/account/me', headers: { 'x-session-token': token } })
  expect(r.json()).toEqual({ enabled: true, user: { id, displayName: null, email: null, channel: 'portal', isAdmin: false }, billing: 'site' })
})
