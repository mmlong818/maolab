import { describe, expect, it } from 'vitest'
import {
  ensureStudentActionEvidence,
  ensureWorkedExampleSelfExplanation,
  studentActionLeavesEvidence,
  workedExampleActionHasSelfExplanation,
} from '../learning-action.js'

describe('student learning action evidence', () => {
  it('does not treat passive reading, observation, confirmation, or dragging as evidence', () => {
    expect(studentActionLeavesEvidence('沿 A→B→C 路径逐层阅读，确认定义与符号规则')).toBe(false)
    expect(studentActionLeavesEvidence('拖动滑块，观察物像落点变化')).toBe(false)
    expect(studentActionLeavesEvidence('阅读 AI 说法并思考差异')).toBe(false)
    expect(studentActionLeavesEvidence('观察画面并确认差异')).toBe(false)
    expect(studentActionLeavesEvidence('阅读描写片段并体会意境')).toBe(false)
    expect(studentActionLeavesEvidence('明确本页学习目标')).toBe(false)
  })

  it('accepts an answer, annotation, judgment, calculation, or explanation', () => {
    expect(studentActionLeavesEvidence('标出三处证据并写出判断理由')).toBe(true)
    expect(studentActionLeavesEvidence('从四条光路中选出正确答案')).toBe(true)
    expect(studentActionLeavesEvidence('口述结论并用新例子解释')).toBe(true)
    expect(studentActionLeavesEvidence('求出第三边范围并标注单位')).toBe(true)
  })

  it('preserves the useful operation and appends a scene-specific response', () => {
    expect(ensureStudentActionEvidence('visual-observation', '沿路径观察三层结构。'))
      .toBe('沿路径观察三层结构，再说出一条观察结论和画面依据')
    expect(ensureStudentActionEvidence('contrast', '拖动滑块比较两种情况'))
      .toBe('拖动滑块比较两种情况，再记录一处差异和判断依据')
  })

  it('does not rewrite an action that already leaves evidence', () => {
    const action = '沿路径观察三层结构，并标出一处证据'
    expect(ensureStudentActionEvidence('visual-observation', action)).toBe(action)
  })

  it('is idempotent', () => {
    const once = ensureStudentActionEvidence('practice', '阅读题目并思考')
    expect(ensureStudentActionEvidence('practice', once)).toBe(once)
  })

  it('把只抄步骤的完整例题升级为关键步骤自我解释', () => {
    const action = ensureStudentActionEvidence('worked-example', '跟随步骤写出计算过程')

    expect(action).toContain('跟随步骤写出计算过程')
    expect(action).toContain('因为…所以…')
    expect(workedExampleActionHasSelfExplanation(action)).toBe(true)
  })

  it('保留已有依据解释的完整例题动作并保持幂等', () => {
    const action = '先补出关键一步并说明依据，核对后解释为什么这样做'

    expect(ensureWorkedExampleSelfExplanation(action)).toBe(action)
    expect(ensureStudentActionEvidence('worked-example', action)).toBe(action)
  })
})
