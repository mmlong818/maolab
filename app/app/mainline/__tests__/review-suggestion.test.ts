import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('ReviewSuggestion 到期复习入口', () => {
  const source = readFileSync(resolve(process.cwd(), 'app/mainline/ReviewSuggestion.tsx'), 'utf8')

  it('只把已到期知识点送入明确标记的复习课，并先进入备课', () => {
    expect(source).toContain('actionable.filter(item => item.reviewDue)')
    expect(source).toContain("status === 'verified' || status === 'provisional-self-assessment'")
    expect(source).toContain("lessonPhase: 'review'")
    expect(source).toContain('`/mainline/${data.courseId}/prep`')
  })

  it('未到期时不允许立刻重复生成', () => {
    expect(source).toContain('disabled={busy || picked.length === 0}')
    expect(source).toContain("actionable.length === 0 ? '无可用学情'")
    expect(source).toContain('避免短时记忆造成“已经掌握”的错觉')
  })

  it('演示种子和历史来源不明的分数只披露，不驱动自动复习', () => {
    expect(source).toContain('演示种子 ${percent} · 非学生作答')
    expect(source).toContain('历史分数 ${percent} · 来源未确认')
    expect(source).toContain('不会自动生成复习课或改变正式课程结构')
  })
})
