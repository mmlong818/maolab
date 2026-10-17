import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
const HEAVY = ['playwright', 'playwright-core', 'puppeteer', 'puppeteer-core', 'pptxgenjs']
const deps = (pkg: string) => {
  const json = JSON.parse(readFileSync(join(ROOT, pkg, 'package.json'), 'utf8')) as Record<string, Record<string, string> | undefined>
  return Object.keys({ ...json.dependencies, ...json.devDependencies, ...json.optionalDependencies })
}

test('only the render worker depends on a browser driver or the pptx writer (spec 15: heavy work stays out of harness)', () => {
  const others = ['apps/harness', 'apps/api', 'packages/bundle', 'packages/course', 'packages/domain', 'apps/harness/.dsh-home/profiles/yunyi-host']
  for (const pkg of others.filter((p) => existsSync(join(ROOT, p, 'package.json')))) expect(deps(pkg).filter((d) => HEAVY.includes(d)), pkg).toEqual([])
  expect(deps('workers/render')).toEqual(expect.arrayContaining(['playwright-core', 'pptxgenjs']))
})
