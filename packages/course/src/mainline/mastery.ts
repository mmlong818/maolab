/**
 * mastery · v4 M3 学情闭环纯逻辑(docs/v4-master-plan-2026-07-13.md §3.3)
 *
 * 最小环:practice 幕自评作答 → KP 掌握度更新 → 课程库复习建议 →
 * 下一课薄弱 KP 骨架加固(幕数加权)。
 *
 * 明确不做(宪法):课中实时改课(节目单确定性)、统计模型(M3 只做规则型)。
 * 本文件纯函数;落库见 mastery-store.ts(server-only,复用 @maolab/db
 * concept_mastery 表,conceptId = kpId)。
 */

export type PracticeOutcome = 'correct' | 'incorrect'
export type PracticeConfidence = 'low' | 'medium' | 'high'
export type CalibrationKind = 'calibrated' | 'underconfident' | 'overconfident' | 'aware-gap'

/**
 * 当前课堂由学生在看过反馈后自行核对，尚未经过教师或自动评分器验证。
 * 固定记录证据来源，避免后续分析把自评误当成客观判分。
 */
export const PRACTICE_SELF_ASSESSMENT_BASIS = 'self-assessed-after-feedback' as const
export type PracticeEvidenceBasis = typeof PRACTICE_SELF_ASSESSMENT_BASIS

export type PracticeCriterionAlignment = 'kp-specific' | 'course-level-legacy'

export interface PracticeObjectiveCriterion {
  objectiveId: string
  successSignal: string
  alignment: PracticeCriterionAlignment
}

/**
 * 与当前掌握度事件精确对应的练习证据。只有完整、可验证的数据才会进入这个结构；
 * 旧记录或畸形 JSON 仍可保留分数来源等级，但不会把不可信字段展示给教师。
 */
export interface PracticeEvidenceSnapshot {
  submittedAt: number
  outcome: PracticeOutcome
  confidence: PracticeConfidence
  calibration: CalibrationKind
  evidenceBasis: PracticeEvidenceBasis
  scoreStatus: 'provisional' | 'verified'
  practiceSnapshot: {
    task: string
    feedback: string
  }
  objectiveCriteria: PracticeObjectiveCriterion[]
  attemptText: string
  reflectionText: string
}

/** 掌握度证据的可信边界。所有下游必须显式消费，不能只拿一个裸分数。 */
export type MasteryEvidenceStatus =
  | 'verified'
  | 'provisional-self-assessment'
  | 'seeded-demo'
  | 'legacy-unattributed'

export interface MasteryRecord {
  kpId: string
  score: number
  lastReviewedAt: number
  evidenceStatus: MasteryEvidenceStatus
  /** 当前分数对应的完整练习证据；旧记录、种子和不完整记录缺省。 */
  latestEvidence?: PracticeEvidenceSnapshot
}

/**
 * 已验证结果和学生主动暴露的薄弱自评都可用于低风险加练；演示种子与来源不明的
 * 历史分数只能展示来源，不得自动改变正式课程结构。
 */
export function masteryCanGuideLowRiskAdaptation(status: MasteryEvidenceStatus): boolean {
  return status === 'verified' || status === 'provisional-self-assessment'
}

/**
 * 练习优先绑定当前知识点目标。历史课程只有一个未标 kpId 的总目标时允许显式
 * 降级，且把降级关系写入证据快照；多个旧总目标无法确定归属，宁可拒绝记录。
 */
export function practiceObjectiveCriteria(
  goals: ReadonlyArray<{ id: string; kpId?: string | undefined; successSignal: string }>,
  kpId: string,
): PracticeObjectiveCriterion[] {
  const normalizedKpId = kpId.trim()
  if (!normalizedKpId) return []

  const specific = goals.filter(goal => (
    goal.kpId?.trim() === normalizedKpId
    && Boolean(goal.id.trim())
    && Boolean(goal.successSignal.trim())
  ))
  if (specific.length > 0) {
    return specific.map(goal => ({
      objectiveId: goal.id.trim(),
      successSignal: goal.successSignal.trim(),
      alignment: 'kp-specific',
    }))
  }

  const legacy = goals.filter(goal => (
    !goal.kpId?.trim()
    && Boolean(goal.id.trim())
    && Boolean(goal.successSignal.trim())
  ))
  if (legacy.length !== 1) return []
  return [{
    objectiveId: legacy[0]!.id.trim(),
    successSignal: legacy[0]!.successSignal.trim(),
    alignment: 'course-level-legacy',
  }]
}

