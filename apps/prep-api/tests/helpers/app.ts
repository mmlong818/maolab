import type { FastifyInstance } from 'fastify'
import { readConfig } from '../../src/config.ts'
import { buildServer } from '../../src/server.ts'
import { PgCredentialStore } from '@maolab-core/auth'
import { TEST_KEY, testPool } from './db.ts'

export async function testApp(): Promise<{ app: FastifyInstance; store: PgCredentialStore; pool: ReturnType<typeof testPool> }> {
  const pool = testPool()
  const config = readConfig({ ...process.env, OIDC_CLIENT_ID: 'maolab-test', OIDC_CLIENT_SECRET: 'secret', OIDC_AUTHORITY: 'https://gateway.example.com', SECRET_ENCRYPTION_KEY: TEST_KEY, MAOLAB_ADMIN_USERS: 'admin1', PORTAL_BASE_URL: '', YUNYI_HARNESS_URL: 'http://127.0.0.1:9', YUNYI_INTERNAL_KEY: 'test-internal-key' })
  const store = new PgCredentialStore(pool, TEST_KEY)
  const app = await buildServer({ pool, config, store })
  return { app, store, pool }
}
