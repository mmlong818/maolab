import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('备课预览缩放兼容契约', () => {
  it('缺少 ResizeObserver 时仍通过首次测量和窗口 resize 显示页面', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/mainline/workbench/PreviewStage.tsx'),
      'utf8',
    )

    expect(source).toContain('recalc()')
    expect(source).toContain("window.addEventListener('resize', recalc)")
    expect(source).toContain("typeof ResizeObserver === 'undefined' ? null")
    expect(source).toContain("window.removeEventListener('resize', recalc)")
    expect(source).toContain('observer?.disconnect()')
  })
})
