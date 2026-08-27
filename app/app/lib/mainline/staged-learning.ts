import type { LessonScene, SceneType } from './domain.js'
import { aiVerifyPairs } from './ai-verify.js'
import {
  ensureWorkedExampleSelfExplanation,
  workedExampleActionHasSelfExplanation,
  WORKED_EXAMPLE_SELF_EXPLANATION_CUE,
} from './learning-action.js'
import { STAGED_RUNTIME_CONTROLS } from './runtime-interaction.js'
import { workedExampleCompletionPrompt } from './worked-example-scaffold.js'
import { parseForceVectors, type ForceVector } from './presentation/content-forms.js'

export type StagedLearningSceneType = Extract<SceneType, 'worked-example' | 'practice' | 'contrast' | 'ai-verify'>

export type StagedAttemptMode = 'typed' | 'paper-or-oral'
export type StagedConfidence = 'low' | 'medium' | 'high'
export type StagedComparison = 'matched' | 'revised'

export interface StagedLearningAttempt {
  mode: StagedAttemptMode
  confidence: StagedConfidence
  responses?: readonly string[]
  paperOrOralComplete?: true
}

/** 揭晓后自我解释或订正的会话级记录；不会写入正式掌握度。 */
export interface StagedPostRevealRecord {
  mode: StagedAttemptMode
  comparison: StagedComparison
  responses?: readonly string[]
  paperOrOralComplete?: true
}

export interface StagedCalibrationFeedback {
  kind: 'calibrated' | 'underconfident' | 'overconfident' | 'aware-gap' | 'needs-revision'
  label: string
  message: string
}

/** 会话级作答不进入正式学情，但仍限制长度，避免课堂控件被异常长文本拖垮。 */
export const STAGED_ATTEMPT_MAX_LENGTH = 600

export interface StagedLearningConfig {
  sceneType: StagedLearningSceneType
  prompt: string
  promptItems: readonly string[]
  /** 完整例题的完成题支架；题面与待补步骤分开显示，但只收一份学生回答。 */
  completionPrompt?: string
  promptLabel: string
  attemptInstruction: string
  revealLabel: string
  revealedLabel: string
  recordsMastery: boolean
}

export interface StagedRevealAction {
  sceneType: StagedLearningSceneType
  label: string
  instruction: string
}

export interface StagedNavigationBlocker {
  sceneIndex: number
  sceneId: string
  phase: 'reveal' | 'post-reveal' | 'practice-evidence'
  actionLabel: string
}

export function normalizeStagedAttemptText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized || normalized.length > STAGED_ATTEMPT_MAX_LENGTH) return null
  return normalized
}

/**
 * 非正式测评页也必须留下真实的揭晓前动作。文字模式按题面逐条记录；投影课堂可
 * 确认学生已在纸面或口头完成，但系统不会据此虚构答案文本或更新掌握度。
 */
export function stagedAttemptIsComplete(
  config: Pick<StagedLearningConfig, 'promptItems'>,
  attempt: StagedLearningAttempt | undefined,
): boolean {
  return Boolean(attempt && isStagedConfidence(attempt.confidence)
    && stagedSessionEvidenceIsComplete(config.promptItems.length, attempt))
}

function stagedSessionEvidenceIsComplete(
  responseCount: number,
  evidence: Pick<StagedLearningAttempt | StagedPostRevealRecord, 'mode' | 'responses' | 'paperOrOralComplete'> | undefined,
): boolean {
  if (!evidence) return false
  if (evidence.mode === 'paper-or-oral') return evidence.paperOrOralComplete === true
  if (evidence.responses?.length !== responseCount) return false
  return evidence.responses.every(response => Boolean(normalizeStagedAttemptText(response)))
}

/**
 * 例题、辨析和 AI 找茬不写正式掌握度，但仍应把“猜对”“稳定判断”和
 * “高把握误解”分开。反馈只解释学生自报的把握度与核对结果，不冒充判分。
 */
