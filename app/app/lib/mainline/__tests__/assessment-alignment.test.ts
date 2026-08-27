import { describe, expect, it } from 'vitest'
import { practiceAlignment } from '../assessment-alignment.js'

describe('practice assessment alignment', () => {
  it('把“用自己的话说出”视为一次解释行为，不重复要求机械提取', () => {
    const result = practiceAlignment(
      '学生能用自己的话说出核心含义，并判断一个典型误区。',
      '解释这个概念的核心含义，并判断“任何情况都适用”是否正确。',
      '先解释，再写出判断依据。',
    )

    expect(result.expected).toEqual(['explain', 'discriminate'])
    expect(result.missing).toEqual([])
  })

  it('准确说出关键事实仍要求提取证据，不能由判断题替代', () => {
    const result = practiceAlignment(
      '学生能准确说出三项关键事实。',
      '判断“该事件发生在公元前”是否正确。',
      '独立判断并说明理由。',
    )

    expect(result.expected).toEqual(['recall'])
    expect(result.missing).toEqual(['recall'])
  })

  it('studentAction 的通用“独立完成同型任务”不能冒充迁移应用', () => {
    const result = practiceAlignment(
      '学生能在新情境里应用比例策略解决问题。',
      '判断“总价一定与数量成正比”是否正确，并说明理由。',
      '独立完成同型任务。',
    )

    // 新情境+应用+解决 → 真·迁移(apply);判断题面未给新情境,missing 仍是 apply
    expect(result.expected).toContain('apply')
    expect(result.demonstrated).toContain('discriminate')
    expect(result.missing).toEqual(['apply'])
  })

  it('题面明确提供新情境并要求应用时形成迁移证据', () => {
    const result = practiceAlignment(
      '学生能在新情境里应用比例策略解决问题。',
      '在校园节水的新情境中，应用比例策略计算一周可节约的用水量。',
      '独立列式计算，并解释比例关系。',
    )

    expect(result.demonstrated).toEqual(expect.arrayContaining(['explain', 'calculate', 'apply']))
    expect(result.missing).toEqual([])
  })

  it('程序性目标的一道完整同型题仍可作为应用证据', () => {
    const result = practiceAlignment(
      '学生能独立完成一道同型任务。',
      '独立完成一道同型题：解方程 3x + 5 = 20，并写出检验过程。',
      '列式求解后代回检验。',
    )

    expect(result.expected).toEqual(['complete-task'])
    expect(result.demonstrated).toEqual(expect.arrayContaining(['calculate', 'complete-task']))
    expect(result.missing).toEqual([])
  })

  it('作图成功信号不能由纯计算任务替代', () => {
    const result = practiceAlignment(
      '学生能画出光路并标注焦点。',
      '根据焦距 10 cm 计算像距。',
      '独立列式计算。',
    )

    expect(result.expected).toEqual(['construct'])
    expect(result.missing).toEqual(['construct'])
  })

  it('占位题面不可检核', () => {
    const result = practiceAlignment(
      '学生能解释原因。',
      '待 LLM 填充练习题。',
      '独立完成。',
    )

    expect(result.inspectable).toBe(false)
    expect(result.demonstrated).toEqual([])
  })

  it.each([
    {
      signal: '学生能计算结果并解释关键步骤。',
      task: '计算结果，并解释为什么要先合并同类项。',
      expected: ['explain', 'calculate'],
    },
    {
      signal: '学生能画出结构图并解释各部分关系。',
      task: '画出结构图，并解释各部分之间的关系。',
      expected: ['explain', 'construct'],
    },
  ])('保留多个彼此独立的可观察动作：$signal', ({ signal, task, expected }) => {
    const result = practiceAlignment(signal, task, '独立完成题目。')
    expect(result.expected).toEqual(expected)
    expect(result.missing).toEqual([])
  })
})
