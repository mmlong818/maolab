import { describe, it, expect, beforeEach } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createDb } from '../client.js'
import { createTeachingPlanRepository } from '../repositories/teaching-plan.sqlite.js'
import { parseJsonColumn } from '../repositories/parse-column.js'
import { teachingPlans } from '../schema.js'

/**
 * code-review-2026-06-13 H-4 的回归。
 *
 * 原状:`JSON.parse(row.x) as T` 在数据损坏时抛
 * 「Unexpected token } in JSON at position 417」——不知道是哪张表哪一行哪一列,
 * 500 之后只能人肉翻库。审查评 HIGH 不是因为容易发生,是因为排查成本高得离谱。
 *
 * 这组测试守两件事:**错误里必须带得回定位信息**,以及**失败语义不变(仍然抛)**。
 * 后者同样重要:静默吞掉会把「数据坏了」变成「数据没了」。
 */

function createTestDb() {
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder: './src/migrations' })
  return db
}

describe('parseJsonColumn', () => {
  it('合法 JSON 原样返回', () => {
    expect(parseJsonColumn<{ a: number }>('{"a":1}', { table: 't', id: 'x', column: 'c' })).toEqual({ a: 1 })
  })

  it('损坏时错误信息带表名、行 id、列名三者', () => {
    let message = ''
    try {
      parseJsonColumn('{oops', { table: 'teaching_plans', id: 'plan-42', column: 'outline' })
    } catch (e) {
      message = (e as Error).message
    }
    expect(message).toContain('teaching_plans')
    expect(message).toContain('plan-42')
    expect(message).toContain('outline')
  })

  it('保留原始解析错误为 cause,不吞掉底层信息', () => {
    try {
      parseJsonColumn('{oops', { table: 't', id: 'x', column: 'c' })
      expect.unreachable('应当抛出')
    } catch (e) {
      expect((e as Error).cause).toBeInstanceOf(Error)
    }
  })

  it('**仍然抛,不返回 undefined 也不返回空值**(坏数据不能被静默成没数据)', () => {
    expect(() => parseJsonColumn('{oops', { table: 't', id: 'x', column: 'c' })).toThrow()
  })
})

describe('repo 层:坏行能报出是哪一行', () => {
  let db: ReturnType<typeof createDb>

  beforeEach(() => {
    db = createTestDb()
  })

  it('teaching_plans 的 outline 列损坏时,错误点名该行 id', async () => {
    db.insert(teachingPlans).values({
      id: 'plan-broken',
      topic: '光合作用',
      teachingMethod: 'standard',
      style: 'lecture',
      language: 'zh-CN',
      difficulty: 'intermediate',
      outline: '[{"id":"o1"',            // 截断的 JSON,模拟写入中断
      agents: '[]',
      emphasizedConcepts: '[]',
      sourceDocuments: '[]',
      createdAt: 1000,
    }).run()

    const repo = createTeachingPlanRepository(db)
    await expect(repo.find('plan-broken')).rejects.toThrow(/plan-broken/)
  })
})
