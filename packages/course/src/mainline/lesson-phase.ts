import { lessonPhaseOf, type LessonPhase } from './domain.js'

export interface LessonOpeningCopy {
  learningPath: string
  openingQuestion: string
  boardText: string[]
  teacherScript: string
  studentAction: string
  evidenceLabel: string
}

export type OpeningConfidence = 'low' | 'medium' | 'high'
export type OpeningResponseMode = 'typed' | 'paper-or-oral'

export interface LessonOpeningAttemptContract {
  phase: LessonPhase
  captureLabel: string
  capturedLabel: string
  captureTitle: string
  capturePrompt: string
  capturePlaceholder: string
  reviewLabel: string
  reviewTitle: string
  reviewPrompt: string
}

export interface LessonOpeningAttempt {
  responseMode: OpeningResponseMode
  response?: string
  confidence: OpeningConfidence
  revision?: string
  paperReviewComplete?: true
}

export const OPENING_ATTEMPT_MAX_LENGTH = 600

const REVISION_DECISION_PATTERN = /(?:保留|支持|正确|修正|订正|改为|补充|不对|错误|风险|失分|以后|下次|检查|核查|原来|最初|需要|应该|应当|不再)/
const REVISION_EVIDENCE_PATTERN = /(?:依据|证据|因为|所以|根据|说明|表明|条件|步骤|边界|定义|规则|图像?|表格?|实验|例子|结果|理由)/

interface LessonOpeningInput {
  phase?: LessonPhase
  topic: string
  kpTitles: readonly string[]
  continuity?: string
}

/**
 * 学习时期不仅改变版式密度，也改变第一项学习动作。
 * 新授先暴露预测，复习先闭卷提取，考前先限时诊断；三者不能共用同一段开场。
 */
export function lessonOpeningCopy(input: LessonOpeningInput): LessonOpeningCopy {
  const phase = lessonPhaseOf(input.phase ? { lessonPhase: input.phase } : {})
  const topic = input.topic.trim() || '本课主题'
  const kpTitles = input.kpTitles.map(item => item.trim()).filter(Boolean)
  const kpText = kpTitles.join('、') || topic
  const continuity = input.continuity?.trim() || `这节课围绕 ${topic} 展开。`

  if (phase === 'review') {
    return {
      learningPath: '闭卷提取 → 对照纠错 → 变式再答',
      openingQuestion: `不看资料，你现在能写出 ${kpText} 的哪些关键内容？`,
      boardText: ['先闭卷提取', '再对照纠错', '最后变式再答'],
      teacherScript: `${continuity}这是复习课，先把资料合上，不要等屏幕给答案。请写出你记得的关键内容和依据，并给不确定的地方做标记。后面的页面用于核对、纠错和变式再答，不是把新课重新听一遍。`,
      studentAction: '不看资料，写出记得的关键内容和依据，并标记不确定处',
      evidenceLabel: '我的闭卷提取与信心标记',
    }
  }

  if (phase === 'exam-prep') {
    return {
      learningPath: '限时诊断 → 错因归类 → 边界核查',
      openingQuestion: `限时回忆 ${kpText}：你最容易在哪个条件或步骤上失分？`,
      boardText: ['先限时作答', '再归类错因', '最后核查边界'],
      teacherScript: `${continuity}这是考前诊断，不从头重讲。请先限时写出关键结论、条件或步骤，再圈出最没把握的一处。后面的页面只处理高频错因和适用边界，帮助你把会做但容易丢分的地方查出来。`,
      studentAction: '限时写出关键结论、条件或步骤，圈出最没把握的一处',
      evidenceLabel: '我的限时答案与失分风险',
    }
  }

  return {
    learningPath: kpTitles.join(' → ') || '提出问题 → 寻找证据 → 修正解释',
    openingQuestion: `关于 ${topic}，你现在最想先弄清哪个问题？`,
    boardText: ['先写下一个预测', '带着问题寻找证据', '最后检查想法变化'],
    teacherScript: `${continuity}先别急着记结论，请从屏幕上的学习目录里选一个最想弄清楚的点，写下你的预测和理由。后面的页面会逐步提供证据；学完后再回看最初的想法，判断哪些保留、哪些需要修正。`,
    studentAction: '选一个问题，写下预测和一条理由',
    evidenceLabel: '我的预测与理由',
  }
}

/**
 * 开场文案只有在课堂真的先留下作答后，才能算预测、提取或诊断。
 * 这份契约同时驱动控制条和收束回看，避免三个学习时期只换提示语。
 */
