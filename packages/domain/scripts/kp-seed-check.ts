// 本机核对：把 seed 文件导进测试库的临时 schema，与源库 kp 逐表比对行数，报耗时与内存峰值。
//   TEST_PG_DATABASE_URL=<测试库> PG_DATABASE_URL=<源库> tsx scripts/kp-seed-check.ts <seed 文件>
import { knowledgeDdl } from '@maolab-core/knowledge'
import { createPool } from '../src/pg.ts'
import { seedKpIfEmpty } from '../src/kp-seed.ts'

const SCHEMA = 'kp_seed_check'
const target = createPool(process.env.TEST_PG_DATABASE_URL!)
const source = createPool(process.env.PG_DATABASE_URL!)
const count = async (pool: typeof target, schema: string) =>
  (await pool.query(`SELECT (SELECT count(*) FROM ${schema}.datasets)::int AS d, (SELECT count(*) FROM ${schema}.knowledge_points)::int AS k, (SELECT count(*) FROM ${schema}.kp_relations)::int AS r`)).rows[0]
let peak = 0
const timer = setInterval(() => { peak = Math.max(peak, process.memoryUsage().rss) }, 50)
try {
  await target.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await target.query(knowledgeDdl(SCHEMA))
  const started = Date.now()
  const result = await seedKpIfEmpty(target, process.argv[2]!, { schema: SCHEMA })
  console.log('result', JSON.stringify(result), 'ms', Date.now() - started, 'peak rss MB', Math.round(peak / 1048576))
  console.log('source', JSON.stringify(await count(source, 'kp')), 'imported', JSON.stringify(await count(target, SCHEMA)))
  const sample = (await source.query(`SELECT * FROM kp.knowledge_points ORDER BY md5(id) LIMIT 50`)).rows
  const ids = sample.map((r) => r.id)
  const copied = (await target.query(`SELECT * FROM ${SCHEMA}.knowledge_points WHERE id = ANY($1)`, [ids])).rows
  const byId = new Map(copied.map((r) => [r.id, JSON.stringify(r)]))
  console.log('sample rows identical', sample.every((r) => byId.get(r.id) === JSON.stringify(r)))
} finally {
  clearInterval(timer)
  await target.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
  await target.end()
  await source.end()
}