export function stagedCalibrationFeedback(
  attempt: StagedLearningAttempt | undefined,
  record: StagedPostRevealRecord | undefined,
): StagedCalibrationFeedback | null {
  if (!attempt || !record || !isStagedConfidence(attempt.confidence) || !isStagedComparison(record.comparison)) {
    return null
  }
  if (record.comparison === 'revised') {
    if (attempt.confidence === 'high') {
      return {
        kind: 'overconfident',
        label: '高把握判断需要修正',
        message: '先找出原先确信的错误规则，再用正确条件重做一次，避免只记住本页答案。',
      }
    }
    if (attempt.confidence === 'low') {
      return {
        kind: 'aware-gap',
        label: '已觉察不确定',
        message: '从原答第一处偏离开始修正，再用自己的话复述正确依据。',
      }
    }
    return {
      kind: 'needs-revision',
      label: '判断需要修正',
      message: '保留原答，圈出第一处差异，并写清改变结论的条件或依据。',
    }
  }
  if (attempt.confidence === 'low') {
    return {
      kind: 'underconfident',
      label: '判断一致但把握偏低',
      message: '标出让原判断成立的可靠线索；下次先用这条线索独立判断。',
    }
  }
  return {
    kind: 'calibrated',
    label: attempt.confidence === 'high' ? '判断与把握一致' : '判断基本校准',
    message: '用自己的话解释关键依据，并检查换一个条件后结论是否仍成立。',
  }
}

const STAGED_COPY: Record<StagedLearningSceneType, Omit<StagedLearningConfig, 'sceneType' | 'prompt' | 'promptItems' | 'revealLabel' | 'revealedLabel'>> = {
  'worked-example': {
    promptLabel: '先补关键一步',
    attemptInstruction: '补出【待补】处，并写明依据。',
    recordsMastery: false,
  },
  practice: {
    promptLabel: '先独立作答',
    attemptInstruction: '独立完成题目，保留答案和过程。',
    recordsMastery: true,
  },
  contrast: {
    promptLabel: '先辨析',
    attemptInstruction: '判断说法是否成立，并写出依据。',
    recordsMastery: false,
  },
  'ai-verify': {
    promptLabel: '先判断待核查说法',
    attemptInstruction: '找出说法中的具体错误，并用本课证据纠正。',
    recordsMastery: false,
  },
}

function promptItemsFor(scene: LessonScene, sceneType: StagedLearningSceneType): string[] {
  switch (sceneType) {
    case 'worked-example': return [workedExampleCompletionPrompt(scene) ?? scene.contentSlots.problem ?? '']
    case 'practice': return [scene.contentSlots.task ?? '']
    case 'contrast': return [scene.contentSlots.leftAction ?? scene.contentSlots.misconception ?? '']
    case 'ai-verify': return aiVerifyPairs(scene).map(pair => pair.claim).filter(Boolean)
  }
}

function hasResponse(scene: LessonScene, sceneType: StagedLearningSceneType): boolean {
  switch (sceneType) {
    case 'worked-example': return Boolean(scene.contentSlots.steps?.trim())
    case 'practice': return Boolean(scene.contentSlots.feedback?.trim())
    case 'contrast': return Boolean((scene.contentSlots.rightAction ?? scene.contentSlots.correction)?.trim())
    case 'ai-verify': return aiVerifyPairs(scene).every(pair => Boolean(pair.claim && pair.reveal))
  }
}

/**
 * 只有同时存在题面和反馈的幕才进入分阶段呈现。草稿、旧课缺槽或教师删掉反馈时
 * 保持原渲染，避免生成一个无法结束的“查看反馈”操作。
 */
export function stagedLearningConfig(scene: LessonScene): StagedLearningConfig | null {
  if (!(scene.sceneType in STAGED_COPY)) return null
  const sceneType = scene.sceneType as StagedLearningSceneType
  const promptItems = promptItemsFor(scene, sceneType).map(item => item.trim()).filter(Boolean)
  const completionPrompt = sceneType === 'worked-example' ? workedExampleCompletionPrompt(scene) : null
  const prompt = sceneType === 'worked-example'
    ? scene.contentSlots.problem?.trim() ?? ''
    : promptItems.join('\n')
  if (!prompt || !hasResponse(scene, sceneType)) return null
  const copy = STAGED_COPY[sceneType]
  const attemptInstruction = sceneType === 'ai-verify' && promptItems.length > 1
    ? `逐条判断这 ${promptItems.length} 个说法，各写出一处具体错误和一条本课证据。`
    : sceneType === 'worked-example' && completionPrompt
      ? '补出【待补】处，并写明依据。'
      : copy.attemptInstruction
  return {
    sceneType,
    prompt,
    promptItems,
    ...(completionPrompt ? { completionPrompt } : {}),
    ...copy,
    attemptInstruction,
    ...STAGED_RUNTIME_CONTROLS[sceneType],
  }
}

export type StagedPromptEvidenceKind = 'generated-image' | 'force-diagram'

export type StagedPromptForceVector = ForceVector & { lengthMagnitude: string }

