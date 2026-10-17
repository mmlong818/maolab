import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (p: string) => readFileSync(resolve(root, p), 'utf8')
const walk = (dir: string): string[] => readdirSync(resolve(root, dir)).flatMap((name) => {
  const p = join(dir, name)
  return statSync(resolve(root, p)).isDirectory() ? (name === '__tests__' ? [] : walk(p)) : [p]
})
const sources = walk('app/prep').filter((p) => /\.(tsx?|css)$/.test(p) && !p.includes(join('app', 'prep', 'render')))

describe('/prep/ 备课页', () => {
  it('only client components; no server data fetching, no next/navigation router, no full reload, no other product endpoints, never the render data path', () => {
    for (const p of sources.filter((s) => s.endsWith('.tsx'))) expect([p, read(p).startsWith("'use client'") || p.endsWith('page.tsx')]).toEqual([p, true])
    for (const p of sources) {
      const s = read(p)
      expect([p, /from 'next\/navigation'|useRouter|location\.reload|\/api\/v2\/|\/api\/(learner|learning|library)\/|\/api\/prep\/render|\/api\/prep\/publications|getServerSideProps|server-only/.test(s)]).toEqual([p, false])
    }
  })

  it('the page is gated: /prep is not public (only /prep/render is)', () => {
    const gate = read('app/components/AuthGate.tsx')
    expect(gate).toMatch(/const PUBLIC_PATHS = \['\/prep\/render'\]/)
  })

  it('the shell carries no study-room concepts (children, family, learner)', () => {
    for (const p of ['app/components/AuthGate.tsx', 'app/components/AccountMenu.tsx', 'app/prep/PrepWorkspace.tsx', 'app/lib/auth/client.ts']) {
      expect([p, /learner|孩子|家长|\/family|\/join|自习室/.test(read(p))]).toEqual([p, false])
    }
  })

  it('the panel reuses the migrated workbench pieces and the 3b stage, not a second stage', () => {
    const preview = read('app/prep/panel/PagePreview.tsx')
    expect(preview).toContain("from '@/components/mainline/workbench/PreviewStage'")
    // 终审修复（T15 走查第 2 条）：迁入的 StructureTree 按"幕"筛页、组名都叫"课级片段"，页优先课程分组不对；
    // 迁入文件不改，预览改用备课自己的页目录（pageGroups），胶片条与全课内容仍是迁入组件
    expect(preview).toContain("from './preview-model'")
    expect(preview).toContain("from '@/components/mainline/workbench/Filmstrip'")
    expect(preview).toContain("from '@/components/mainline/workbench/CourseContentOverview'")
    expect(read('app/prep/panel/PrepPanel.tsx')).toContain("from '@/components/mainline/workbench/PrepBriefView'")
    // 知识点选择按学段、学科、关键词检索 k12 数据集（S3：数据集没有教材章节树）
    expect(read('app/prep/panel/KpPicker.tsx')).toContain('prepApi.knowledgeFacets()')
    expect(read('app/prep/panel/KpPicker.tsx')).toContain('prepApi.searchKnowledge(')
  })

  it('the static export contains the page (after corepack pnpm build)', () => {
    if (!existsSync(resolve(root, 'out'))) return
    expect(existsSync(resolve(root, 'out/prep/index.html'))).toBe(true)
  })
})
