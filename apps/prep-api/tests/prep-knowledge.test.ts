// 知识点选择（S3）：k12 数据集没有教材章节树，老师按学段、学科与关键词检索（maolab-core/knowledge 的 PgKnowledge）。
import { afterAll, beforeAll, expect, test } from 'vitest'
import { prepTestApp } from './helpers/prep.ts'

const A = 'course_test_prep_kn_a'
const SCHEMA = 'course_test_prep_kn'
const KP = 'course_test_prep_kn_kp'
let env: Awaited<ReturnType<typeof prepTestApp>>
let token = ''
const get = (url: string, auth = true) => env.app.inject({ method: 'GET', url, headers: auth ? { 'x-session-token': token } : {} })

beforeAll(async () => {
  env = await prepTestApp({ owners: [A], courseSchema: SCHEMA, knowledgeSchema: KP })
  token = await env.token(A)
  // 夹具已有两条初中语文；再加别的学段学科与一批同名前缀的条目（limit 用）
  await env.pool.query(`INSERT INTO ${KP}.knowledge_points (id, canonical_name, subject, grade_band, summary, confidence, dataset) VALUES
    ('kn-math-1', '二元一次方程组', '数学', '初中', '代入消元与加减消元', 0.9, 'k12'),
    ('kn-phys-1', '二力平衡', '物理', '初中', '平衡条件', 0.95, 'k12'),
    ('kn-math-p', '分数的意义', '数学', '小学', '', 0.8, 'k12'),
    ('kn-chem-h', '化学反应速率', '化学', '高中', '', 0.7, 'k12')`)
  const rows = Array.from({ length: 130 }, (_, i) => `('kn-bulk-${i}', '批量条目${i}', '历史', '高中', '', 0.5, 'k12')`).join(',')
  await env.pool.query(`INSERT INTO ${KP}.knowledge_points (id, canonical_name, subject, grade_band, summary, confidence, dataset) VALUES ${rows}`)
  await env.pool.query(`INSERT INTO ${KP}.datasets (name, version, kp_count, relation_count, imported_at) VALUES ('k12-knowledge-points', '2026-09-04T17:50:24.144Z', 136, 0, now()) ON CONFLICT (name) DO UPDATE SET version = excluded.version, kp_count = excluded.kp_count`)
}, 300_000)
afterAll(async () => { await env?.close() })

test('anonymous requests are 401', async () => {
  expect((await get('/api/prep/knowledge/search?q=二力', false)).statusCode).toBe(401)
  expect((await get('/api/prep/knowledge/facets', false)).statusCode).toBe(401)
})

test('keyword search returns the matching points with their band and subject, best match first', async () => {
  const res = await get(`/api/prep/knowledge/search?q=${encodeURIComponent('二力平衡')}`)
  expect(res.statusCode).toBe(200)
  expect(res.json().items[0]).toEqual({ id: 'kn-phys-1', name: '二力平衡', subject: '物理', gradeBand: '初中', summary: '平衡条件' })
})

test('band and subject filters narrow the result; an empty keyword with a band lists that band only, capped at 20 by default', async () => {
  const math = (await get(`/api/prep/knowledge/search?q=&subject=${encodeURIComponent('数学')}&gradeBand=${encodeURIComponent('小学')}`)).json().items
  expect(math.map((i: { id: string }) => i.id)).toEqual(['kn-math-p'])
  const high = (await get(`/api/prep/knowledge/search?gradeBand=${encodeURIComponent('高中')}`)).json().items as Array<{ gradeBand: string }>
  expect(high).toHaveLength(20)
  expect(high.every((i) => i.gradeBand === '高中')).toBe(true)
})

test('limit is clamped to 100', async () => {
  const items = (await get(`/api/prep/knowledge/search?gradeBand=${encodeURIComponent('高中')}&limit=500`)).json().items
  expect(items).toHaveLength(100)
})

test('an empty keyword without a band or subject is refused instead of scanning everything; bad parameters are 400', async () => {
  for (const url of ['/api/prep/knowledge/search', '/api/prep/knowledge/search?q=%20%20', `/api/prep/knowledge/search?gradeBand=${encodeURIComponent('大学')}&q=x`, '/api/prep/knowledge/search?q=x&limit=abc', `/api/prep/knowledge/search?q=${'长'.repeat(81)}`]) {
    const res = await get(url)
    expect([url, res.statusCode]).toEqual([url, 400])
  }
})

test('facets list every band with its subjects and the dataset version', async () => {
  const res = await get('/api/prep/knowledge/facets')
  expect(res.statusCode).toBe(200)
  expect(res.json()).toEqual({
    datasetVersion: '2026-09-04T17:50:24.144Z',
    gradeBands: [
      { gradeBand: '小学', subjects: ['数学'] },
      { gradeBand: '初中', subjects: ['数学', '物理', '语文'] },
      { gradeBand: '高中', subjects: ['化学', '历史'] },
    ],
  })
})
