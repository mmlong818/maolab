// 真实宿主的运行方式（--experimental-strip-types，apps/harness/Dockerfile 的 NODE_OPTIONS）下经 prep 加载器加载 @maolab/course：
// 迁入代码有参数属性与 ./x.js 指向 .ts 的导入，靠 tsx 的 tsImport 转换（计划"已定事实"）。vitest 自己会转译，证明不了这件事，所以起子进程。
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const harnessDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')

test('the strip-types host runtime loads @maolab/course once through the prep loader and runs a facade call', () => {
  const code = [
    "const { loadCourseApi } = await import('@maolab/prep-bundle/prep-course-loader')",
    'const api = await loadCourseApi()',
    'if (api !== await loadCourseApi()) throw new Error("course module loaded twice")',
    'const facade = api.createPrepFacade({ documents: api.createMemoryCourseDocuments(), knowledge: { knowledgePoints: async () => [], knowledgePointSources: async () => [] } })',
    'process.stdout.write(JSON.stringify(await facade.listCourses()))',
  ].join('\n')
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', code], { cwd: harnessDir, encoding: 'utf8', timeout: 120_000 })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  expect(run.stdout).toBe('{"ok":true,"courses":[]}')
}, 150_000)
