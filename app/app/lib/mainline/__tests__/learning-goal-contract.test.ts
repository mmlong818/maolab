import { describe, expect, it } from 'vitest'
import {
  learningGoalContractProblems,
  selectObservableObjective,
  successSignalFromObjective,
} from '../learning-goal-contract.js'

describe('learning goal contract', () => {
  it('拒绝无法直接观察的理解类目标', () => {
    expect(learningGoalContractProblems(
      '理解三角形面积公式的推导过程',
      '学生掌握三角形面积公式',
    )).toEqual(expect.arrayContaining([
      '目标句包含无法直接观察的“理解/掌握”类要求',
      '成功信号包含无法直接观察的“理解/掌握”类要求',
      '成功信号没有可观察、可检核的学生行为',
    ]))
  })

  it('优先选择认知要求更高且可检核的教材目标', () => {
    expect(selectObservableObjective([
      '理解两个三角形可以拼成平行四边形',
      '能指出三角形底和高的对应关系',
      '会用三角形面积公式解决实际问题',
    ])).toBe('会用三角形面积公式解决实际问题')
  })

  it('派生成功信号时保留同一学习行为', () => {
    const objective = '能画出三角形指定底边上的高'
    const successSignal = successSignalFromObjective(objective)
    expect(successSignal).toContain('学生能画出')
    expect(learningGoalContractProblems(objective, successSignal)).toEqual([])
  })

  it('成功信号遗漏目标动作时判定不一致', () => {
    expect(learningGoalContractProblems(
      '能解释海陆变迁证据并判断一个说法',
      '学生能判断一个说法并写出答案',
    )).toContain('成功信号没有覆盖目标句要求的全部学习行为')
  })

  it('识别低年级语文的认读、拼读、书写和诵读动作', () => {
    expect(selectObservableObjective(['能认识天安门城楼图片', '能跟读城楼上的两句标语']))
      .toBe('能跟读城楼上的两句标语')
    expect(selectObservableObjective(['认识田字格横中线', '在田字格中临写简单汉字']))
      .toBe('在田字格中临写简单汉字')
    expect(selectObservableObjective(['理解拼读方法', '能正确拼读 bā bá bǎ bà']))
      .toBe('能正确拼读 bā bá bǎ bà')
  })

  it('保留复合教材目标中的可观察子句', () => {
    expect(selectObservableObjective([
      '能正确认读并书写 jū、qū、xū 等音节，知道实际读音仍为 ü',
    ])).toBe('能正确认读并书写 jū、qū、xū 等音节')
    expect(selectObservableObjective([
      '理解亲社会行为的含义',
      '能列举亲社会行为的具体表现',
    ])).toBe('能列举亲社会行为的具体表现')
  })

  it('不把题目中的动作名词当成学生已经执行的行为', () => {
    expect(selectObservableObjective(['理解书写规则', '知道拼读方法', '培养阅读兴趣']))
      .toBeUndefined()
  })
})
