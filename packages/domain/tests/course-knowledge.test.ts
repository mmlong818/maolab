import { knowledgeDdl } from '@maolab-core/knowledge'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { PgCourseKnowledge } from '../src/course-knowledge.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
const SCHEMA = 'domain_test_course_knowledge'
const knowledge = new PgCourseKnowledge(pool, { schema: SCHEMA })
const annotations = { knowledgeType: { value: 'procedural', source: 'llm' }, learningObjectives: { value: ['能说明焓变符号的含义'], source: 'human' } }

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await pool.query(knowledgeDdl(SCHEMA))
  await pool.query(`INSERT INTO ${SCHEMA}.knowledge_points (id, canonical_name, subject, grade_band, annotations, dataset) VALUES
    ('kp-primary', '三角形面积', '数学', '小学', '{}', 'k12'),
    ('kp-high', '焓变与反应热', '化学', '高中', $1::jsonb, 'k12'),
    ('kp-blank', '说明文阅读', '语文', '', '{}', 'k12')`, [JSON.stringify(annotations)])
})
afterAll(async () => { await pool.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`); await pool.end() })

test('defaults to the kp schema that maolab-core/knowledge creates', () => {
  expect(new PgCourseKnowledge(pool).schema).toBe('kp')
})

test('knowledge points are fetched by id across K12 with sqlite-shaped columns', async () => {
  const rows = await knowledge.knowledgePoints(['kp-high', 'kp-primary', 'missing', 'kp-high', 'kp-blank'])
  expect(rows.map((row) => row.id)).toEqual(['kp-blank', 'kp-high', 'kp-primary'])
  expect(rows.find((row) => row.id === 'kp-primary')).toEqual({ id: 'kp-primary', canonical_name: '三角形面积', subject: '数学', grade_band: '小学', annotations: '{}' })
  expect(rows.find((row) => row.id === 'kp-blank')!.grade_band).toBeNull()
  expect(JSON.parse(rows.find((row) => row.id === 'kp-high')!.annotations!)).toEqual(annotations)
  expect(await knowledge.knowledgePoints([])).toEqual([])
})

test('k12 dataset carries no textbook evidence, so sources are always empty', async () => {
  expect(await knowledge.knowledgePointSources(['kp-high', 'kp-primary'])).toEqual([])
  expect(await knowledge.knowledgePointSources([])).toEqual([])
})
