import { describe, expect, it } from 'vitest'
import {
  lessonOpeningAttemptContract,
  lessonOpeningCopy,
  lessonPhaseGenerationContract,
  normalizeOpeningAttemptText,
  openingAttemptIsComplete,
  openingAttemptRevisionIsComplete,
  openingAttemptReviewIsComplete,
  openingAttemptStateKey,
} from '../lesson-phase.js'

describe('学习时期教学契约', () => {
  const base = { topic: '二力平衡', kpTitles: ['平衡条件', '受力分析'] }

  it('新授、复习和考前使用不同的首个学习动作', () => {
    const fresh = lessonOpeningCopy({ ...base, phase: 'new' })
    const review = lessonOpeningCopy({ ...base, phase: 'review' })
    const exam = lessonOpeningCopy({ ...base, phase: 'exam-prep' })

    expect(fresh.studentAction).toContain('预测')
    expect(review.studentAction).toContain('不看资料')
    expect(review.learningPath).toBe('闭卷提取 → 对照纠错 → 变式再答')
    expect(exam.studentAction).toContain('限时')
    expect(exam.learningPath).toBe('限时诊断 → 错因归类 → 边界核查')
  })

  it('复习生成契约明确先提取，不允许把新授课换皮重讲', () => {
    const contract = lessonPhaseGenerationContract('review')
    expect(contract).toContain('先闭卷提取')
    expect(contract).toContain('不得把新授课原样重讲')
    expect(contract).toContain('换情境或换表征')
  })

  it.each([
    ['new', '记录预测', '用证据修正开场预测'],
    ['review', '记录闭卷提取', '对照证据修正闭卷提取'],
    ['exam-prep', '记录限时诊断', '核查失分风险'],
  ] as const)('%s 开场把揭晓前作答和收束修正连成同一契约', (phase, captureLabel, reviewTitle) => {
    const contract = lessonOpeningAttemptContract(phase)

    expect(contract.captureLabel).toBe(captureLabel)
    expect(contract.capturePrompt).toContain('保存后才能进入')
    expect(contract.reviewTitle).toBe(reviewTitle)
    expect(contract.reviewPrompt).toMatch(/保留|修正|风险/)
  })

  it('开场作答键按课程隔离，文本在保存前稳定归一', () => {
    expect(openingAttemptStateKey('course-a', 'intro')).not.toBe(openingAttemptStateKey('course-b', 'intro'))
    expect(normalizeOpeningAttemptText('  我预测\n\n结果会变化  ')).toBe('我预测 结果会变化')
  })

  it('文字作答必须有原答，纸面或口头作答不伪造答案文本', () => {
    expect(openingAttemptIsComplete({ responseMode: 'typed', response: '  ', confidence: 'medium' })).toBe(false)
    expect(openingAttemptIsComplete({ responseMode: 'typed', response: '我预测会平衡', confidence: 'medium' })).toBe(true)
    expect(openingAttemptIsComplete({ responseMode: 'paper-or-oral', confidence: 'low' })).toBe(true)
  })

  it('收束回看按原作答方式验证，不把完成确认冒充文字修正', () => {
    expect(openingAttemptReviewIsComplete({
      responseMode: 'typed',
      response: '原答案',
      confidence: 'high',
      revision: '  ',
    })).toBe(false)
    expect(openingAttemptReviewIsComplete({
      responseMode: 'typed',
      response: '原答案',
      confidence: 'high',
      revision: '知道了',
    })).toBe(false)
    expect(openingAttemptReviewIsComplete({
      responseMode: 'typed',
      response: '原答案',
      confidence: 'high',
      revision: '保留条件，修正方向，依据受力图',
    })).toBe(true)
    expect(openingAttemptReviewIsComplete({
      responseMode: 'paper-or-oral',
      confidence: 'medium',
      paperReviewComplete: true,
    })).toBe(true)
  })

  it('文字收束必须同时形成修正判断和证据依据，不用字数冒充深加工', () => {
    expect(openingAttemptRevisionIsComplete('内容很多内容很多内容很多')).toBe(false)
    expect(openingAttemptRevisionIsComplete('我知道了，继续努力')).toBe(false)
    expect(openingAttemptRevisionIsComplete('原来不对，因为参照物不同')).toBe(true)
    expect(openingAttemptRevisionIsComplete('保留速度，依据图像斜率')).toBe(true)
    expect(openingAttemptRevisionIsComplete('以后先检查条件，再根据定义判断')).toBe(true)
  })
})