export function lessonOpeningAttemptContract(phase?: LessonPhase): LessonOpeningAttemptContract {
  const activePhase = phase ?? 'new'

  if (activePhase === 'review') {
    return {
      phase: activePhase,
      captureLabel: '记录闭卷提取',
      capturedLabel: '已记录闭卷提取',
      captureTitle: '先留下闭卷提取',
      capturePrompt: '不看资料，写下你现在能提取出的关键内容、依据和最不确定的一处。保存后才能进入核对页面。',
      capturePlaceholder: '我记得……；依据是……；最不确定的是……',
      reviewLabel: '回看闭卷提取',
      reviewTitle: '对照证据修正闭卷提取',
      reviewPrompt: '对照整节课的证据，写清哪些原答案可以保留、哪一处需要修正，以及修正依据。',
    }
  }

  if (activePhase === 'exam-prep') {
    return {
      phase: activePhase,
      captureLabel: '记录限时诊断',
      capturedLabel: '已记录限时诊断',
      captureTitle: '先留下限时诊断',
      capturePrompt: '在教师设定的时间内写下答案，并圈出最可能失分的条件或步骤。保存后才能进入错因核查。',
      capturePlaceholder: '我的答案是……；最可能失分的是……',
      reviewLabel: '回看限时诊断',
      reviewTitle: '核查失分风险',
      reviewPrompt: '对照本课边界和条件，写清最初答案中的风险是否命中，以及以后怎样检查。',
    }
  }

  return {
    phase: activePhase,
    captureLabel: '记录预测',
    capturedLabel: '已记录预测',
    captureTitle: '先留下预测和理由',
    capturePrompt: '从学习目录中选一个问题，写下预测和一条理由。保存后才能进入证据页面。',
    capturePlaceholder: '我预测……，因为……',
    reviewLabel: '回看开场预测',
    reviewTitle: '用证据修正开场预测',
    reviewPrompt: '回看最初预测，写清哪些想法被证据支持、哪一处需要修正，以及依据是什么。',
  }
}

export function normalizeOpeningAttemptText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, OPENING_ATTEMPT_MAX_LENGTH)
}

/**
 * 投影课堂可以把答案留在学生纸面或口头表达中，但系统不能把“已完成”冒充成答案文本。
 * 两种记录方式都必须留下揭晓前把握度，文字模式还必须有真实原答。
 */
export function openingAttemptIsComplete(attempt?: LessonOpeningAttempt): boolean {
  if (!attempt?.confidence) return false
  if (attempt.responseMode === 'paper-or-oral') return true
  return Boolean(normalizeOpeningAttemptText(attempt.response ?? ''))
}

/**
 * 收束记录要同时回答“原想法怎样处理”和“凭什么这样处理”。这里只检查可观察
 * 的语义线索，不按长篇字数判定，避免把“知道了、继续努力”冒充成证据修正。
 */
export function openingAttemptRevisionIsComplete(revision: string): boolean {
  const normalized = normalizeOpeningAttemptText(revision)
  const semanticLength = normalized.replace(/[\s，,。；;：:！!？?、（）()【】\[\]「」『』“”"']/g, '').length
  if (semanticLength < 8) return false
  return REVISION_DECISION_PATTERN.test(normalized) && REVISION_EVIDENCE_PATTERN.test(normalized)
}

export function openingAttemptReviewIsComplete(attempt?: LessonOpeningAttempt): boolean {
  if (!openingAttemptIsComplete(attempt)) return false
  if (attempt?.responseMode === 'paper-or-oral') return attempt.paperReviewComplete === true
  return openingAttemptRevisionIsComplete(attempt?.revision ?? '')
}

export function openingAttemptStateKey(courseId: string, sceneId: string): string {
  return `${courseId}:${sceneId}`
}

/** 给内容模型的课级硬约束，防止“复习/考前”只换皮、不换学习动作。 */
export function lessonPhaseGenerationContract(phase?: LessonPhase): string {
  switch (phase ?? 'new') {
    case 'review':
      return '本课是复习课：遵循“先闭卷提取、后反馈纠错、再变式应用”。学生必须先作答，屏幕解释只能在提取之后作为反馈；不得把新授课原样重讲。每个练习应换情境或换表征，避免机械重复。'
    case 'exam-prep':
      return '本课是考前诊断：遵循“限时作答、错因归类、边界核查”。只处理高频失分点、适用条件和易混边界，不从头铺陈完整新授叙事，不用偏题怪题制造难度。'
    default:
      return '本课是新授课：遵循“先预测、后取证、再解释与迁移”。不要在学生表达已有想法前提前给出完整结论。'
  }
}
