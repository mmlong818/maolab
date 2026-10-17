import { describe, expect, it } from 'vitest'
import {
  practiceAnswerLeakReasons,
  practiceFeedbackQualityReasons,
  practiceTaskLeaksFeedback,
  practiceTaskMaterialReasons,
} from '../practice-feedback.js'

describe('practice feedback separation', () => {
  it('识别题面在作答要求后直接附上完整受力分析答案', () => {
    const task = '质量 4kg 的球用绳悬挂静止，画出重力 G 与拉力 T 的示意图。重力 G=mg=39.2N 竖直向下，拉力 T=39.2N 竖直向上。'
    const feedback = '重力 G=mg=39.2N，方向竖直向下；拉力 T=39.2N，方向竖直向上。'

    expect(practiceTaskLeaksFeedback(task, feedback)).toBe(true)
    expect(practiceAnswerLeakReasons(task, feedback).length).toBeGreaterThan(0)
  })

  it('允许题面给出必要已知量，答案只在反馈中出现', () => {
    const task = '质量为 4kg 的球用绳悬挂静止，取 g=9.8N/kg。画出受力图并分别求出重力与拉力的大小。'
    const feedback = '重力 G=mg=39.2N，方向竖直向下；静止时拉力 T=39.2N，方向竖直向上。'

    expect(practiceTaskLeaksFeedback(task, feedback)).toBe(false)
  })

  it('允许选择题题面和反馈重复选项材料，但不允许题面声明正确答案', () => {
    const feedback = '正确答案为 B，因为温度不变时压强与体积成反比。'
    expect(practiceTaskLeaksFeedback(
      '判断哪项正确：A. 压强与体积成正比；B. 压强与体积成反比。',
      feedback,
    )).toBe(false)
    expect(practiceTaskLeaksFeedback(
      '判断哪项正确。正确答案为 B，温度不变时压强与体积成反比。',
      feedback,
    )).toBe(true)
  })

  it('不把题设中的公式定义误判为已经完成的推导', () => {
    expect(practiceTaskLeaksFeedback(
      '已知速度公式 v=s/t，一辆车 2 小时行驶 120 千米，求平均速度。',
      '代入公式可得 v=120/2=60km/h。',
    )).toBe(false)
  })

  it('识别首次作答画面中缺失的候选、语段和填空材料', () => {
    expect(practiceTaskMaterialReasons('判断屏幕上三条热化学方程式各有一处错误。')).not.toEqual([])
    expect(practiceTaskMaterialReasons('判断四条候选光路哪条正确。')).not.toEqual([])
    expect(practiceTaskMaterialReasons('给定一则打乱段序的消息语段，请重新排列。')).not.toEqual([])
    expect(practiceTaskMaterialReasons('从五个词中选词填入句子空缺。')).not.toEqual([])
  })

  it('允许 task 直接列出学生实际要判断的材料', () => {
    expect(practiceTaskMaterialReasons(
      '判断哪项正确：\nA. 温度不变时压强与体积成正比；\nB. 温度不变时压强与体积成反比。',
    )).toEqual([])
    expect(practiceTaskMaterialReasons('补全句子：This track is _____, not soothing.')).toEqual([])
  })

  it('反馈同时给出判定依据和答错后的修正动作', () => {
    expect(practiceFeedbackQualityReasons('做得很好，请核对答案。')).toContain('feedback 没有给出可核对的答案、判别依据、步骤或完成标准')
    expect(practiceFeedbackQualityReasons('正确答案为 B，因为温度不变时压强与体积成反比。')).toContain('feedback 没有指出常见错误或答错后的具体修正动作')
    expect(practiceFeedbackQualityReasons('正确答案为 B，因为温度不变时压强与体积成反比；若选 A，回到“温度不变”条件重新比较。')).toEqual([])
    expect(practiceFeedbackQualityReasons('常见错：0 刻度没对准起点，或画到 3 厘米后漏标端点 D。')).toEqual([])
  })
})
