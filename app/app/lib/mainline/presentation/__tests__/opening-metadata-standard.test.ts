import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sourceReadingPath = resolve(
  process.cwd(),
  'app/components/mainline/scene-views/source-reading.tsx',
)

describe('开场投影片元数据规则', () => {
  it('每套开场母版只显示一次学科，不在页脚重复学科和学段', () => {
    const source = readFileSync(sourceReadingPath, 'utf8')
    const masterCount = (source.match(/^function SourceReading\w+Master\(/gm) ?? []).length
    const subjectLabelCount = (source.match(/subjectLabel\(course\.subject\)/g) ?? []).length

    expect(masterCount).toBe(8)
    expect(subjectLabelCount).toBe(masterCount)
    expect(source).not.toContain('gradeBandLabel(course.gradeBand)')
  })
})