/** 单次原答或订正的上限。足够容纳简答推理，又避免把任意长文本塞进学情记录。 */
export const PRACTICE_EVIDENCE_MAX_LENGTH = 600

/**
 * 学情只能建立在真实文字证据上。保留换行和公式，仅去掉首尾空白；空白、非文本
 * 或超长内容都不算有效证据，不能据此更新掌握度。
 */
export function normalizePracticeEvidenceText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > PRACTICE_EVIDENCE_MAX_LENGTH) return null
  return normalized
}

export interface PracticeCalibration {
  kind: CalibrationKind
  delta: number
  label: string
  message: string
}

export const PRACTICE_FOLLOW_UP_BASIS = 'student-reflection-and-success-criterion' as const

export interface PracticeFollowUp {
  label: string
  message: string
  basis: typeof PRACTICE_FOLLOW_UP_BASIS
}

const LOW_INFORMATION_REFLECTION_PATTERN = /^(?:不知道|不会|不清楚|没看懂|已订正|订正答案|见反馈|同上|错了|答案错了|关键依据)$/

function compactEvidenceExcerpt(text: string, maxLength: number): string {
  const compact = text.replace(/\s+/g, ' ').trim()
  return compact.length <= maxLength ? compact : `${compact.slice(0, maxLength - 1)}…`
}

/**
 * “已订正”“见反馈”一类文字不能证明学生定位了依据或偏差。这里只拒绝明确的
 * 低信息占位回答，不用字数阈值误伤简短但有效的数学、符号或术语订正。
 */
