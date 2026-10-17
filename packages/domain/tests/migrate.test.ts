import { afterAll, beforeAll, expect, test } from 'vitest'
import { runMigrations } from '../src/migrate.ts'
import { testPool } from './helpers/db.ts'

const pool = testPool()
beforeAll(async () => {
  await pool.query('DROP SCHEMA IF EXISTS course CASCADE; DROP SCHEMA IF EXISTS kp CASCADE; DROP SCHEMA IF EXISTS account CASCADE')
})
afterAll(() => pool.end())

const exists = async (name: string): Promise<boolean> => (await pool.query(`select to_regclass($1) as r`, [name])).rows[0].r !== null

test('on an empty database: account and kp DDL first, then the course chain from 0000; idempotent', async () => {
  await runMigrations(pool)
  await runMigrations(pool)
  for (const t of ['account.users', 'kp.knowledge_points', 'kp.kp_relations', 'course.documents', 'course.artifacts', 'course.render_jobs', 'course.prep_sessions', 'course.prep_runs', 'course.package_exports', 'course.package_export_versions']) {
    expect(await exists(t), t).toBe(true)
  }
  const journal = await pool.query<{ n: number }>('select count(*)::int as n from course.__drizzle_migrations')
  expect(journal.rows[0]!.n).toBe(4)
  const fks = await pool.query<{ n: number }>(`select count(*)::int as n from pg_constraint where conname in ('fk_documents_owner', 'fk_artifacts_owner', 'fk_render_jobs_owner', 'fk_render_jobs_course', 'fk_prep_sessions_owner', 'fk_prep_runs_session', 'fk_package_exports_owner', 'fk_package_export_versions_package') and connamespace = 'course'::regnamespace`)
  expect(fks.rows[0]!.n).toBe(8)
  expect(await exists('publication.publications')).toBe(false)
  expect(await exists('learner.profiles')).toBe(false)
})
