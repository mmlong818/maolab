import { defineConfig } from 'vitest/config'

// 迁入测试在 src/**/__tests__（maolab 原位置，maolab app 的配置是 globals: true + node 环境），新测试在 tests/。
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
