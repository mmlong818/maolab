import { defineConfig } from 'vitest/config'

// 需要 TEST_PG_DATABASE_URL（库名含 test、已跑 backend alembic upgrade head）；只动 course_test_* schema 与 course_test_ 开头的账号行
export default defineConfig({ test: { environment: 'node', include: ['tests-pg/**/*.test.ts'], fileParallelism: false, testTimeout: 30_000 } })
