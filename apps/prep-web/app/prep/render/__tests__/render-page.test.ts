import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PROJECTION_RENDER_CONTRACT, projectionRenderDataPath } from '@maolab/course/render-contract'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('课件渲染页（3b）', () => {
  it('只从渲染约定地址取数、校验约定版本，失败时给 worker 一个可识别的错误标记', () => {
    const page = read('app/prep/render/page.tsx')
    expect(page.startsWith("'use client'")).toBe(true)
    expect(page).toContain('projectionRenderDataPath(courseId)')
    expect(page).toContain('body.contract !== PROJECTION_RENDER_CONTRACT')
    expect(page).toContain('data-render-error={state.message}')
    expect(page).toContain('<StageCanvas courses={[state.course]} />')
    expect(page).not.toMatch(/apiFetch|localStorage|sessionStorage|\/api\/v2\//)
    expect(projectionRenderDataPath('c-1')).toBe('/api/prep/render/c-1/')
    expect(PROJECTION_RENDER_CONTRACT).toBe(1)
  })

  it('投影舞台样式只挂在渲染页上', () => {
    expect(read('app/prep/render/layout.tsx')).toContain("import './prep-render.css'")
    expect(read('app/layout.tsx')).not.toContain('prep-render.css')
  })

  it('渲染页不经登录门：数据只来自 worker 在浏览器里的拦截', () => {
    expect(read('app/components/AuthGate.tsx')).toMatch(/const PUBLIC_PATHS = \[[^\]]*'\/prep\/render'[^\]]*\]/)
  })

  it('前端 nginx 显式 404 渲染数据路径，不转发给任何上游（终审 M4）', () => {
    const conf = read('nginx/default.conf.template')
    const at = conf.indexOf('location ^~ /api/prep/render {')
    expect(at).toBeGreaterThan(-1)
    // ^~ 前缀匹配命中最长前缀后不再查正则 location；放在所有 /api 正则与通用 /api/ 之前，读起来也一目了然
    expect(at).toBeLessThan(conf.indexOf('location ~ ^/api/'))
    expect(at).toBeLessThan(conf.indexOf('location /api/ {'))
    const block = conf.slice(at, conf.indexOf('\n    }', at))
    expect(block).toContain('return 404;')
    expect(block).not.toContain('proxy_pass')
  })
})