export function practiceReflectionQualityReason(
  outcome: PracticeOutcome,
  reflectionText: string,
): string | null {
  const reflection = normalizePracticeEvidenceText(reflectionText)
  if (!reflection) return '请先写下可核对的关键依据或订正。'
  const compact = reflection.replace(/[\s，,。；;：:！!？?、（）()【】\[\]「」『』“”"'`]/g, '')
  if (!LOW_INFORMATION_REFLECTION_PATTERN.test(compact)) return null
  return outcome === 'correct'
    ? '不能只写“关键依据”：请写出让答案成立的具体规则、证据或关键步骤。'
    : '不能只写“已订正”或“不会”：请指出原答从哪里开始偏离，并写出改正后的答案、规则或关键步骤。'
}

/**
 * 在统一答案说明之上生成真正跟随本次学习证据的后续行动。它不冒充自动判分：
 * 只引用学生自己写下的依据或错因、服务端确认的成功标准，以及揭晓前把握度。
 */
export function practiceFollowUp(
  outcome: PracticeOutcome,
  confidence: PracticeConfidence,
  reflectionText: string,
  objectiveCriteria: readonly PracticeObjectiveCriterion[],
): PracticeFollowUp {
  const reflection = normalizePracticeEvidenceText(reflectionText)
  if (!reflection || practiceReflectionQualityReason(outcome, reflection)) {
    throw new Error('practice follow-up requires specific reflection evidence')
  }
  const successSignals = [...new Set(objectiveCriteria
    .map(criterion => criterion.successSignal.trim())
    .filter(Boolean))]
  if (successSignals.length === 0) throw new Error('practice follow-up requires a success criterion')

  const evidence = compactEvidenceExcerpt(reflection, 52)
  const criterion = compactEvidenceExcerpt(successSignals.join('；'), 96)
  const action = outcome === 'correct'
    ? confidence === 'high'
      ? '遮住反馈，用这条依据解释一个新情境；条件改变后仍能说明结论，才算真正迁移。'
      : confidence === 'low'
        ? '先遮住反馈重做一次，标出这条依据在哪一步起作用，再完成一道同结构近似题。'
        : '遮住反馈重述完整推理，再替换一个条件，检查结论是否仍成立。'
    : confidence === 'high'
      ? '先写下需要被替换的原规则，再遮住反馈重做原题；随后换一个数字、材料或情境再判断一次。'
      : confidence === 'low'
        ? '先用自己的话复述反馈中的正确规则，再从第一处偏离开始重做；隔几分钟完成一道近似题。'
        : '从第一处偏离开始重做原题，并逐项核对成功标准；完成后再做一道同结构变式。'

  return {
    label: outcome === 'correct' ? '把这条依据迁移出去' : '针对这处偏差再练',
    message: `${outcome === 'correct' ? '你确认的关键依据' : '你定位的偏差'}：“${evidence}”。${action} 自检标准：“${criterion}”`,
    basis: PRACTICE_FOLLOW_UP_BASIS,
  }
}

/** 无记录时的起始掌握度(中性,既不判弱也不判稳)。 */
export const MASTERY_DEFAULT = 0.5
/** 低于此值视为薄弱:进复习建议 + 下一课骨架加固。 */
export const MASTERY_WEAK_THRESHOLD = 0.6
/** 单次作答的步长:规则型,约 3 次连续正确从薄弱回到稳固。 */
const STEP = 0.18
const FLOOR = 0.05
const CEIL = 1

const DAY_MS = 24 * 60 * 60 * 1000

export interface ReviewSchedule {
  intervalDays: number
  dueAt: number
  due: boolean
  daysUntilDue: number
  overdueDays: number
}

/**
 * 把“是否答对”和揭晓答案前的把握度合并解释，避免把碰巧答对与稳定掌握等量处理。
 * 规则刻意保持离散、可复核；旧调用未传把握度时继续沿用原来的 ±0.18。
 */
export function practiceCalibration(
  outcome: PracticeOutcome,
  confidence: PracticeConfidence,
): PracticeCalibration {
  if (outcome === 'correct' && confidence === 'low') {
    return {
      kind: 'underconfident',
      delta: 0.1,
      label: '答对但低估自己',
      message: '你答对了，但揭晓前没把握。回看是哪条证据让答案成立，下次先信任这条判断线索。',
    }
  }
  if (outcome === 'incorrect' && confidence === 'high') {
    return {
      kind: 'overconfident',
      delta: -0.24,
      label: '高把握误答',
      message: '你原本很有把握但答案需要修正。优先找出支撑原判断的错误规则，再做一道变式。',
    }
  }
  if (outcome === 'incorrect' && confidence === 'low') {
    return {
      kind: 'aware-gap',
      delta: -0.1,
      label: '已觉察不确定',
      message: '你已经觉察到自己没把握。先用自己的话复述反馈，再用新例子检查一次。',
    }
  }
  if (outcome === 'incorrect') {
    return {
      kind: 'overconfident',
      delta: -0.18,
      label: '判断需要修正',
      message: '答案需要修正。对照反馈指出判断从哪一步开始偏离，并记录正确依据。',
    }
  }
  return {
    kind: 'calibrated',
    delta: confidence === 'high' ? 0.18 : 0.14,
    label: confidence === 'high' ? '准确且有把握' : '判断基本校准',
    message: confidence === 'high'
      ? '答案和把握度一致。请再说出一条关键依据，确认不是只记住结果。'
      : '答案正确。请指出最关键的判断依据，让这次成功可以迁移到新题。',
  }
}

export function updatedMasteryScore(
  prev: number | undefined,
  outcome: PracticeOutcome,
  confidence?: PracticeConfidence,
): number {
  const base = prev ?? MASTERY_DEFAULT
  const delta = confidence
    ? practiceCalibration(outcome, confidence).delta
    : outcome === 'correct' ? STEP : -STEP
  const next = base + delta
  return Math.min(CEIL, Math.max(FLOOR, Number(next.toFixed(4))))
}

export function isWeakMastery(score: number | undefined): boolean {
  return (score ?? MASTERY_DEFAULT) < MASTERY_WEAK_THRESHOLD
}

/**
 * 规则型间隔复习：越不稳，下一次提取越早；但不在刚作答后立即重复同一道内容。
 * 只使用现有 score + last_reviewed_at，不引入不可解释的黑箱估计。
 */
export function reviewIntervalDays(score: number): number {
  if (score < 0.35) return 1
  if (score < MASTERY_WEAK_THRESHOLD) return 3
  if (score < 0.8) return 7
  return 14
}

export function reviewScheduleFor(score: number, lastReviewedAt: number, now = Date.now()): ReviewSchedule {
  const intervalDays = reviewIntervalDays(score)
  const safeReviewedAt = Number.isFinite(lastReviewedAt) && lastReviewedAt > 0 ? lastReviewedAt : now
  const dueAt = safeReviewedAt + intervalDays * DAY_MS
  const remainingMs = dueAt - now
  return {
    intervalDays,
    dueAt,
    due: remainingMs <= 0,
    daysUntilDue: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
    overdueDays: Math.max(0, Math.floor(-remainingMs / DAY_MS)),
  }
}
