import { describe, expect, it } from 'vitest'
import type { QualityIssue } from '@/lib/mainline'
import {
  qualityIssueCanNavigate,
  qualityPanelCanRefreshCast,
  qualityPanelCanRefreshKpGoals,
  qualityPanelCanRefreshMisconceptionClaims,
  qualityPanelCanRefreshRuntimeContracts,
  qualityPanelCanRefreshSourceGrounding,
  qualityPanelLearningActivityTargets,
  qualityPanelMisconceptionReviewTarget,
  qualityPanelProblemPracticeTargets,
  qualityPanelPreviewIssues,
} from '../QualityPanel.js'

const STALE_RUNTIME_CONTRACT_ISSUE_MESSAGE = '课堂交互描述承诺了当前页面未实现的能力。'

function issue(id: string, severity: QualityIssue['severity']): QualityIssue {
  return {
    id,
    gate: 'pedagogy',
    severity,
    targetType: 'scene',
    targetId: id,
    message: id,
    impact: 'impact',
    fix: 'fix',
    autoFixable: true,
  }
}

describe('QualityPanel issue priority', () => {
  it('无论阻断项排在输入的什么位置，都完整放到折叠线以上', () => {
    const issues = [
      ...Array.from({ length: 7 }, (_, index) => issue(`warning-${index}`, 'warning')),
      issue('blocking-a', 'blocking'),
      issue('blocking-b', 'blocking'),
    ]

    const result = qualityPanelPreviewIssues(issues)
    expect(result.preview.filter(item => item.severity === 'blocking').map(item => item.id))
      .toEqual(['blocking-a', 'blocking-b'])
    expect(result.preview).toHaveLength(7)
    expect(result.hiddenCount).toBe(2)
  })

  it('没有阻断项时保留五条摘要，其余提醒可展开', () => {
    const result = qualityPanelPreviewIssues(
      Array.from({ length: 8 }, (_, index) => issue(`warning-${index}`, index === 7 ? 'info' : 'warning')),
    )

    expect(result.preview).toHaveLength(5)
    expect(result.hiddenCount).toBe(3)
    expect(result.prioritized.at(-1)?.severity).toBe('info')
  })

  it('只有角色与声线阻断出现时才提供课程角色刷新入口', () => {
    const castBlocking = { ...issue('cast-blocking', 'blocking'), gate: 'cast-voice-grade' as const }
    const castWarning = { ...issue('cast-warning', 'warning'), gate: 'cast-voice-grade' as const }

    expect(qualityPanelCanRefreshCast([castBlocking])).toBe(true)
    expect(qualityPanelCanRefreshCast([castWarning, issue('pedagogy-blocking', 'blocking')])).toBe(false)
  })

  it('只有命中过时课堂交互警告时才提供同步入口', () => {
    const staleRuntime = {
      ...issue('stale-runtime', 'warning'),
      gate: 'technique' as const,
      message: STALE_RUNTIME_CONTRACT_ISSUE_MESSAGE,
    }
    const otherTechnique = { ...staleRuntime, id: 'other-technique', message: '其他技术提醒' }

    expect(qualityPanelCanRefreshRuntimeContracts([staleRuntime])).toBe(true)
    expect(qualityPanelCanRefreshRuntimeContracts([otherTechnique])).toBe(false)
  })

  it('只有课程级教材占位或无定位提醒才提供来源刷新入口', () => {
    const sourceLocation = {
      ...issue('source-location', 'warning'),
      targetType: 'course' as const,
      message: '课程来源只有知识点名称，缺少可核查定位。',
    }
    const sourcePlaceholder = {
      ...sourceLocation,
      id: 'source-placeholder',
      message: '课程把待补内容写进了来源摘录:待 LLM 填充教材原文。',
    }

    expect(qualityPanelCanRefreshSourceGrounding([sourceLocation])).toBe(true)
    expect(qualityPanelCanRefreshSourceGrounding([sourcePlaceholder])).toBe(true)
    expect(qualityPanelCanRefreshSourceGrounding([issue('other-pedagogy', 'warning')])).toBe(false)
    expect(qualityPanelCanRefreshSourceGrounding([{ ...sourceLocation, targetType: 'scene' }])).toBe(false)
  })

  it('只有课程级逐知识点目标追溯提醒才提供目标重建入口', () => {
    const legacyGoalTrace = {
      ...issue('legacy-goal-trace', 'warning'),
      targetType: 'course' as const,
      message: '多知识点课程的学习目标没有按知识点建立可追溯映射。',
    }

    expect(qualityPanelCanRefreshKpGoals([legacyGoalTrace])).toBe(true)
    expect(qualityPanelCanRefreshKpGoals([{ ...legacyGoalTrace, severity: 'blocking' }])).toBe(false)
    expect(qualityPanelCanRefreshKpGoals([{ ...legacyGoalTrace, targetType: 'scene' }])).toBe(false)
  })

  it('区分可自动校准的 AI 找茬漂移与必须教师确认的无来源辨析页', () => {
    const drift = {
      ...issue('ai-drift', 'blocking'),
      message: 'AI 找茬幕第 1/2 处误区的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。',
    }
    const missing = {
      ...issue('contrast-missing', 'blocking'),
      targetId: 'scene-contrast',
      message: '辨析幕缺少误区溯源(misconceptionSource)。',
    }

    expect(qualityPanelCanRefreshMisconceptionClaims([drift])).toBe(true)
    expect(qualityPanelCanRefreshMisconceptionClaims([missing])).toBe(false)
    expect(qualityPanelMisconceptionReviewTarget([drift, missing])).toBe('scene-contrast')
  })

  it('按页面去重需要 AI 重写的阻断练习，不把普通提醒加入批处理', () => {
    const missingMaterial = {
      ...issue('practice-material', 'blocking'),
      targetId: 'practice-1',
      message: '练习题面引用了学生看不到的作答材料。',
    }
    const answerLeak = {
      ...issue('practice-leak', 'blocking'),
      targetId: 'practice-1',
      message: '练习题面提前泄露了反馈答案。',
    }
    const weakAlignment = {
      ...issue('practice-alignment', 'warning'),
      targetId: 'practice-2',
      message: '练习任务不能证明知识点成功信号。',
    }
    const missingPractice = {
      ...issue('practice-missing', 'blocking'),
      targetType: 'fragment' as const,
      targetId: 'fragment-kp-02',
      message: '知识点片段缺少可保存学习证据的独立练习。',
    }

    expect(qualityPanelProblemPracticeTargets([missingMaterial, answerLeak, weakAlignment, missingPractice]))
      .toEqual(['practice-1', 'fragment-kp-02'])
  })

  it('按页面去重四类可确定性深化的学习活动提醒', () => {
    const opening = {
      ...issue('opening', 'warning'),
      targetId: 'scene-opening',
      message: '开场没有形成“先预测、后取证”的学习顺序。',
    }
    const worked = {
      ...issue('worked', 'warning'),
      targetId: 'scene-worked',
      message: '完整例题只要求跟随或抄写步骤，没有要求学生解释关键步骤。',
    }
    const reviewOpening = {
      ...issue('review-opening', 'warning'),
      targetId: 'scene-review-opening',
      message: '复习课开场没有形成“先提取、后纠错”的顺序。',
    }
    const examOpening = {
      ...issue('exam-opening', 'warning'),
      targetId: 'scene-exam-opening',
      message: '考前课开场没有形成“先诊断、后核查”的顺序。',
    }
    const duplicate = {
      ...issue('duplicate', 'warning'),
      targetId: 'scene-worked',
      message: '学生动作只有观看或操作，没有留下可检查的回答。',
    }
    const unrelated = { ...issue('unrelated', 'warning'), message: '其他提醒' }

    expect(qualityPanelLearningActivityTargets([opening, reviewOpening, examOpening, worked, duplicate, unrelated]))
      .toEqual(['scene-opening', 'scene-review-opening', 'scene-exam-opening', 'scene-worked'])
  })

  it('只有页面级问题可以从质量面板直接定位', () => {
    const sceneIssue = issue('scene-issue', 'warning')
    const courseIssue = { ...sceneIssue, targetType: 'course' as const }

    expect(qualityIssueCanNavigate(sceneIssue)).toBe(true)
    expect(qualityIssueCanNavigate(courseIssue)).toBe(false)
  })
})
