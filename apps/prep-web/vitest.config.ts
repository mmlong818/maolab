import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

// 3b：迁入的投影舞台按 maolab 原样写 @/lib/mainline/*，指到 packages/course/src/mainline（与 tsconfig 的 paths 一致，必须排在 '@' 之前）
// 裸的 @/lib/mainline（workbench/labels.ts 的类型导入）指到课程包的 mainline/index.ts（Ruling [T5] / F1）
export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/lib\/mainline$/, replacement: resolve(__dirname, '../../packages/course/src/mainline/index.ts') },
      { find: /^@\/lib\/mainline\//, replacement: `${resolve(__dirname, '../../packages/course/src/mainline')}/` },
      { find: '@', replacement: resolve(__dirname, 'app') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['app/**/__tests__/**/*.test.ts'],
  },
})
