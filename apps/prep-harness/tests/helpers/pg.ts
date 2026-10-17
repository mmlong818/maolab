import { config } from 'dotenv'
import { resolve } from 'node:path'
import pg from 'pg'
import { normalizePgUrl } from '@maolab/domain'
config({ path: resolve(import.meta.dirname, '..', '..', '..', '..', '.env') })

export function pgUrl(): string {
  const url = process.env.YUNYI_PG_URL ?? process.env.PG_DATABASE_URL
  if (!url) throw new Error('需要 PG_DATABASE_URL（.env）或 YUNYI_PG_URL')
  return normalizePgUrl(url)
}
/** 只删测试 schema（Ruling [api-test-db]）：harness 测试连的可能是开发库，名字不含 test 的 schema 一律拒绝 */
export async function resetSchema(schema: string): Promise<void> {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema) || !schema.includes('test')) throw new Error(`拒绝 DROP schema "${schema}"：测试只能重建名字含 test 的 schema`)
  const client = new pg.Client({ connectionString: pgUrl() })
  await client.connect()
  try { await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`) } finally { await client.end() }
}
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<pg.QueryResult<T>> {
  const client = new pg.Client({ connectionString: pgUrl() })
  await client.connect()
  try { return await client.query<T>(sql, params) } finally { await client.end() }
}
