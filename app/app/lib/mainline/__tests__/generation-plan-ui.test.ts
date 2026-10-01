import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('页面生成与真实画面检查入口', () => {
  it('区分正文检查点和真实渲染检查点，并只调用服务端截图端点', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'app/(setup)/mainline/[courseId]/plan/CoursePlanReview.tsx'),
      'utf8',
    )
    expect(source).toContain('/render-next')
    expect(source).toContain('检查第 ${renderJob.order} 页画面')
    expect(source).toContain('内容通过，待检查画面')
    expect(source).toContain('画面检查已通过')
    expect(source).not.toContain("action: 'complete-page'")
  })
})
