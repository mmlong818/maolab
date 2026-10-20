// 从已导入 k12 知识点的库导出 seed 文件，供 prep-api 镜像带入生产（见 src/kp-seed.ts）。
//   PG_DATABASE_URL=<有 kp 数据的库> corepack pnpm -C packages/domain kp:export-seed [输出文件]
// 默认输出 apps/prep-api/seed/kp-seed.jsonl.gz（不进 git，构建 prep-api 镜像时随 apps/prep-api 拷入，容器内路径 /src/apps/prep-api/seed/kp-seed.jsonl.gz）
import { resolve } from 'node:path'
import { createPool } from '../src/pg.ts'
import { exportKpSeed } from '../src/kp-seed.ts'

const url = process.env.PG_DATABASE_URL
if (!url) throw new Error('需要 PG_DATABASE_URL（指向已导入 kp 的库）')
const out = resolve(process.argv[2] ?? resolve(import.meta.dirname, '..', '..', '..', 'apps', 'prep-api', 'seed', 'kp-seed.jsonl.gz'))
const pool = createPool(url)
try {
  const { rows } = await pool.query(`SELECT (SELECT count(*) FROM kp.knowledge_points)::int AS kps, (SELECT count(*) FROM kp.kp_relations)::int AS rels, (SELECT string_agg(name || '@' || version, ', ') FROM kp.datasets) AS datasets`)
  await exportKpSeed(pool, out)
  console.log(`exported ${rows[0].kps} knowledge points, ${rows[0].rels} relations (${rows[0].datasets}) → ${out}`)
} finally {
  await pool.end()
}
