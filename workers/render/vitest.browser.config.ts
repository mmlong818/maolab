import { defineConfig } from 'vitest/config'

// 真实浏览器测试：单进程、文件串行，每个文件只启动一个浏览器（afterAll 关闭）。不要与 next build 或其他 Node 测试同时跑。
// 找不到浏览器时跳过；设了 RENDER_BROWSER_PATH 却找不到则失败（CI 设它，避免静默跳过）。
export default defineConfig({
  test: {
    include: ['tests-browser/**/*.test.ts'],
    fileParallelism: false,
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 90_000,
    hookTimeout: 60_000,
  },
})
