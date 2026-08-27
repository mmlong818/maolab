import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('元认知策略页专属渲染', () => {
  it('把时机、执行步骤和自检绑定到同一张学生页', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/components/mainline/scene-views/concept-build.tsx'),
      'utf8',
    )

    expect(source).toContain('data-concept-template="strategy-cycle"')
    expect(source).toContain("const trigger = scene.contentSlots.trigger ?? ''")
    expect(source).toContain('strategyStepNodes(scene.contentSlots.steps)')
    expect(source).toContain("const selfCheck = scene.contentSlots.selfCheck ?? ''")
    expect(source).toContain('何时使用')
    expect(source).toContain('怎样执行')
    expect(source).toContain('如何确认')
    expect(source).toContain("template?.id === 'strategy-cycle'")
  })
})
