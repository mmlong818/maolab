import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const COMPONENT_ROOT = join(process.cwd(), 'app', 'components', 'mainline')
const CLIENT_FACADE = join(process.cwd(), 'app', 'lib', 'mainline', 'client.ts')

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap(name => {
    const path = join(root, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.[tj]sx?$/.test(name) ? [path] : []
  })
}

describe('mainline client module boundary', () => {
  it('does not import the server-capable mainline barrel from client components', () => {
    const violations = sourceFiles(COMPONENT_ROOT).filter(path => {
      const source = readFileSync(path, 'utf8')
      return source.startsWith("'use client'")
        && /from ['"]@\/lib\/mainline['"]/.test(source)
    })

    expect(violations).toEqual([])
  })

  it('keeps server-only modules outside the browser-safe facade', () => {
    const source = readFileSync(CLIENT_FACADE, 'utf8')
    for (const forbidden of ['node:', './readiness.js', './store.js', './mastery-store.js', './generation-session-service.js']) {
      expect(source).not.toContain(forbidden)
    }
  })
})
