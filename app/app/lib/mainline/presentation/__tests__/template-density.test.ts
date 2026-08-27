import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('课程母版密度契约', () => {
  it('课堂与备课共用安全区变量，备课不再为不存在的对白保留大块空白', () => {
    const globals = readFileSync(resolve(process.cwd(), 'app/globals.css'), 'utf8')
    const classroom = readFileSync(resolve(process.cwd(), 'app/components/mainline/StageCanvas.tsx'), 'utf8')
    const preview = readFileSync(resolve(process.cwd(), 'app/components/mainline/workbench/PreviewStage.tsx'), 'utf8')

    expect(globals).toContain('.scene-safe-height')
    expect(globals).toContain('.scene-safe-bottom')
    expect(classroom).toContain("'--scene-safe-bottom': '16%'")
    expect(preview).toContain("'--scene-safe-bottom': '4%'")
  })

  it('母版不再散落旧的 16%-23% 固定底部留白', () => {
    const viewDir = resolve(process.cwd(), 'app/components/mainline/scene-views')
    const source = readdirSync(viewDir)
      .filter(file => file.endsWith('.tsx'))
      .map(file => readFileSync(resolve(viewDir, file), 'utf8'))
      .join('\n')

    expect(source).not.toMatch(/pb-\[(?:16|18|20)%\]/)
    expect(source).not.toMatch(/h-\[77%\]/)
  })

  it('备课预览锁定学生实际看到的 16:9 画幅，右栏再长也不挤出上下黑边', () => {
    const centerColumn = readFileSync(resolve(process.cwd(), 'app/components/mainline/workbench/CenterColumn.tsx'), 'utf8')
    const styles = readFileSync(resolve(process.cwd(), 'app/components/mainline/workbench/PrepWorkbench.module.css'), 'utf8')

    expect(centerColumn).toContain('data-layout-rule="stage-16x9"')
    expect(styles).toContain('.previewFrame')
    expect(styles).toContain('flex: 0 0 auto')
    expect(styles).toContain('width: min(100%, calc((100vh - 230px) * 1.7777778))')
    expect(styles).toContain('aspect-ratio: 16 / 9')
  })

  it('函数图在核心内容双栏里占满证据区，不再缩成辅助注脚', () => {
    const contentForms = readFileSync(resolve(process.cwd(), 'app/components/mainline/scene-views/content-forms.tsx'), 'utf8')

    expect(contentForms).toContain('data-layout-rule="function-plot-evidence"')
    expect(contentForms).toContain('width="88%"')
  })

  it('专业图表左侧的核心文本始终在自身栏内换行，不覆盖图形证据', () => {
    const coreContent = readFileSync(resolve(process.cwd(), 'app/components/mainline/scene-views/core-content.tsx'), 'utf8')

    expect(coreContent).toContain('data-layout-rule="core-content-wrap"')
    expect(coreContent).toContain("overflowWrap: 'anywhere'")
    expect(coreContent).toContain("wordBreak: 'break-word'")
  })
})
