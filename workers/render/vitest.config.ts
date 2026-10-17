import { defineConfig } from 'vitest/config'

// 单元测试：不启动浏览器、不连 PG（本机内存紧张，文件串行）
export default defineConfig({ test: { include: ['tests/**/*.test.ts'], fileParallelism: false } })