/**
 * 作答页的受力图只能显示题面明确给出的量。完整 forceVectors 同时承担讲解页答案，
 * 不能原样复用；这里保留方向和力名，未在题面对应分句中出现的数值统一显示为问号。
 * 所有箭头使用定性等长画法，避免箭长继续暗示未知量之间的大小关系。
 */
export function stagedPromptForceVectors(scene: LessonScene): StagedPromptForceVector[] {
  const config = stagedLearningConfig(scene)
  if (!config) return []
  const clauses = `${config.prompt}\n${config.completionPrompt ?? ''}`
    .split(/[，,。.!！?？；;\n]/)
    .map(clause => clause.replace(/\s+/g, '').toLowerCase())
    .filter(Boolean)
  // 待求量可能写在题面问句里（如「判断拉力与摩擦力是否平衡」），不只在完成指令里；
  // 「?」只标记被问及，不携带数值，扩大匹配面不会泄露答案。
  const taskText = `${config.prompt}${config.completionPrompt ?? ''}`.replace(/\s+/g, '').toLowerCase()

  return parseForceVectors(scene.contentSlots.forceVectors ?? '').map(force => {
    const magnitude = `${force.magnitude}${force.unit}`.replace(/\s+/g, '').toLowerCase()
    const forceName = (force.type || force.label).replace(/\s+/g, '').toLowerCase()
    const isGiven = Boolean(magnitude && forceName && clauses.some(clause => clause.includes(forceName) && clause.includes(magnitude)))
    const isTarget = Boolean(forceName && taskText.includes(forceName))
    return {
      ...force,
      magnitude: isGiven ? force.magnitude : isTarget ? '?' : '',
      unit: isGiven ? force.unit : '',
      lengthMagnitude: '',
    }
  })
}

/**
 * 学生作答页可以隐藏答案，但不能隐藏题面明确给出的观察证据。
 * 受力图只有在完成题把它表述为“已给出的图”时才提前显示；要求学生自己画图时仍隐藏。
 */
export function stagedPromptEvidenceKind(scene: LessonScene): StagedPromptEvidenceKind | null {
  const config = stagedLearningConfig(scene)
  if (!config) return null
  if (config.sceneType === 'contrast' && scene.imageUrl) return 'generated-image'
  if (config.sceneType !== 'worked-example' || !config.completionPrompt) return null

  const hasForceDiagram = parseForceVectors(scene.contentSlots.forceVectors ?? '').length > 0
  const promptTreatsDiagramAsGiven = /(?:受力图|受力示意图).{0,10}(?:已|给出|所示)|(?:根据|观察|结合).{0,8}(?:受力图|受力示意图)/.test(config.completionPrompt)
  return hasForceDiagram && promptTreatsDiagramAsGiven ? 'force-diagram' : null
}

/**
 * 首次进入任务页时，字幕和 TTS 只发出行动指令，不读取含答案的教师讲稿。
 * 完成作答并展开反馈后，StageCanvas 会重新使用原 scene，播放完整讲解。
 */
export function stagedSceneForPrompt(scene: LessonScene): LessonScene {
  const config = stagedLearningConfig(scene)
  if (!config) return scene
  // 先答页优先用生成期专写的 promptScript(读题引导+思考切入点+分层引导,2026-08-25
  // 用户裁决「题目两页讲稿不能一致、要面向不同学生」);存量课无此槽时回退行动指令。
  const promptScript = scene.contentSlots.promptScript?.trim()
  return {
    ...scene,
    teacherScript: promptScript || config.attemptInstruction,
    studentAction: config.attemptInstruction,
  }
}

/**
 * 存量例题展开步骤后补上自我解释提示。只在课堂运行时派生，不改数据库中的教师原稿。
 */
export function stagedSceneForReveal(scene: LessonScene): LessonScene {
  if (scene.sceneType !== 'worked-example' || !stagedLearningConfig(scene)) return scene
  if (workedExampleActionHasSelfExplanation(scene.studentAction)) return scene

  const studentAction = ensureWorkedExampleSelfExplanation(scene.studentAction)
  const cue = `步骤已经展开。${WORKED_EXAMPLE_SELF_EXPLANATION_CUE}。`
  const deepenedScript = scene.teacherScript.includes(WORKED_EXAMPLE_SELF_EXPLANATION_CUE)
    ? scene.teacherScript
    : `${scene.teacherScript} ${cue}`
  return {
    ...scene,
    teacherScript: deepenedScript,
    studentAction,
  }
}

