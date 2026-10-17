import { accountDdl } from '@maolab-core/auth'
import { knowledgeDdl } from '@maolab-core/knowledge'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type pg from 'pg'

const MIGRATIONS = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')

/** 先建 account（core/auth）与 kp（core/knowledge，k12 数据集只读副本）两个 schema，课程迁移的外键要 account.users；
 *  再跑 course 迁移链：0000 课程文档、0001 产物与渲染任务、0002 备课对话（自 maolab-ai-learning 0005–0007 迁入重编）。 */
export async function runMigrations(pool: pg.Pool): Promise<void> {
  await pool.query(accountDdl())
  await pool.query(knowledgeDdl())
  await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS, migrationsSchema: 'course', migrationsTable: '__drizzle_migrations' })
}
