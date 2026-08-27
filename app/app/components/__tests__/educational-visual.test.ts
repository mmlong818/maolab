import { describe, expect, it } from 'vitest'

import { buildExperimentVisualSpec, buildWorkedExampleVisualSpec, inferVisualSpecFromText } from '../EducationalVisual.js'

describe('educational visual spec', () => {
  it('builds a stable worked-example board spec', () => {
    const spec = buildWorkedExampleVisualSpec({
      problem: '小明买一支笔花了3元，又买一本本子花了5元，一共花了多少元？',
      steps: [
        { stepNum: 2, action: '计算 3 + 5 = 8', explanation: '把两次花的钱合起来。' },
        { stepNum: 1, action: '圈出3元和5元', explanation: '这是题目给出的两个条件。' },
      ],
      conclusion: '一共花了8元。',
    })

    expect(spec.kind).toBe('worked-example-board')
    expect(spec.goal).toContain('一共')
    expect(spec.steps.map(step => step.stepNum)).toEqual([1, 2])
    expect(spec.check).toContain('8元')
  })

  it('keeps Chinese text, numbers, and units in worked-example specs', () => {
    const spec = buildWorkedExampleVisualSpec({
      problem: '人步行的速度约为 1.1 m/s，3 秒大约走多远？',
      steps: [
        { stepNum: 1, action: '确认速度是 1.1 m/s，时间是 3 秒。' },
        { stepNum: 2, action: '用 1.1 × 3 得到大约 3.3 米。' },
      ],
      conclusion: '大约走 3.3 米。',
      focusStepNum: 2,
    })

    expect(spec.problem).toContain('1.1 m/s')
    expect(spec.steps[0]?.action).toContain('3 秒')
    expect(spec.check).toContain('3.3 米')
    expect(spec.focusStepNum).toBe(2)
  })

  it('builds an experiment board spec from observation text', () => {
    const spec = buildExperimentVisualSpec('观察对象：两杯水中的方糖；操作条件：一杯热水，一杯冷水；可见现象：热水杯里的方糖更快变小；结论：水温会影响溶解快慢。')

    expect(spec.kind).toBe('experiment-board')
    expect(spec.objects.join('')).toContain('方糖')
    expect(spec.conditions.join('')).toContain('热水')
    expect(spec.observations.join('')).toContain('更快')
    expect(spec.conclusion).toContain('水温')
  })

  it('infers visual specs for worked examples and experiments', () => {
    expect(inferVisualSpecFromText('例题：小明买笔花了3元，买本子花了5元，一共花了多少元？步骤1：圈出条件。答案：8元。')?.kind).toBe('worked-example-board')
    expect(inferVisualSpecFromText('实验：方糖分别放入热水和冷水，观察到热水中的方糖更快消失。')?.kind).toBe('experiment-board')
  })
})