/**
 * 揭晓不是学习闭环的终点。每类检核幕都要求学生保留原答，再完成一个可观察的
 * 修正或自我解释动作，避免把“看过答案”误当成“已经学会”。
 */
export function stagedRevealAction(scene: LessonScene): StagedRevealAction | null {
  const config = stagedLearningConfig(scene)
  if (!config) return null

  switch (config.sceneType) {
    case 'worked-example':
      return {
        sceneType: config.sceneType,
        label: '解释关键一步',
        instruction: stagedSceneForReveal(scene).studentAction,
      }
    case 'practice':
      return {
        sceneType: config.sceneType,
        label: '保留原答再订正',
        instruction: '先保留原答案，圈出与反馈不同的第一处；若有误，写下错因并重做关键一步，再如实选择结果。',
      }
    case 'contrast':
      return {
        sceneType: config.sceneType,
        label: '把误区改正确',
        instruction: '保留原判断，把错误说法改写成一句正确表述，并圈出改变结论的关键条件。',
      }
    case 'ai-verify':
      return {
        sceneType: config.sceneType,
        label: config.promptItems.length > 1 ? '逐条改写并举证' : '改写并举证',
        instruction: config.promptItems.length > 1
          ? `保留原判断，把这 ${config.promptItems.length} 条错误说法逐条改写正确，并为每条补一条本课证据。`
          : '保留原判断，把错误说法改写正确，并补一条本课证据。',
      }
  }
}

/**
 * 例题、辨析和 AI 核查在揭晓后还要完成自我解释或订正。练习页已有正式的
 * 反馈后反思与掌握度流程，不再叠加一套会话级门槛。
 */
export function stagedPostRevealRecordIsComplete(
  scene: LessonScene,
  record: StagedPostRevealRecord | undefined,
): boolean {
  const config = stagedLearningConfig(scene)
  if (!config || config.sceneType === 'practice') return true
  return Boolean(record && isStagedComparison(record.comparison)
    && stagedSessionEvidenceIsComplete(config.promptItems.length, record))
}

export function stagedLearningStateKey(courseId: string, sceneId: string): string {
  return `${courseId}:${sceneId}`
}

function isStagedConfidence(value: unknown): value is StagedConfidence {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isStagedComparison(value: unknown): value is StagedComparison {
  return value === 'matched' || value === 'revised'
}

/**
 * 后续页面不能绕过分阶段检核的作答、揭晓和修正。只扫描目标页之前的幕，因此
 * 学生可先进入检核页，也始终能返回更早页面复习；缺少完整题面或反馈的旧幕不设死锁。
 */
export function stagedNavigationBlocker(
  courseId: string,
  scenes: readonly LessonScene[],
  targetIndex: number,
  revealedByKey: Readonly<Record<string, boolean | undefined>>,
  postRevealByKey: Readonly<Record<string, StagedPostRevealRecord | undefined>>,
  practiceEvidenceByKey: Readonly<Record<string, boolean | undefined>> = {},
): StagedNavigationBlocker | null {
  const upperBound = Math.min(Math.max(targetIndex, 0), scenes.length)
  for (let sceneIndex = 0; sceneIndex < upperBound; sceneIndex += 1) {
    const scene = scenes[sceneIndex]
    if (!scene) continue
    const config = stagedLearningConfig(scene)
    if (!config) continue
    const stateKey = stagedLearningStateKey(courseId, scene.id)
    if (!revealedByKey[stateKey]) {
      return {
        sceneIndex,
        sceneId: scene.id,
        phase: 'reveal',
        actionLabel: config.revealLabel,
      }
    }
    // 正式练习不能把“看过反馈”当成完成。有关联知识点的新课必须在反馈后
    // 留下订正或判断依据，并由服务端成功保存可追溯证据后才能前进。
    // 无 kpId 的存量旧页无法安全归属掌握度，沿用原兼容行为，避免课堂死锁。
    if (config.sceneType === 'practice' && scene.kpId && !practiceEvidenceByKey[stateKey]) {
      return {
        sceneIndex,
        sceneId: scene.id,
        phase: 'practice-evidence',
        actionLabel: '反馈后订正并保存学习记录',
      }
    }
    if (!stagedPostRevealRecordIsComplete(scene, postRevealByKey[stateKey])) {
      return {
        sceneIndex,
        sceneId: scene.id,
        phase: 'post-reveal',
        actionLabel: stagedRevealAction(scene)?.label ?? '完成揭晓后修正',
      }
    }
  }
  return null
}
