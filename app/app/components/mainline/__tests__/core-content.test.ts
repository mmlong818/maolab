import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('专业图表与例题文字组合', () => {
  it('例题揭晓页使用明确的解题过程和逐步文字，不把题面与待补任务重复塞进通用核心栏', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/mainline/scene-views/core-content.tsx'), 'utf8')

    expect(source).toContain("const isWorkedExample = scene.sceneType === 'worked-example'")
    expect(source).toContain("{isWorkedExample ? '解题过程' : '本页要点'}")
    expect(source).toContain('splitWorkedExampleSteps')
    expect(source).toContain(".split(/；|;|\\n/)")
    expect(source).toContain('/同体.*等大.*反向.*共线/.test(line)')
    expect(source).toContain('验证四条件')
    expect(source).toContain('作用在同一物体上、大小相等、方向相反且在同一直线上')
    expect(source).toContain('String(index + 1).padStart(2, \'0\')')
    expect(source).not.toContain('>本页核心<')
  })

  it('语文原文观察页直接使用全文版式，不重复显示内部核心槽侧栏', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/mainline/SceneTechniqueView.tsx'), 'utf8')

    expect(source).toContain("if (kind === 'chinese' && scene.sceneType === 'visual-observation') return visual")
  })
})
