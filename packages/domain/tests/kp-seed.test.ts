// 生产库在 SDP 内网、本机连不上：kp 以 seed 文件（gzip 的 NDJSON）随 prep-api 镜像带入，启动时只在 kp 为空时导入一次。
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { knowledgeDdl } from '@maolab-core/knowledge'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { exportKpSeed, seedKpIfEmpty } from '../src/kp-seed.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
const SOURCE = 'domain_test_kp_seed_src'
const TARGET = 'domain_test_kp_seed_dst'
const dir = mkdtempSync(join(tmpdir(), 'maolab-kp-seed-'))
const seedFile = join(dir, 'kp-seed.jsonl.gz')
const KP_COUNT = 2345

const snapshot = async (schema: string) => ({
  datasets: (await pool.query(`SELECT name, version, kp_count, relation_count, imported_at FROM ${schema}.datasets ORDER BY name`)).rows,
  kps: (await pool.query(`SELECT * FROM ${schema}.knowledge_points ORDER BY id`)).rows,
  relations: (await pool.query(`SELECT * FROM ${schema}.kp_relations ORDER BY id`)).rows,
})
const resetTarget = async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${TARGET} CASCADE`)
  await pool.query(knowledgeDdl(TARGET))
}

beforeAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SOURCE} CASCADE`)
  await pool.query(knowledgeDdl(SOURCE))
  await pool.query(`INSERT INTO ${SOURCE}.datasets VALUES ('k12', '2026-09-04T17:50:24.144Z', ${KP_COUNT}, ${KP_COUNT - 1}, '2026-10-01T00:00:00Z')`)
  // 超过一批（1000 行），中文、jsonb、空 confidence 都要原样往返
  await pool.query(`INSERT INTO ${SOURCE}.knowledge_points (id, canonical_name, subject, grade_band, summary, aliases, annotations, confidence, dataset)
    SELECT 'kp-' || lpad(i::text, 5, '0'), '知识点' || i, '数学', '初中', '摘要 "引号" ' || i, jsonb_build_array('别名' || i),
      jsonb_build_object('learningObjectives', jsonb_build_object('value', jsonb_build_array('能说明' || i), 'source', 'llm')),
      CASE WHEN i % 2 = 0 THEN NULL ELSE i / 10.0 END, 'k12'
    FROM generate_series(1, ${KP_COUNT}) AS i`)
  await pool.query(`INSERT INTO ${SOURCE}.kp_relations (id, from_kp_id, to_kp_id, relation_type, source_evidence, dataset)
    SELECT 'rel-' || i, 'kp-' || lpad(i::text, 5, '0'), 'kp-' || lpad((i + 1)::text, 5, '0'), 'prerequisite', CASE WHEN i % 3 = 0 THEN NULL ELSE '教材' END, 'k12'
    FROM generate_series(1, ${KP_COUNT - 1}) AS i`)
  await exportKpSeed(pool, seedFile, { schema: SOURCE })
}, 120_000)
afterAll(async () => {
  await pool.query(`DROP SCHEMA IF EXISTS ${SOURCE} CASCADE`)
  await pool.query(`DROP SCHEMA IF EXISTS ${TARGET} CASCADE`)
  await pool.end()
})

test('an exported seed imported into an empty kp schema reproduces every row exactly', async () => {
  await resetTarget()
  const result = await seedKpIfEmpty(pool, seedFile, { schema: TARGET })
  expect(result).toEqual({ imported: true, datasets: 1, knowledgePoints: KP_COUNT, relations: KP_COUNT - 1 })
  expect(await snapshot(TARGET)).toEqual(await snapshot(SOURCE))
}, 120_000)

test('a kp schema that already has knowledge points is left untouched (safe on every restart)', async () => {
  await resetTarget()
  await pool.query(`INSERT INTO ${TARGET}.knowledge_points (id, canonical_name, subject, grade_band, dataset) VALUES ('kp-existing', '已有', '语文', '小学', 'k12')`)
  expect(await seedKpIfEmpty(pool, seedFile, { schema: TARGET })).toEqual({ imported: false, reason: 'not-empty' })
  expect((await pool.query(`SELECT id FROM ${TARGET}.knowledge_points`)).rows).toEqual([{ id: 'kp-existing' }])
})

test('a broken seed file fails and leaves the kp schema empty (one transaction)', async () => {
  await resetTarget()
  const good = (await snapshot(SOURCE)).kps.slice(0, 1500).map((r) => JSON.stringify({ t: 'knowledge_points', r }))
  const broken = join(dir, 'broken.jsonl.gz')
  writeFileSync(broken, gzipSync([...good, '{"t":"knowledge_points","r":{"id":'].join('\n')))
  await expect(seedKpIfEmpty(pool, broken, { schema: TARGET })).rejects.toThrow()
  expect((await pool.query(`SELECT count(*)::int AS n FROM ${TARGET}.knowledge_points`)).rows[0].n).toBe(0)
})

test('a configured seed file that does not exist is a startup error naming the path', async () => {
  await resetTarget()
  await expect(seedKpIfEmpty(pool, join(dir, 'missing.jsonl.gz'), { schema: TARGET })).rejects.toThrow(/missing\.jsonl\.gz/)
})
