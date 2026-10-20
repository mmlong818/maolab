// k12 知识点 seed：生产库在 SDP 内网、本机连不上，import-k12 无法直连。改为在本机从已导入的库导出 seed 文件
// （gzip 的 NDJSON，每行 {"t":表名,"r":行}，按 datasets → knowledge_points → kp_relations 的顺序），随 prep-api 镜像带入；
// prep-api 启动时若设了 MAOLAB_KP_SEED_FILE，就在 kp 为空时整份导入一次（单事务 + advisory 锁，多实例同时启动也只导一次）。
// kp 已有数据就跳过：导完删掉这个变量即可，忘了删也无害。以后的知识点更新另做（ISSUES 34）。
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import { finished } from 'node:stream/promises'
import { createGunzip, createGzip } from 'node:zlib'
import type pg from 'pg'

export const KP_SEED_FILE_ENV = 'MAOLAB_KP_SEED_FILE'
const TABLES = [['datasets', 'name'], ['knowledge_points', 'id'], ['kp_relations', 'id']] as const
type Table = (typeof TABLES)[number][0]
const BATCH = 1000

export interface KpSeedOptions { schema?: string }
export type KpSeedResult =
  | { imported: true; datasets: number; knowledgePoints: number; relations: number }
  | { imported: false; reason: 'not-empty' }

/** 把 schema（默认 kp）的三张表导出成 seed 文件；按主键分批读，不一次性载入 */
export async function exportKpSeed(pool: pg.Pool, file: string, options: KpSeedOptions = {}): Promise<void> {
  const schema = options.schema ?? 'kp'
  const gzip = createGzip()
  const out = gzip.pipe(createWriteStream(file))
  const write = async (line: string) => { if (!gzip.write(line + '\n')) await once(gzip, 'drain') }
  for (const [table, key] of TABLES) {
    let after = ''
    for (;;) {
      const { rows } = await pool.query<{ j: Record<string, unknown> }>(
        `SELECT row_to_json(x) AS j FROM (SELECT * FROM ${schema}.${table} WHERE ${key} > $1 ORDER BY ${key} LIMIT ${BATCH}) x`, [after])
      if (rows.length === 0) break
      for (const { j } of rows) await write(JSON.stringify({ t: table, r: j }))
      after = String(rows.at(-1)!.j[key])
    }
  }
  gzip.end()
  await finished(out)
}

/** kp 为空时导入 seed 文件；文件不存在、行坏了都抛错（整份回滚），不留半套数据 */
export async function seedKpIfEmpty(pool: pg.Pool, file: string, options: KpSeedOptions = {}): Promise<KpSeedResult> {
  const schema = options.schema ?? 'kp'
  if (!existsSync(file)) throw new Error(`${KP_SEED_FILE_ENV} 指向的 seed 文件不存在：${file}`)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`kp-seed:${schema}`])
    const { rows } = await client.query(`SELECT EXISTS (SELECT 1 FROM ${schema}.knowledge_points) AS has`)
    if (rows[0].has) {
      await client.query('ROLLBACK')
      return { imported: false, reason: 'not-empty' }
    }
    const counts: Record<Table, number> = { datasets: 0, knowledge_points: 0, kp_relations: 0 }
    let table: Table | undefined
    let batch: unknown[] = []
    const flush = async () => {
      if (!table || batch.length === 0) return
      await client.query(`INSERT INTO ${schema}.${table} SELECT * FROM json_populate_recordset(NULL::${schema}.${table}, $1::json)`, [JSON.stringify(batch)])
      counts[table] += batch.length
      batch = []
    }
    const lines = createInterface({ input: createReadStream(file).pipe(createGunzip()), crlfDelay: Infinity })
    for await (const line of lines) {
      if (!line.trim()) continue
      const { t, r } = JSON.parse(line) as { t: string; r: unknown }
      if (!TABLES.some(([name]) => name === t)) throw new Error(`seed 文件里有未知的表：${t}`)
      if (t !== table) { await flush(); table = t as Table }
      batch.push(r)
      if (batch.length >= BATCH) await flush()
    }
    await flush()
    await client.query('COMMIT')
    return { imported: true, datasets: counts.datasets, knowledgePoints: counts.knowledge_points, relations: counts.kp_relations }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
  }
}
