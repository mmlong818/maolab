import { describe, it, expect } from 'vitest'
import {
  isWeakMastery,
  MASTERY_DEFAULT,
  MASTERY_WEAK_THRESHOLD,
  normalizePracticeEvidenceText,
  PRACTICE_EVIDENCE_MAX_LENGTH,
  practiceCalibration,
  practiceFollowUp,
  practiceObjectiveCriteria,
  practiceReflectionQualityReason,
  reviewIntervalDays,
  reviewScheduleFor,
  updatedMasteryScore,
} from '../mastery.js'

describe('mastery 规则型步进', () => {
  it('优先使用知识点目标，并明确标注精确对齐', () => {
    expect(practiceObjectiveCriteria([
      { id: 'goal-total', successSignal: '完成全课目标。' },
      { id: 'goal-kp-1', kpId: 'kp-1', successSignal: '能解释本题依据。' },
    ], 'kp-1')).toEqual([{
      objectiveId: 'goal-kp-1',
      successSignal: '能解释本题依据。',
      alignment: 'kp-specific',
    }])
  })

  it('唯一旧课总目标可显式降级，多目标歧义时拒绝归属', () => {
    expect(practiceObjectiveCriteria([
      { id: 'goal-total', successSignal: '完成全课目标。' },
    ], 'kp-1')).toEqual([{
      objectiveId: 'goal-total',
      successSignal: '完成全课目标。',
      alignment: 'course-level-legacy',
    }])
    expect(practiceObjectiveCriteria([
      { id: 'goal-a', successSignal: '标准甲。' },
      { id: 'goal-b', successSignal: '标准乙。' },
    ], 'kp-1')).toEqual([])
  })

  it('只接受可追溯且长度受控的原答与订正文', () => {
    expect(normalizePracticeEvidenceText('  甲车相对乙车的位置发生变化。\n所以乙车运动。  '))
      .toBe('甲车相对乙车的位置发生变化。\n所以乙车运动。')
    expect(normalizePracticeEvidenceText('   ')).toBeNull()
    expect(normalizePracticeEvidenceText(null)).toBeNull()
    expect(normalizePracticeEvidenceText('答'.repeat(PRACTICE_EVIDENCE_MAX_LENGTH + 1))).toBeNull()
  })

  it('拒绝把占位式订正当作可定位的学习证据', () => {
    expect(practiceReflectionQualityReason('incorrect', '已订正。')).toContain('请指出原答从哪里开始偏离')
    expect(practiceReflectionQualityReason('incorrect', '我把速度相同当成同向；应比较相对位置是否变化。')).toBeNull()
    expect(practiceReflectionQualityReason('correct', '关键依据。')).toContain('具体规则')
    expect(practiceReflectionQualityReason('correct', '关键依据是相对位置随时间变化。')).toBeNull()
  })

  it('按学生自己的依据、成功标准和校准状态生成下一步', () => {
    const criteria = [{
      objectiveId: 'goal-1',
      successSignal: '能根据相对位置是否随时间变化判断机械运动。',
      alignment: 'kp-specific' as const,
    }]
    const miss = practiceFollowUp(
      'incorrect',
      'high',
      '我把同向行驶误当成相对静止；应比较相对位置是否变化。',
      criteria,
    )
    expect(miss).toMatchObject({
      label: '针对这处偏差再练',
      basis: 'student-reflection-and-success-criterion',
    })
    expect(miss.message).toContain('我把同向行驶误当成相对静止')
    expect(miss.message).toContain('需要被替换的原规则')
    expect(miss.message).toContain(criteria[0]!.successSignal)

    const success = practiceFollowUp('correct', 'low', '关键依据是相对位置随时间变化。', criteria)
    expect(success.label).toBe('把这条依据迁移出去')
    expect(success.message).toContain('同结构近似题')
  })

  it('无记录起步中性,答对上行、答错下行', () => {
    const up = updatedMasteryScore(undefined, 'correct')
    const down = updatedMasteryScore(undefined, 'incorrect')
    expect(up).toBeGreaterThan(MASTERY_DEFAULT)
    expect(down).toBeLessThan(MASTERY_DEFAULT)
  })

  it('边界收敛:不破 1 上限与 0.05 下限', () => {
    expect(updatedMasteryScore(0.95, 'correct')).toBe(1)
    expect(updatedMasteryScore(0.1, 'incorrect')).toBe(0.05)
  })

  it('一次答错即入薄弱区(0.5-0.18 < 0.6),连续答对可回稳', () => {
    const afterMiss = updatedMasteryScore(undefined, 'incorrect')
    expect(isWeakMastery(afterMiss)).toBe(true)
    let score = afterMiss
    for (let i = 0; i < 3; i++) score = updatedMasteryScore(score, 'correct')
    expect(score).toBeGreaterThanOrEqual(MASTERY_WEAK_THRESHOLD)
    expect(isWeakMastery(score)).toBe(false)
  })

  it('揭晓前把握度区分碰巧答对与稳定掌握', () => {
    expect(updatedMasteryScore(0.5, 'correct', 'low')).toBe(0.6)
    expect(updatedMasteryScore(0.5, 'correct', 'high')).toBe(0.68)
    expect(practiceCalibration('correct', 'low')).toMatchObject({
      kind: 'underconfident',
      label: '答对但低估自己',
    })
  })

  it('高把握误答比已觉察的不确定更值得优先修正', () => {
    const overconfident = practiceCalibration('incorrect', 'high')
    const awareGap = practiceCalibration('incorrect', 'low')

    expect(overconfident.kind).toBe('overconfident')
    expect(overconfident.delta).toBeLessThan(awareGap.delta)
    expect(updatedMasteryScore(0.5, 'incorrect', 'high')).toBe(0.26)
    expect(updatedMasteryScore(0.5, 'incorrect', 'low')).toBe(0.4)
  })
})

describe('到期复习调度', () => {
  const day = 24 * 60 * 60 * 1000
  const reviewedAt = Date.UTC(2026, 7, 20)

  it('掌握越弱，下一次提取越早', () => {
    expect(reviewIntervalDays(0.2)).toBe(1)
    expect(reviewIntervalDays(0.5)).toBe(3)
    expect(reviewIntervalDays(0.7)).toBe(7)
    expect(reviewIntervalDays(0.9)).toBe(14)
  })

  it('刚复习完不会立刻重复，到期后才进入复习课', () => {
    const fresh = reviewScheduleFor(0.2, reviewedAt, reviewedAt + 2 * 60 * 60 * 1000)
    expect(fresh.due).toBe(false)
    expect(fresh.daysUntilDue).toBe(1)

    const due = reviewScheduleFor(0.2, reviewedAt, reviewedAt + day)
    expect(due.due).toBe(true)
    expect(due.daysUntilDue).toBe(0)
    expect(due.dueAt).toBe(reviewedAt + day)
  })

  it('较稳定但仍薄弱的知识点留出三天间隔', () => {
    const schedule = reviewScheduleFor(0.5, reviewedAt, reviewedAt + 2 * day)
    expect(schedule.intervalDays).toBe(3)
    expect(schedule.due).toBe(false)
    expect(schedule.daysUntilDue).toBe(1)
  })
})
