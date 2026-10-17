import { defineConfig } from 'vitest/config'
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], fileParallelism: false, globalSetup: ['tests/helpers/global-setup.ts'] } })
