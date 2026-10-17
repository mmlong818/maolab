import { findBannedPhrasings, findToneViolations } from '@maolab/pedagogy'
import { SERIAL_HOOK_MAX, SERIAL_HOOK_SLOT } from './season.js'
import {
  IMAGE_SCENE_TYPES,
  QUALITY_GATES,
  REQUIRED_SCENE_FIELDS,
  lessonPhaseOf,
  misconceptionSourcesOf,
  sceneExecutor,
  type CastProfile,
  type DialogueLayout,
  type Executor,
  type LessonScene,
  type MainlineCourse,
  type QualityGateId,
  type SceneType,
} from './domain.js'
import { AI_VERIFY_OVERLAP_THRESHOLD, aiVerifyPairs, aiVerifyTextOverlapRatio } from './ai-verify.js'
import { pickMasterRouted, type RoutedSceneType } from './presentation/master-routing.js'
import { functionPlotContractProblems, functionPlotSegments, parseForceVectors } from './presentation/content-forms.js'
import { opticsSolutionFor } from './presentation/optics.js'
import { hasRenderableSubjectVisual } from './presentation/subject-content.js'
import { SCENE_TECHNIQUE_REGISTRY } from './scene-techniques.js'
import {
  practiceAnswerLeakReasons,
  practiceFeedbackQualityReasons,
  practiceTaskMaterialReasons,
} from './practice-feedback.js'
import { studentActionLeavesEvidence, workedExampleActionHasSelfExplanation } from './learning-action.js'
import { unsupportedRuntimePromises } from './runtime-interaction.js'
import { recapTemplateForScene, recapTemplateProblems, recapTransferTaskProblems } from './recap-template.js'
import { conceptTemplateForScene, conceptTemplateProblems } from './concept-template.js'
import { teacherScriptLoadFor } from './teacher-script-load.js'
import { ASSESSMENT_ACTION_LABELS, practiceSceneAlignment } from './assessment-alignment.js'
import { learningGoalContractProblems } from './learning-goal-contract.js'
import { sceneContentSlotProblems } from './scene-content-slots.js'
import { workedExampleScaffoldProblems } from './worked-example-scaffold.js'

/** 指示性指图:明确指向"本幕画面上那张图"的措辞。"插图/图案"等作为教学对象的名词不算
 * (真检 round07:美术装帧课板书"图形:插图、图案"被误拦,故收窄到指示语)。 */
// 中文没有天然词边界；“构图中的”描述构图本身，并不是要求学生看一张图。
const IMAGE_DEIXIS_PATTERN = /(看这幅图|看这张图|看下图|看上图|如图|(?<![构绘制作读识])图(?:中|上)|这幅图|这张图)/

/**
 * 任务构式:「在图上标出/画出…」。它**本身不足以豁免**——
 * 「请在图上标出焦点」是当场指令,幕上没图就是事故,必须拦。
 */
const IMAGE_TASK_PATTERN = /在图[上中][^,，。;；！!？?]{0,8}?(标出|标注|画出|画上|作图|写出|填出|填上|补全|连线|找出)/g

/** 未来/课程规划语境。只有它在场,任务构式才是「稍后要做」而非「现在就做」。 */
const FUTURE_CONTEXT_PATTERN = /(稍后|待会|等会|接下来|后面|之后|随后|最后|将要|即将|要学会|下一步|本课[将要]|本节课[将要]|这节课[将要])/

/** 句子切分:任务构式与未来语境必须同句才算数,跨句不豁免。 */
const SENTENCE_SPLIT = /(?<=[。;；!?！？\n])/

/**
 * 判指图前的预处理:**只在同句存在未来语境时**剔除任务构式。
 *
 * 2026-07-27 真检:扉页「后面分三步走…最后在图上准确标出焦点位置与焦距」
 * 被误判无图指图。第一版修法裸剔所有任务构式——Codex 复审实跑发现这把洞补大了:
 * 「请在图上标出三条光线的焦点」这类**当场指令**也被剔掉,无图幕反而漏过。
 * 现改为默认拦截、有明确未来语境才豁免(fail closed)。
 */
function stripPlannedTasks(text: string): string {
  return text
    .split(SENTENCE_SPLIT)
    .map(sentence => (FUTURE_CONTEXT_PATTERN.test(sentence) ? sentence.replace(IMAGE_TASK_PATTERN, '') : sentence))
    .join('')
}

/**
 * 本幕是否真的画得出结构图示。
 *
 * 判定一律**用渲染端同一套解析器**,而不是「槽键存在即算有图」——取值解析不出内容时
 * 渲染端会回退通用板书,闸门若仍放行,「指图无图」原样复发。
 * 光路(opticsSolutionFor)与六学科(hasRenderableSubjectVisual)从一开始就走这条路;
 * 2026-07-27 把最后两个仍用裸键判定的老槽 forceVectors / funcPlotPoints 也收进来
 * ——实测 `parseCoordPairs('abc')` 返回空数组,旧判定会让这幕画出空图却按有图放行。
 *
 * 新增专属渲染器时在此追加一个「解析得出内容」的判定,不要退回裸键。
 */
function hasStructuredVisualFor(scene: LessonScene): boolean {
  const slots = scene.contentSlots
  // 受力图:至少解析出一支矢量。另加一条结构下限——parseForceVectors 只要求标签非空,
  // 一段散文也能被解析成若干"角度 0、无大小"的矢量,画出来是一排全指右的箭头。
  // 行内必须出现列分隔符 `|`,才谈得上带方向与大小的矢量(格式见 fill-scenes 生成契约)。
  const forceRaw = slots.forceVectors ?? ''
  if (forceRaw.includes('|') && parseForceVectors(forceRaw).length > 0) return true
  // 函数图像:至少一个连续分支能连成曲线；定义域外点和断点由同一解析器过滤。
  if (functionPlotSegments(
    slots.funcPlotPoints ?? '',
    slots.funcBreakpoints ?? '',
    slots.funcKeyPoints ?? '',
    slots.funcDomain ?? '',
  ).some(segment => segment.length >= 2)) return true
  return Boolean(opticsSolutionFor(slots.opticsScene)) || hasRenderableSubjectVisual(slots)
}
/** 图名式焦点:visualFocus 直接以复合图名命名本幕画面,等于许诺该图存在。只查 visualFocus。 */
// 「力的示意图画法规范」这类 KP 名是**画图技能**的名字,不是承诺屏幕上有一张图;
// 图名词后面跟着画法/规范类技能后缀时放行(2026-08-25 真实生成被整课拦死于此)。
/** 跨页页码指路:「回第5幕」「见第3页」。页序随拆页动态展开,幕号≠投影页号,
 * 这类引用几乎必然指错(2026-08-26 地理课实撞 3 处把学生支去不存在的位置);
 * 且「幕」是内部概念学生看不见。需要引用此前内容时应把要点复述在本页。 */
// 「页」指路全学科拦;「幕」指路对语文豁免——戏剧课文(《雷雨》《哈姆雷特》)里
// 「第二幕中,周朴园…」「回顾第二幕的冲突」是正当文学分析,不是投影跨页引用
// (2026-08-26 code-review CONFIRMED:裸「第X幕的」分支曾把此类课永久拦死)。
const CROSS_PAGE_POINTER_PATTERN = /(?:回|见|翻到|参考|回顾|回到)第\s*[一二三四五六七八九十\d]+\s*页/
const CROSS_ACT_POINTER_PATTERN = /(?:回|见|翻到|参考|回顾|回到)第\s*[一二三四五六七八九十\d]+\s*幕/
const IMAGE_NAME_FOCUS_PATTERN = /(示意图|拼合图|分布图|流程图|对比图|剖面图|回放图)(?!的?(?:画法|规范|规则|要求|步骤|口诀|技能|方法))/

export type QualitySeverity = 'blocking' | 'warning' | 'info'
export type QualityTargetType = 'course' | 'goal' | 'fragment' | 'scene' | 'beat' | 'cast' | 'voice'

export interface QualityIssue {
  id: string
  gate: QualityGateId
  severity: QualitySeverity
  targetType: QualityTargetType
  targetId: string
  /** 跨页面问题等同时关联多个目标；targetId 仍是主要修正落点。 */
  relatedTargetIds?: string[]
  message: string
  impact: string
  fix: string
  autoFixable: boolean
}

export interface QualitySummary {
  status: 'blocked' | 'passed-with-warnings' | 'passed'
  blocking: number
  warning: number
  info: number
}

const CONTENT_DENSE_LAYOUTS: readonly DialogueLayout[] = [
  'corner-avatar',
  'narration-only',
  'no-character',
]

const ASSESSMENT_SCENE_TYPES: readonly SceneType[] = ['practice', 'contrast', 'ai-verify', 'ai-inquiry', 'ai-collab']
/** 单页连续超过一分钟时提醒拆分主要教学动作；片段可以由多个合格单页组成。 */
const SCENE_DURATION_WARNING_SEC = 60
const SOURCE_PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i
export const SOURCE_PLACEHOLDER_ISSUE_PREFIX = '课程把待补内容写进了来源摘录:'
export const PRACTICE_ANSWER_LEAK_ISSUE_MESSAGE = '练习题面提前泄露了反馈答案。'
export const PRACTICE_MISSING_MATERIAL_ISSUE_MESSAGE = '练习题面引用了学生看不到的作答材料。'
export const PRACTICE_FEEDBACK_ISSUE_MESSAGE = '练习反馈缺少判定依据或具体纠错行动。'
export const PRACTICE_ALIGNMENT_ISSUE_MESSAGE = '练习任务不能证明知识点成功信号。'
export const MISSING_PRACTICE_ISSUE_MESSAGE = '知识点片段缺少可保存学习证据的独立练习。'
export const PRACTICE_REGEN_ISSUE_MESSAGES: ReadonlySet<string> = new Set([
  PRACTICE_ANSWER_LEAK_ISSUE_MESSAGE,
  PRACTICE_MISSING_MATERIAL_ISSUE_MESSAGE,
  PRACTICE_FEEDBACK_ISSUE_MESSAGE,
  PRACTICE_ALIGNMENT_ISSUE_MESSAGE,
])
export const SOURCE_LOCATION_ISSUE_MESSAGE = '课程来源只有知识点名称，缺少可核查定位。'
export const STUDENT_PROJECTION_META_ISSUE_MESSAGE = '学生投影片混入了备课或流程说明。'

const STUDENT_PROJECTION_META_PATTERN = /(?:已完成(?:的)?(?:前|第)?[一二两三四五六七八九十\d]+步|根据前[一二两三四五六七八九十\d]+步[^。！？!?]{0,16}完成下一步|避免一次处理所有信息|(?:当前|你现在)只需完成下一步|先看已完成的前序步骤|完成后再(?:统一)?展开|先留下自己的答案|等待判断|AI\s*将在此补充核查)/

/**
 * 只检查会投给学生看的文字；教师讲稿、授课节奏和事实来源不在此列。
 * 生成链也调用同一规则，避免“页面发现问题，下一门课又生成回来”。
 */
export function studentProjectionMetaProblems(scene: Pick<LessonScene, 'visualFocus' | 'boardText' | 'studentAction' | 'contentSlots'>): string[] {
  const fields: Array<[string, string]> = [
    ['标题', scene.visualFocus],
    ['学生任务', scene.studentAction],
    ...scene.boardText.map((text, index) => [`投影片要点 ${index + 1}`, text] as [string, string]),
    ...Object.entries(scene.contentSlots).map(([key, text]) => [`内容 ${key}`, text] as [string, string]),
  ]
  return fields
    .filter(([, text]) => STUDENT_PROJECTION_META_PATTERN.test(text))
    .map(([label, text]) => `${label}含幕后说明“${text.match(STUDENT_PROJECTION_META_PATTERN)?.[0] ?? text}”`)
}

export function auditMainlineCourse(course: MainlineCourse): QualityIssue[] {
  const issues: QualityIssue[] = []
  const sceneIds = new Set(course.scenes.map(scene => scene.id))
  const castById = new Map(course.castProfiles.map(cast => [cast.id, cast]))
  const voiceCastIds = new Set(course.voiceProfiles.map(voice => voice.castId))

  pushCourseIssues(course, issues)
  pushGoalIssues(course, issues)
  pushSkeletonIssues(course, issues)
  pushFragmentIssues(course, sceneIds, issues)
  pushCastAndVoiceIssues(course, castById, voiceCastIds, issues)
  pushSceneIssues(course, castById, voiceCastIds, issues)
  pushSceneContentSlotIssues(course, issues)
  pushFunctionPlotIssues(course, issues)
  pushRuntimeInteractionIssues(course, issues)
  pushPracticeFeedbackIssues(course, issues)
  pushSourceReadingProgressionIssues(course, issues)
  pushRecapLearningIssues(course, issues)
  pushRecapTemplateIssues(course, issues)
  pushConceptBuildTemplateIssues(course, issues)
  pushStudentActionEvidenceIssues(course, issues)
  pushWorkedExampleScaffoldIssues(course, issues)
  pushWorkedExampleSelfExplanationIssues(course, issues)
  pushStudentProjectionAudienceIssues(course, issues)
  pushBeatIssues(course, sceneIds, issues)
  pushCourseShapeIssues(course, issues)
  pushMasterRoutingIssues(course, issues)
  pushPedagogyRegistryIssues(course, issues)
  pushSeasonGuardIssues(course, issues)
  pushGroundedContrastIssues(course, issues)
  pushAiVerifyIssues(course, issues)
  pushExecutorMixIssues(course, issues)

  return issues
}

function pushStudentProjectionAudienceIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    const problems = studentProjectionMetaProblems(scene)
    if (problems.length === 0) continue
    issue(
      issues,
      'pedagogy',
      'blocking',
      'scene',
      scene.id,
      STUDENT_PROJECTION_META_ISSUE_MESSAGE,
      '学生看到的是系统如何组织课堂的说明，而不是本页真正要学习、判断或练习的内容。',
      `删去幕后说明，直接呈现题面、已知信息和学生动作：${problems.join('；')}。`,
      false,
    )
  }
}

function pushSceneContentSlotIssues(course: MainlineCourse, issues: QualityIssue[]) {
  // draft 是编译期骨架，槽位仍是占位文案；保存前由生成链严格逐次验收。
  if (course.qualityStatus === 'draft') return
  for (const scene of course.scenes) {
    // 旧版手工示例页没有 kpId，且存在多套已经可正常渲染的历史键名。
    // 新编译的知识页都带 kpId；生成链本身则对所有新输出逐次执行严格槽位校验。
    if (!scene.kpId) continue
    const problems = sceneContentSlotProblems(scene)
    if (problems.length === 0) continue
    issue(
      issues,
      'visual',
      'blocking',
      'scene',
      scene.id,
      '专属页面缺少真实渲染器需要的核心内容。',
      '课程虽然保存了若干字段，但当前幕型的页面读不到它们，学生会看到空白、缺题面或缺反馈。',
      `按本幕型重新生成并补齐：${problems.join('；')}。不要用任意自造键代替。`,
      true,
    )
  }
}

const RENDER_SAMPLE_LEAK_PATTERN = /沿定义域[^。；;]{0,24}均匀取(?:至少)?\s*(?:8|八)\s*个点/

/**
 * 函数图属于精确教学图示：发布前既要保证几何数据能正确绘制，也要避免把渲染器的
 * 隐藏采样预算误写成学生任务。后者会把“两点法”等学科方法降格成机械凑点。
 */
function pushFunctionPlotIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (!scene.contentSlots.funcPlotPoints?.trim()) continue

    for (const problem of functionPlotContractProblems(scene.contentSlots)) {
      issue(
        issues,
        'visual',
        'blocking',
        'scene',
        scene.id,
        problem.message,
        '函数图可能画错、越界或把本应断开的连续分支连在一起，页面文字与图形会互相矛盾。',
        '按定义域重新计算采样点并按 x 递增排列；无定义点写入 funcBreakpoints，两侧连续分支用 | 分隔。',
        false,
      )
    }

    const studentFacingTask = [
      scene.contentSlots.problem,
      scene.contentSlots.task,
      scene.teacherScript,
      scene.studentAction,
    ].filter(Boolean).join(' ')
    if (RENDER_SAMPLE_LEAK_PATTERN.test(studentFacingTask)) {
      issue(
        issues,
        'pedagogy',
        'blocking',
        'scene',
        scene.id,
        '函数图渲染采样数被误写成学生作图要求。',
        '学生被要求为渲染器机械凑点，可能破坏描点法取点理由或“两点确定直线”的核心方法。',
        '学生任务只保留本课方法真正需要的取点数量与理由；funcPlotPoints 仅作为不上屏的绘图数据。',
        false,
      )
    }
  }
}

/**
 * 新生成的知识点辨析页必须携带编译期固化的教材/教研误区原文，并且学生首次看到
 * 的错误说法仍要紧扣该来源。只检查绑定 kpId 且使用 misconception 槽的语义辨析页；
 * 诗句动作对照等通用 contrast 页面不属于误区辨析，不能被误伤。
 */
function pushGroundedContrastIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'contrast' || !scene.kpId || !('misconception' in scene.contentSlots)) continue
    const source = misconceptionSourcesOf(scene).map(item => item.trim()).find(Boolean)
    if (!source) {
      issue(issues, 'pedagogy', 'blocking', 'scene', scene.id, '辨析幕缺少误区溯源(misconceptionSource)。', '学生看到的错误说法没有教材或教研背书,可能是模型为了凑辨析页自由编造的。', '删除无依据的辨析页,或先在知识点元数据中确认真实误区后重新展开骨架。', false)
      continue
    }

    const overlap = aiVerifyTextOverlapRatio(source, scene.contentSlots.misconception ?? '')
    if (overlap >= AI_VERIFY_OVERLAP_THRESHOLD) continue
    issue(
      issues,
      'pedagogy',
      'blocking',
      'scene',
      scene.id,
      '辨析幕的错误说法与教研确认误区原文重合度过低,疑似 LLM 自由编造错误。',
      '学生可能被要求辨析一个真实学习中并不存在、或属于其他知识点的错误。',
      `重新生成本幕,misconception 必须紧扣误区原文「${source}」改写,不得替换成其他错误。`,
      false,
    )
  }
}

function pushRuntimeInteractionIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    const promises = unsupportedRuntimePromises(scene)
    if (promises.length === 0) continue

    issue(
      issues,
      'technique',
      'warning',
      'scene',
      scene.id,
      '课堂交互描述承诺了当前页面未实现的能力。',
      `备课稿写着“${promises.map(item => item.claim).join('、')}”，但正式课堂实际是“${promises.map(item => item.actual).join('、')}”。教师会按不存在的控件或动画组织课堂。`,
      '按当前静态展示或教师按钮一次展开的真实流程改写；只有对应控件已经实现并通过真实页面验证后，才能保留该承诺。',
      true,
    )
  }
}

function pushPracticeFeedbackIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'practice') continue
    const task = scene.contentSlots.task ?? ''
    const feedback = scene.contentSlots.feedback ?? ''
    const reasons = practiceAnswerLeakReasons(
      task,
      feedback,
    )
    if (reasons.length > 0) {
      issue(
        issues,
        'pedagogy',
        'blocking',
        'scene',
        scene.id,
        PRACTICE_ANSWER_LEAK_ISSUE_MESSAGE,
        '学生无需提取、推理或作答就能照抄结果，分阶段揭示失效，课堂也无法取得真实学习证据。',
        `把题面改成“已知条件 + 作答要求”，把答案、步骤和判别依据全部移入 feedback。检测依据：${reasons.join('；')}。`,
        true,
      )
    }

    const materialReasons = practiceTaskMaterialReasons(task)
    if (materialReasons.length > 0) {
      issue(
        issues,
        'pedagogy',
        'blocking',
        'scene',
        scene.id,
        PRACTICE_MISSING_MATERIAL_ISSUE_MESSAGE,
        '首次作答画面只显示 task；候选项、语段、图表或句子缺失时，学生没有足够信息完成任务。',
        `把全部题干、候选项和必要材料直接写进 task；无法安全呈现的材料就把任务改成不依赖它的自足题目。检测依据：${materialReasons.join('；')}。`,
        true,
      )
    }

    const feedbackReasons = practiceFeedbackQualityReasons(feedback)
    if (feedbackReasons.length > 0) {
      issue(
        issues,
        'pedagogy',
        'blocking',
        'scene',
        scene.id,
        PRACTICE_FEEDBACK_ISSUE_MESSAGE,
        '学生只能看到笼统鼓励、最终答案或“请核对”，无法定位错误规则，也不知道下一次要改什么。',
        `在 feedback 中同时写清答案或完成标准、关键依据，以及典型错误对应的订正动作。检测依据：${feedbackReasons.join('；')}。`,
        true,
      )
    }
  }
}

const INTRO_PREDICTION_PATTERN = /(预测|猜想|疑问|问题)/
const INTRO_EVIDENCE_PATTERN = /(证据|观察|查找|寻找|检验|验证|核对)/
const REVIEW_RETRIEVAL_PATTERN = /(闭卷|不看资料|回忆|提取|独立作答|限时|诊断)/
const REVIEW_FEEDBACK_PATTERN = /(核对|纠错|反馈|订正|错因|检查|边界)/
const RECAP_REREAD_PATTERN = /(复述|背诵|朗读|跟读|照着|照抄|抄写)/
const RECAP_DEEP_ACTION_PATTERN = /(解释|说明|举例|例子|应用|运用|迁移|比较|对照|检验|验证|修正|改写|判断|理由|为什么|预测|反思)/

export const OPENING_PROGRESSION_ISSUE_MESSAGE = '开场没有形成“先预测、后取证”的学习顺序。'
export const REVIEW_OPENING_PROGRESSION_ISSUE_MESSAGE = '复习课开场没有形成“先提取、后纠错”的顺序。'
export const EXAM_PREP_OPENING_PROGRESSION_ISSUE_MESSAGE = '考前课开场没有形成“先诊断、后核查”的顺序。'
export const RECAP_REREAD_ISSUE_MESSAGE = '收束页在完整结论可见时仍只要求复述或背诵。'
export const RECAP_TRANSFER_TASK_ISSUE_MESSAGE = '收束页没有提供可直接作答的具体迁移题。'
export const STUDENT_ACTION_EVIDENCE_ISSUE_MESSAGE = '学生动作只有观看或操作，没有留下可检查的回答。'
export const WORKED_EXAMPLE_SELF_EXPLANATION_ISSUE_MESSAGE = '完整例题只要求跟随或抄写步骤，没有要求学生解释关键步骤。'
export const WORKED_EXAMPLE_SCAFFOLD_ISSUE_MESSAGE = '完整例题没有形成“完成题→完整示范→独立练习”的支架渐退。'

/**
 * 开场必须先让学生外显已有想法，再进入后续证据页。
 * 新课由确定性开场保证；这里主要暴露旧课或教师手改后的顺序退化。
 */
function pushSourceReadingProgressionIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'source-reading') continue
    const phase = lessonPhaseOf(course)
    if (phase !== 'new') {
      // “先提取”必须落在学生实际动作或开场问题上；讲稿里说一句“要闭卷”不足以
      // 证明学生真的作答，也避免“不安排闭卷”这类否定句误过闸门。
      const actionText = `${scene.studentAction} ${scene.contentSlots.openingQuestion ?? ''}`
      const feedbackText = `${scene.teacherScript} ${scene.contentSlots.learningPath ?? ''}`
      const retrievesBeforeReview = REVIEW_RETRIEVAL_PATTERN.test(actionText)
      const promisesFeedback = REVIEW_FEEDBACK_PATTERN.test(feedbackText)
      if (retrievesBeforeReview && promisesFeedback) continue

      issue(
        issues,
        'pedagogy',
        'warning',
        'scene',
        scene.id,
        phase === 'review'
          ? REVIEW_OPENING_PROGRESSION_ISSUE_MESSAGE
          : EXAM_PREP_OPENING_PROGRESSION_ISSUE_MESSAGE,
        '学生先看到完整讲解再作答，会把复习变成重听新课，教师也无法分辨真正记住的内容和刚刚看过的内容。',
        phase === 'review'
          ? '先要求学生闭卷写出记得的内容和依据，再用后续页面核对、纠错并完成变式任务。'
          : '先设置限时作答并标记最没把握处，再归类错因、核查条件和适用边界。',
        true,
      )
      continue
    }
    const asksForPrediction = INTRO_PREDICTION_PATTERN.test(scene.studentAction)
    const promisesEvidence = INTRO_EVIDENCE_PATTERN.test(`${scene.teacherScript} ${scene.studentAction}`)
    if (asksForPrediction && promisesEvidence) continue

    issue(
      issues,
      'pedagogy',
      'warning',
      'scene',
      scene.id,
      OPENING_PROGRESSION_ISSUE_MESSAGE,
      '学生在表达已有想法前就进入讲解，后续页面容易变成被动接收，教师也失去观察概念变化的基线。',
      '把开场动作改为先写预测或疑问，并明确后续将用观察或证据检验；完整结论留到后续页面。',
      true,
    )
  }
}

/**
 * 收束页会把 takeaway 作为学生可见的大字结论，因此单纯要求复述或背诵只能产生
 * 照读证据。允许先复述再解释，但必须同时包含举例、应用、比较、修正等深加工动作。
 */
export function recapNeedsDeeperAction(studentAction: string): boolean {
  return RECAP_REREAD_PATTERN.test(studentAction) && !RECAP_DEEP_ACTION_PATTERN.test(studentAction)
}

function pushRecapLearningIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'recap') continue
    if (recapNeedsDeeperAction(scene.studentAction)) {
      issue(
        issues,
        'pedagogy',
        'warning',
        'scene',
        scene.id,
        RECAP_REREAD_ISSUE_MESSAGE,
        '学生可以直接照读屏幕，系统得到的是阅读表现，不是理解、提取或迁移证据。',
        '保留路径和结论作为线索，但要求学生解释理由、完成一题条件已变化的新任务，并回看开场预测。',
        true,
      )
    }
    if (scene.infoShape || recapTransferTaskProblems(scene.contentSlots.transferTask).length === 0) continue
    issue(
      issues,
      'pedagogy',
      'warning',
      'scene',
      scene.id,
      RECAP_TRANSFER_TASK_ISSUE_MESSAGE,
      '“举一个新例子”把出题工作推给学生，教师无法比较全班是否会把本课方法迁移到同一新条件。',
      '重新生成收束页，提供一道只改变一个条件、对象、材料、数据或表示方式的具体任务，并要求学生写出判断和依据。',
      false,
    )
  }
}

function pushRecapTemplateIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'recap' || !scene.infoShape) continue
    const template = recapTemplateForScene(scene)
    if (!template) {
      issue(
        issues,
        'pedagogy',
        'warning',
        'scene',
        scene.id,
        '收束页记录了尚未实现的结构形状。',
        `当前 infoShape=${scene.infoShape} 没有对应的确定性收束模板，页面只能回退旧版式。`,
        '重新生成该页，或先为这一形状补齐结构模板、渲染器和质量检查。',
        false,
      )
      continue
    }
    const problems = recapTemplateProblems(scene)
    if (problems.length === 0) continue
    issue(
      issues,
      'pedagogy',
      'blocking',
      'scene',
      scene.id,
      `收束页“${template.label}”结构不完整。`,
      `缺失或损坏的结构会让学生看见空白关系，无法用页面组织解释。${problems.join('；')}。`,
      '按当前模板重新生成本页；模型只负责填文字，不能更改模板槽键。',
      true,
    )
  }
}

function pushConceptBuildTemplateIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'concept-build' || !scene.infoShape) continue
    const template = conceptTemplateForScene(scene)
    if (!template) {
      issue(
        issues,
        'pedagogy',
        'warning',
        'scene',
        scene.id,
        '概念页记录了尚未实现的结构形状。',
        `当前 infoShape=${scene.infoShape} 没有对应的确定性概念模板，页面只能回退普通定义页。`,
        '重新生成该页，或先为这一形状补齐结构模板、渲染器和质量检查。',
        false,
      )
      continue
    }
    const problems = conceptTemplateProblems(scene)
    if (problems.length === 0) continue
    issue(
      issues,
      'pedagogy',
      'blocking',
      'scene',
      scene.id,
      `策略页“${template.label}”结构不完整。`,
      `学生无法判断何时使用策略、怎样执行或如何确认效果。${problems.join('；')}。`,
      '按当前模板重新生成本页；模型只负责填文字，不能更改 trigger / steps / selfCheck 三个核心槽。',
      true,
    )
  }
}

/**
 * 开场和收束已有更严格的专属学习顺序检查；其余页面至少要把观察或操作转成
 * 一个可见回答，避免“学生动了界面”被误当作“学生已经理解”。
 */
function pushStudentActionEvidenceIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType === 'source-reading' || scene.sceneType === 'recap') continue
    if (studentActionLeavesEvidence(scene.studentAction)) continue

    issue(
      issues,
      'pedagogy',
      'warning',
      'scene',
      scene.id,
      STUDENT_ACTION_EVIDENCE_ISSUE_MESSAGE,
      '教师无法判断学生是否形成理解，系统记录到的也只是操作痕迹。',
      '保留观察、阅读或拖动，再要求学生说出判断、标注证据、写下理由或提交一个作品。',
      true,
    )
  }
}

function pushWorkedExampleSelfExplanationIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'worked-example') continue
    if (!studentActionLeavesEvidence(scene.studentAction)) continue
    if (workedExampleActionHasSelfExplanation(scene.studentAction)) continue

    issue(
      issues,
      'pedagogy',
      'warning',
      'scene',
      scene.id,
      WORKED_EXAMPLE_SELF_EXPLANATION_ISSUE_MESSAGE,
      '学生可能复制出正确过程，却没有形成可迁移的方法理解。',
      '展开前先预测关键一步及依据；展开后圈出一个关键步骤，用“因为…所以…”解释为什么这样做。',
      true,
    )
  }
}

function pushWorkedExampleScaffoldIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'worked-example' || !scene.kpId) continue
    const problems = workedExampleScaffoldProblems(scene)
    if (problems.length === 0) continue

    issue(
      issues,
      'pedagogy',
      'blocking',
      'scene',
      scene.id,
      WORKED_EXAMPLE_SCAFFOLD_ISSUE_MESSAGE,
      '学生只看到整道题，却被要求“补关键一步”；空缺位置与已给支架不明确，无法产生可比较的完成题作答。',
      `重新生成本页 completionPrompt：直接写出题面已经给出的信息或步骤，只留一个【待补】空缺，并要求说明依据。当前问题：${problems.join('；')}。`,
      true,
    )
  }
}

export function blockingQualityIssues(issues: readonly QualityIssue[]): QualityIssue[] {
  return issues.filter(issue => issue.severity === 'blocking')
}

export function summarizeQuality(issues: readonly QualityIssue[]): QualitySummary {
  const blocking = issues.filter(issue => issue.severity === 'blocking').length
  const warning = issues.filter(issue => issue.severity === 'warning').length
  const info = issues.filter(issue => issue.severity === 'info').length

  return {
    status: blocking > 0 ? 'blocked' : warning > 0 ? 'passed-with-warnings' : 'passed',
    blocking,
    warning,
    info,
  }
}

function pushCourseIssues(course: MainlineCourse, issues: QualityIssue[]) {
  if (!hasText(course.topic)) {
    issue(issues, 'pedagogy', 'blocking', 'course', course.id, '课程缺少主题。', '无法判断课程边界和学习目标。', '补齐 topic。', true)
  }

  if (course.sourceMaterial.length === 0) {
    issue(issues, 'pedagogy', 'blocking', 'course', course.id, '课程缺少内容来源。', '讲解会变成泛泛发挥，无法追溯教材或原文。', '补齐 sourceMaterial；有权威原文时才写入 excerpt，没有原文时明确记录目录定位。', false)
  } else {
    const placeholderSources = course.sourceMaterial.filter(source => SOURCE_PLACEHOLDER_PATTERN.test(source.excerpt ?? ''))
    if (placeholderSources.length > 0) {
      issue(issues, 'pedagogy', 'warning', 'course', course.id, `${SOURCE_PLACEHOLDER_ISSUE_PREFIX}${placeholderSources.map(source => source.title).join('、')}。`, '占位文字会被事实核查和生成模型误当成教材依据。', '删除占位 excerpt；改用 provenance 标记目录定位，查到真实摘录后再补入。', false)
    }

    const hasAuthoritativeExcerpt = course.sourceMaterial.some(source => {
      const excerpt = source.excerpt?.trim()
      if (!excerpt || SOURCE_PLACEHOLDER_PATTERN.test(excerpt)) return false
      return !source.provenance || source.provenance.evidenceStatus === 'authoritative-excerpt'
    })
    if (!hasAuthoritativeExcerpt) {
      const hasAiClue = course.sourceMaterial.some(source => source.provenance?.evidenceStatus === 'ai-extracted' && hasText(source.excerpt))
      const hasUnverifiedExcerpt = course.sourceMaterial.some(source => source.provenance?.evidenceStatus === 'unverified-excerpt' && hasText(source.excerpt))
      const hasTraceableLocation = course.sourceMaterial.some(source => Boolean(source.provenance || hasText(source.citation)))
      if (hasUnverifiedExcerpt) {
        issue(issues, 'pedagogy', 'warning', 'course', course.id, '课程包含未核验摘录，没有权威教材摘录。', '来源权威性尚未确认，不能作为教材原句或唯一事实依据。', '由教师核验来源后再标记为 authoritative-excerpt；无法核验则仅保留为备课线索。', false)
      } else if (hasAiClue) {
        issue(issues, 'pedagogy', 'warning', 'course', course.id, '课程只有 AI 提取线索，没有权威教材摘录。', '线索可能概括失真，不能作为教材原句或唯一事实依据。', '由教师对照教材复核后，写入权威摘录并把 evidenceStatus 改为 authoritative-excerpt。', false)
      } else if (hasTraceableLocation) {
        // info 而非 warning:在教材原文尚未入库的现阶段,这条对每一门课都恒定出现且
        // 教师当下无法消除(要么等原文数据集,要么手工抄录)——以 warning 常驻会把
        // TopBar/课程库的「N 警告」变成恒噪,稀释真正需要教师行动的警告(2026-08-26
        // 用户「页面中那个警告为什么一直存在」)。披露义务由 info 级原文案继续履行;
        // 可当下行动的来源警告(未核验摘录/AI 线索需核验)仍保持 warning。
        issue(issues, 'pedagogy', 'info', 'course', course.id, '课程只有教材目录定位，没有权威原文摘录。', '系统能说明知识点来自哪里，但不能据此声称某句话就是教材原文。', '生成时按学科共识表述；备课阶段补充经核验的原文或定义。', false)
      } else {
        issue(issues, 'pedagogy', 'warning', 'course', course.id, SOURCE_LOCATION_ISSUE_MESSAGE, '教师无法追溯到教材节点或可靠资料。', '补充 provenance 或 citation；不要伪造教材原文。', false)
      }
    }
  }

  if (!hasText(course.boundary)) {
    issue(issues, 'pedagogy', 'warning', 'course', course.id, '课程边界没有说明。', '生成器容易把课程做大，出现无效步骤。', '写清楚本节课不讲什么。', true)
  }

  if (!hasText(course.selectedTeacher)) {
    issue(issues, 'cast-voice-grade', 'blocking', 'course', course.id, '课程没有绑定老师。', '同一课程内角色、讲法和音色无法稳定。', '选择一个 teacher castId，并绑定 teacherSubjectProfile。', false)
  }

}

export const KP_GOAL_TRACE_ISSUE_MESSAGE = '多知识点课程的学习目标没有按知识点建立可追溯映射。'

function pushGoalIssues(course: MainlineCourse, issues: QualityIssue[]) {
  if (course.goals.length === 0) {
    issue(issues, 'pedagogy', 'blocking', 'course', course.id, '课程没有学习目标。', '无法判断讲解是否完成。', '补齐至少一个 LessonGoal。', false)
  }

  const seenGoalIds = new Set<string>()
  for (const goal of course.goals) {
    if (seenGoalIds.has(goal.id)) {
      issue(issues, 'pedagogy', 'blocking', 'goal', goal.id, `学习目标 id 重复:${goal.id}。`, '学习片段无法稳定指向唯一目标。', '为每个学习目标设置唯一 id。', false)
    }
    seenGoalIds.add(goal.id)
    if (!hasText(goal.statement)) {
      issue(issues, 'pedagogy', 'blocking', 'goal', goal.id, '学习目标缺少目标句。', '学生不知道本段要学会什么。', '补齐 statement。', true)
    }
    if (!hasText(goal.successSignal)) {
      issue(issues, 'pedagogy', 'blocking', 'goal', goal.id, '学习目标缺少成功信号。', '真实检查无法判断学生是否学会。', '补齐 successSignal。', true)
    }
    if (hasText(goal.statement) && hasText(goal.successSignal)) {
      const contractProblems = learningGoalContractProblems(goal.statement, goal.successSignal)
      for (const problem of contractProblems) {
        const severity = hasText(goal.kpId) ? 'blocking' : 'warning'
        issue(
          issues,
          'pedagogy',
          severity,
          'goal',
          goal.id,
          `学习目标不可直接检核：${problem}。`,
          '目标、课堂任务和评价证据可能各说各话，无法证明学生真正学会。',
          '改用能说出、解释、判断、计算、作图或操作等可观察行为，并让成功信号覆盖同一行为。',
          true,
        )
      }
    }
  }

  const sourceKpIds = [...new Set(course.sourceMaterial.map(source => source.kpId).filter((id): id is string => hasText(id)))]
  const tracedGoals = course.goals.filter(goal => hasText(goal.kpId))
  if (sourceKpIds.length > 1 && tracedGoals.length === 0) {
    issue(issues, 'pedagogy', 'warning', 'course', course.id, KP_GOAL_TRACE_ISSUE_MESSAGE, '无法确认每个知识点是否都有独立目标和评价证据。', '为每个知识点建立带 kpId 的独立学习目标。', false)
  }
  if (tracedGoals.length === 0) return

  const sourceKpIdSet = new Set(sourceKpIds)
  for (const goal of tracedGoals) {
    if (!sourceKpIdSet.has(goal.kpId!)) {
      issue(issues, 'pedagogy', 'blocking', 'goal', goal.id, `学习目标引用了不存在的知识点 ${goal.kpId}。`, '目标无法追溯到本课教材内容。', '修正 goal.kpId 或补齐对应 sourceMaterial。', false)
    }
  }
  for (const kpId of sourceKpIds) {
    const matches = tracedGoals.filter(goal => goal.kpId === kpId)
    if (matches.length === 0) {
      issue(issues, 'pedagogy', 'blocking', 'course', course.id, `知识点 ${kpId} 缺少独立学习目标。`, '该知识点可能被讲到,但没有明确的学习结果和评价标准。', '为该知识点补齐带相同 kpId 的 LessonGoal。', false)
    } else if (matches.length > 1) {
      issue(issues, 'pedagogy', 'blocking', 'course', course.id, `知识点 ${kpId} 绑定了多个学习目标。`, '同一知识点的达成标准不唯一,场景和评价会错绑。', '合并重复目标,每个知识点保留一个目标。', false)
    }
  }
}

function pushSkeletonIssues(course: MainlineCourse, issues: QualityIssue[]) {
  const missingChecks = QUALITY_GATES.filter(gate => !course.teachingSkeleton.requiredChecks.includes(gate))
  if (missingChecks.length > 0) {
    issue(
      issues,
      'pedagogy',
      'blocking',
      'course',
      course.id,
      `教学骨架没有覆盖质量闸门：${missingChecks.join(', ')}。`,
      '新课可能绕过画面、资产、角色或展示技术检查。',
      '把六类质量闸门全部写入 teachingSkeleton.requiredChecks。',
      true,
    )
  }

  if (course.teachingSkeleton.arc.length < 3) {
    issue(issues, 'pedagogy', 'warning', 'course', course.id, '教学骨架太短。', '课程容易变成几页提纲，讲解承接不足。', '把骨架拆成进入、建构、检查和收束。', false)
  }
}

function pushFragmentIssues(course: MainlineCourse, sceneIds: Set<string>, issues: QualityIssue[]) {
  if (course.learningFragments.length === 0) {
    issue(issues, 'pedagogy', 'blocking', 'course', course.id, '课程没有学习片段。', '无法把目标、场景和真实检查对应起来。', '补齐 learningFragments。', false)
  }

  const goalsById = new Map(course.goals.map(goal => [goal.id, goal]))
  const sourceKpIds = new Set(course.sourceMaterial.map(source => source.kpId).filter((id): id is string => hasText(id)))
  const tracedGoalIds = new Set(course.goals.filter(goal => hasText(goal.kpId)).map(goal => goal.id))
  const usedTracedGoalIds = new Set<string>()

  for (const fragment of course.learningFragments) {
    const goal = goalsById.get(fragment.goalId)
    if (!goal) {
      issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, `学习片段引用了不存在的目标 ${fragment.goalId}。`, '教学活动和评价没有可追溯目标。', '修正 goalId 或补齐对应 LessonGoal。', false)
    } else if (tracedGoalIds.has(goal.id)) {
      usedTracedGoalIds.add(goal.id)
    }
    if (!hasText(fragment.successSignal)) {
      issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, '学习片段缺少成功信号。', '无法判断这一段教学是否达成目标。', '补齐可观察、可检核的 successSignal。', true)
    }
    if (fragment.kpId && !sourceKpIds.has(fragment.kpId)) {
      issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, `学习片段引用了不存在的知识点 ${fragment.kpId}。`, '片段内容无法追溯到本课教材。', '修正 fragment.kpId 或补齐对应 sourceMaterial。', false)
    }
    if (fragment.kpId && goal?.kpId && goal.kpId !== fragment.kpId) {
      issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, `学习片段的知识点 ${fragment.kpId} 与目标知识点 ${goal.kpId} 不一致。`, '教学活动会为错误的知识点目标收集证据。', '让 fragment.goalId 指向相同 kpId 的学习目标。', false)
    }
    if (!Number.isFinite(fragment.durationTargetSec) || fragment.durationTargetSec <= 0) {
      issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, '学习片段时长无效。', '播放节奏无法控制。', '把 durationTargetSec 调整到正数。', true)
    }
    if (fragment.sceneIds.length === 0) {
      issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, '学习片段没有绑定场景。', '目标无法落到画面。', '补齐 sceneIds。', false)
    }
    for (const sceneId of fragment.sceneIds) {
      if (!sceneIds.has(sceneId)) {
        issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, `学习片段引用了不存在的场景 ${sceneId}。`, '播放会中断。', '修正 sceneIds 或补齐对应 scene。', true)
      }
    }
    const fragmentScenes = fragment.sceneIds
      .map(sceneId => course.scenes.find(scene => scene.id === sceneId))
      .filter((scene): scene is LessonScene => Boolean(scene))
    const hasCompleteSceneTiming = fragmentScenes.length === fragment.sceneIds.length
      && fragmentScenes.every(scene => scene.durationTargetSec !== undefined
        && Number.isFinite(scene.durationTargetSec)
        && scene.durationTargetSec > 0)
    if (hasCompleteSceneTiming) {
      const sceneDurationTotal = fragmentScenes.reduce((sum, scene) => sum + scene.durationTargetSec!, 0)
      if (Math.abs(fragment.durationTargetSec - sceneDurationTotal) > 0.001) {
        issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, '学习片段总时长与逐幕时长不一致。', '备课简报的课程总时长和人机分工时长会相互矛盾。', '由所属场景的 durationTargetSec 重新求和，不要单独维护片段总量。', true)
      }
    }
    if (fragment.kpId) {
      const assessmentScenes = fragmentScenes.filter(scene => ASSESSMENT_SCENE_TYPES.includes(scene.sceneType))
      if (assessmentScenes.length === 0) {
        issue(issues, 'pedagogy', 'blocking', 'fragment', fragment.id, '知识点片段缺少可检核的评价场景。', '学生可能只看过讲解,系统没有证据判断是否学会。', '加入练习、辨析、AI 验证或探究场景收集学习证据。', false)
      }

      const practiceScenes = fragmentScenes.filter(scene => scene.sceneType === 'practice')
      if (practiceScenes.length === 0) {
        const tracedGoal = Boolean(goal?.kpId)
        issue(
          issues,
          'pedagogy',
          tracedGoal ? 'blocking' : 'warning',
          'fragment',
          fragment.id,
          MISSING_PRACTICE_ISSUE_MESSAGE,
          tracedGoal
            ? '辨析、AI 找茬和探究只能暴露思路,当前课堂不会为它们保存揭晓前原答、成功标准对照和订正,因此不能证明知识点已经掌握。'
            : '这是一门缺少知识点目标映射的存量课程,现有评价页只能形成课堂观察,不能形成可追溯的掌握证据。',
          '保留形成性活动,并增加一页直接检核完整成功信号的 practice 练习。',
          false,
        )
      } else {
        const successSignal = goal?.successSignal || fragment.successSignal
        const alignments = practiceScenes
          .map(scene => ({ scene, result: practiceSceneAlignment(successSignal, scene) }))
          .filter(item => item.result.inspectable && item.result.expected.length > 0)
        const aligned = alignments.some(item => item.result.missing.length === 0)
        if (alignments.length > 0 && !aligned) {
          const closest = [...alignments].sort((left, right) => left.result.missing.length - right.result.missing.length)[0]!
          const missing = closest.result.missing.map(kind => ASSESSMENT_ACTION_LABELS[kind]).join('、')
          issue(
            issues,
            'pedagogy',
            goal?.kpId ? 'blocking' : 'warning',
            'scene',
            closest.scene.id,
            PRACTICE_ALIGNMENT_ISSUE_MESSAGE,
            `成功信号要求学生完成“${missing}”,但首次作答页没有要求这些行为;学生即使完成当前任务,也不能据此判定达标。`,
            '重写 task 与 studentAction,让同一页直接收集成功信号要求的全部行为证据,不要用更窄的子技能替代。',
            false,
          )
        }
      }
    }
  }

  for (const goalId of tracedGoalIds) {
    if (!usedTracedGoalIds.has(goalId)) {
      issue(issues, 'pedagogy', 'blocking', 'goal', goalId, '按知识点建立的学习目标没有对应学习片段。', '目标没有教学活动和评价场景承接。', '为该目标建立同 kpId 的学习片段。', false)
    }
  }
}

function pushCastAndVoiceIssues(
  course: MainlineCourse,
  castById: Map<string, CastProfile>,
  voiceCastIds: Set<string>,
  issues: QualityIssue[],
) {
  const seenCastIds = new Set<string>()
  for (const cast of course.castProfiles) {
    if (!hasText(cast.id)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'cast', course.id, '课程存在没有 id 的卡司。', '场景、音色和角色资产都无法稳定引用这个角色。', '为每个卡司设置非空且唯一的 id。', false)
      continue
    }
    if (seenCastIds.has(cast.id)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'cast', cast.id, `卡司 id 重复：${cast.id}。`, '同一个引用可能解析到不同角色，导致立绘、身份和声线随数组顺序错位。', '为重复卡司分配不同 id，并同步场景和音色引用。', false)
    }
    seenCastIds.add(cast.id)
  }

  const seenVoiceCastIds = new Set<string>()
  for (const voice of course.voiceProfiles) {
    if (!hasText(voice.castId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'course', course.id, '课程存在没有 castId 的音色配置。', '系统无法判断该声线属于哪个角色。', '为音色配置补齐有效 castId。', false)
      continue
    }
    if (seenVoiceCastIds.has(voice.castId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'cast', voice.castId, `角色 ${voice.castId} 绑定了多个音色配置。`, '运行时只能取到其中一个配置，实际声线会依赖数组顺序。', '每个角色只保留一个 voiceProfile。', false)
    }
    seenVoiceCastIds.add(voice.castId)

    if (!castById.has(voice.castId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'cast', voice.castId, `音色配置引用了不存在的角色 ${voice.castId}。`, '运行时无法判断角色身份和学段，可能错误回退为老师声线。', '删除孤立音色，或补齐对应 castProfiles 条目。', false)
    }
    if (!hasText(voice.voiceId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'cast', voice.castId, `角色 ${voice.castId} 的音色 ID 为空。`, '字段虽然存在，但语音服务没有可调用的实际声线。', '填写内置音色 ID，或填写已在服务端白名单登记的自定义音色 ID。', false)
    }
  }

  const selectedTeacher = castById.get(course.selectedTeacher)
  if (!selectedTeacher || selectedTeacher.role !== 'teacher') {
    issue(issues, 'cast-voice-grade', 'blocking', 'course', course.id, 'selectedTeacher 没有指向老师角色。', '老师身份和声音无法稳定。', '把 selectedTeacher 指向 role=teacher 的 castProfile。', false)
  }

  const peer = castById.get(course.peerRoleProfile.peerId)
  if (!peer || (peer.role !== 'student' && peer.role !== 'peer')) {
    issue(issues, 'cast-voice-grade', 'blocking', 'course', course.id, 'peerRoleProfile 没有指向同学角色。', '课堂中的提问、尝试和误区可能由错误身份的角色承担。', '把 peerRoleProfile.peerId 指向 role=student 或 role=peer 的 castProfile。', false)
  }

  // 只检查真实进入本课教学的卡司：主讲老师、同学、场景立绘和发声角色。
  // 闲置资产可以保留跨学科适配范围，但实际登场角色必须明确覆盖本课学段与学科。
  // 旧规则只给老师一个 warning，且完全漏掉同学与逐幕角色，导致 2026-08-21
  // 真库 16 门课中 11 门仍可让文学老师或低年级同学进入数理化等课堂。
  const activeCastIds = new Set<string>([course.selectedTeacher, course.peerRoleProfile.peerId])
  for (const scene of course.scenes) {
    if (hasText(scene.characterLayer.castId)) activeCastIds.add(scene.characterLayer.castId!.trim())
    if (hasText(scene.voiceCue.castId)) activeCastIds.add(scene.voiceCue.castId!.trim())
  }
  for (const castId of activeCastIds) {
    const cast = castById.get(castId)
    if (!cast) continue
    if (!cast.gradeFit.includes(course.gradeBand)) {
      issue(
        issues,
        'cast-voice-grade',
        'blocking',
        'cast',
        cast.id,
        `实际教学角色「${cast.displayName}」的学段档案(${cast.gradeFit.join('/') || '空'})不含本课学段 ${course.gradeBand}。`,
        '角色身份、语言成熟度和课堂互动方式与目标学生不匹配。',
        '换用 gradeFit 覆盖本学段的卡司，或在生成期按本课学段重建角色档案；不能只复用样板课人设。',
        false,
      )
    }
    if (!cast.subjectFit.includes(course.subject)) {
      issue(
        issues,
        'cast-voice-grade',
        'blocking',
        'cast',
        cast.id,
        `实际教学角色「${cast.displayName}」的学科档案(${cast.subjectFit.join('/') || '空'})不含本课学科 ${course.subject}。`,
        '角色会带着错误学科身份、板书习惯或提问方式进入课堂。',
        '换用 subjectFit 覆盖本学科的卡司，或在生成期只借立绘资产并按本课学科重建身份与角色边界。',
        false,
      )
    }
  }

  if (course.teacherSubjectProfile.teacherId !== course.selectedTeacher) {
    issue(issues, 'cast-voice-grade', 'blocking', 'course', course.id, '老师科目档案和当前老师不一致。', '可能出现老师造型、讲法和音色错配。', '同步 teacherSubjectProfile.teacherId 与 selectedTeacher。', true)
  }

  if (course.teacherSubjectProfile.subject !== course.subject) {
    issue(issues, 'cast-voice-grade', 'blocking', 'course', course.id, '老师科目档案和课程学科不一致。', '同一老师会用错学科讲法。', '同步 teacherSubjectProfile.subject 与 course.subject。', true)
  }

  if (course.gradeAdaptationProfile.gradeBand !== course.gradeBand) {
    issue(issues, 'cast-voice-grade', 'blocking', 'course', course.id, '年级适配档案和课程年级不一致。', '语言密度、语速和角色成熟度会偏离目标学生。', '同步 gradeAdaptationProfile.gradeBand。', true)
  }

  for (const cast of course.castProfiles) {
    if (!voiceCastIds.has(cast.id)) {
      issue(issues, 'cast-voice-grade', cast.role === 'teacher' ? 'blocking' : 'warning', 'cast', cast.id, `${cast.displayName} 没有绑定音色。`, '角色发声时可能随机换声或降级成旁白。', '补齐 voiceProfiles。', false)
    }

    if (cast.role === 'teacher') {
      if (cast.expressionSet.length < 4) {
        issue(issues, 'asset', 'blocking', 'cast', cast.id, `${cast.displayName} 的老师表情不足。`, '老师讲解、追问、鼓励和纠错无法稳定演出。', '至少补齐基础、思考、强调、鼓励或疑问等表情。', false)
      }
      if (!cast.assetRefs || cast.assetRefs.length < 4) {
        issue(issues, 'asset', 'blocking', 'cast', cast.id, `${cast.displayName} 缺少多表情立绘资产。`, '页面只能换文字，老师形象无法承担教学表演。', '为老师绑定至少 4 张半身透明立绘。', false)
      }
    }

    if (cast.assetRefs?.some(asset => asset.kind !== 'fallback-symbol' && !asset.transparentBackground)) {
      issue(issues, 'asset', 'blocking', 'cast', cast.id, `${cast.displayName} 存在非透明底角色资产。`, '立绘会像贴纸一样盖在教学画面上。', '替换为透明背景 cutout 资产。', false)
    }
  }
}

function pushSceneIssues(
  course: MainlineCourse,
  castById: Map<string, CastProfile>,
  voiceCastIds: Set<string>,
  issues: QualityIssue[],
) {
  const sceneBeatCounts = new Map<string, number>()
  for (const beat of course.beats) {
    sceneBeatCounts.set(beat.sceneId, (sceneBeatCounts.get(beat.sceneId) ?? 0) + 1)
  }

  for (const scene of course.scenes) {
    if (scene.durationTargetSec !== undefined) {
      if (!Number.isFinite(scene.durationTargetSec) || scene.durationTargetSec <= 0) {
        issue(issues, 'pedagogy', 'blocking', 'scene', scene.id, '单幕时长无效。', '备课简报和授课节奏无法可靠计算。', '把 scene.durationTargetSec 调整到正数。', true)
      } else if (scene.durationTargetSec > SCENE_DURATION_WARNING_SEC) {
        issue(issues, 'pedagogy', 'warning', 'scene', scene.id, '单幕节奏过长。', '学生需要在同一画面和主要教学动作中连续停留超过 60 秒，容易挤压观察、思考或作答。', '把本页拆成两个递进教学动作，或减少本页同时处理的误区和证据。', false)
      }
    }

    for (const field of REQUIRED_SCENE_FIELDS) {
      if (isMissingSceneField(scene, field)) {
        issue(issues, gateForSceneField(field), 'blocking', 'scene', scene.id, `场景缺少 ${field}。`, '正式上课无法保证画面、讲解、角色和板书同步。', `补齐 scene.${field}。`, true)
      }
    }

    if (Object.keys(scene.contentSlots).length === 0) {
      issue(issues, 'visual', 'blocking', 'scene', scene.id, '场景没有内容槽。', '画面只能靠临时文字堆叠，无法形成稳定版式。', '把原文、图示、板书或证据放入 contentSlots。', false)
    }

    const technique = SCENE_TECHNIQUE_REGISTRY[scene.sceneTechnique]
    if (!(technique.supportedSceneTypes as readonly SceneType[]).includes(scene.sceneType)) {
      issue(issues, 'technique', 'blocking', 'scene', scene.id, `${technique.label} 不适合 ${scene.sceneType} 场景。`, '展示技术和教学动作错配，会变成装饰。', '换成该 sceneType 支持的 SceneTechnique。', false)
    }

    if (technique.interactionDemand === 'required' && scene.interactionContract.length < 20) {
      issue(issues, 'technique', 'blocking', 'scene', scene.id, `${technique.label} 需要明确互动契约。`, '学生不知道要操作什么，真实检查无法判断交互是否顺畅。', '补齐可操作对象、反馈方式和降级说明。', false)
    }

    if (isContentDense(scene) && !CONTENT_DENSE_LAYOUTS.includes(scene.dialogueLayout)) {
      issue(issues, 'visual', 'blocking', 'scene', scene.id, '内容密集场景仍使用大角色对白版式。', '原文、题干、图表或公式会被角色和对白压住。', '降级为 corner-avatar、narration-only 或 no-character。', true)
    }

    // 无图幕(不在配图白名单、无 imageUrl、也无 typed 结构可视槽)的文本不得指图——"说看图却没图"是课堂事故
    const hasStructuredVisual = hasStructuredVisualFor(scene)
    if (!scene.imageUrl && !IMAGE_SCENE_TYPES.includes(scene.sceneType) && !hasStructuredVisual) {
      const spokenAndShown = stripPlannedTasks([scene.visualFocus, scene.teacherScript, ...scene.boardText].join(' '))
      if (IMAGE_DEIXIS_PATTERN.test(spokenAndShown) || IMAGE_NAME_FOCUS_PATTERN.test(scene.visualFocus)) {
        issue(issues, 'visual', 'blocking', 'scene', scene.id, '无图幕的文本在指图。', '学生被要求看一张不存在的图,教学承诺当场落空。', '改写 visualFocus/讲稿/板书去掉指图表述,或把该内容移入配图幕型。', true)
      }
    }

    // 跨页页码指路必然失准:页序动态展开,幕号≠投影页号,「幕」还是学生看不见的内部概念
    {
      const studentTexts = [
        scene.visualFocus,
        scene.teacherScript,
        ...scene.boardText,
        ...Object.entries(scene.contentSlots).filter(([key]) => !key.startsWith('__')).map(([, value]) => value),
      ].join(' ')
      const actPointer = course.subject !== 'chinese' && CROSS_ACT_POINTER_PATTERN.test(studentTexts)
      if (CROSS_PAGE_POINTER_PATTERN.test(studentTexts) || actPointer) {
        issue(issues, 'pedagogy', 'blocking', 'scene', scene.id, '学生可见文本在跨页指路。', '「回第X幕/见第X页」式引用随页序展开必然指错位置,学生会被支去找不存在的内容。', '把被引用的要点直接复述在本页,让每页证据自足;删除页码/幕号引用。', true)
      }
    }

    if (scene.characterLayer.layout !== scene.dialogueLayout) {
      issue(issues, 'performance', 'warning', 'scene', scene.id, 'characterLayer.layout 与 dialogueLayout 不一致。', '角色层和对白层可能各自跳位置。', '保持两者一致，或在 positionRule 中说明切换条件。', true)
    }

    if (scene.characterLayer.castId && !castById.has(scene.characterLayer.castId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'scene', scene.id, `场景引用了不存在的角色 ${scene.characterLayer.castId}。`, '角色立绘和音色无法加载。', '修正 characterLayer.castId。', true)
    }

    if (!hasText(scene.voiceCue.castId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'scene', scene.id, '场景声音没有指定发声角色。', '系统无法确定应该使用老师、同学还是旁白声线。', '补齐 voiceCue.castId，并确保对应卡司和音色配置存在。', true)
    } else if (!castById.has(scene.voiceCue.castId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'scene', scene.id, `场景声音引用了不存在的角色 ${scene.voiceCue.castId}。`, '即使存在同名音色配置，运行时也无法判断角色身份，可能错误回退为老师声线。', '补齐 castProfiles，或把 voiceCue.castId 改为现有角色。', true)
    } else if (!voiceCastIds.has(scene.voiceCue.castId)) {
      issue(issues, 'cast-voice-grade', 'blocking', 'scene', scene.id, `场景声音引用的角色 ${scene.voiceCue.castId} 没有音色。`, '同一角色会随机换声或无法发声。', '补齐 voiceProfiles。', false)
    }

    const scriptLoad = teacherScriptLoadFor(course, scene)
    if (scriptLoad.estimatedSpeechSec < 12) {
      issue(issues, 'pedagogy', 'warning', 'scene', scene.id, '老师讲解过短。', '课堂会像读提纲，学生得不到必要解释。', '补成能解释观察、判断、误区和收束的讲解稿。', false)
    }

    if (scriptLoad.overBudget) {
      const speechSeconds = Math.ceil(scriptLoad.estimatedSpeechSec)
      const budgetSeconds = Math.floor(scriptLoad.speechBudgetSec)
      const isExplicit = scriptLoad.durationSource === 'scene'
      issue(
        issues,
        'pedagogy',
        'warning',
        'scene',
        scene.id,
        isExplicit ? '讲稿挤占学生作答时间。' : '单页讲稿超过整页时长。',
        isExplicit
          ? `口语化后预计讲 ${speechSeconds} 秒；本页 ${Math.round(scriptLoad.sceneDurationSec)} 秒中至少要给学生保留 ${Math.ceil(scriptLoad.reservedStudentSec)} 秒，讲解最多约 ${budgetSeconds} 秒。`
          : `口语化后预计讲 ${speechSeconds} 秒，已超过按片段均摊估算的整页 ${Math.round(scriptLoad.sceneDurationSec)} 秒；即使不留学生回应也放不下。`,
        '定位本页并使用重新生成，系统会按本页时长压缩为“短讲—提问—学生回应”；若确有两个教学动作，再拆成两页。',
        true,
      )
    }

    if (!scene.teacherScript.includes(scene.narrationAnchor)) {
      issue(issues, 'pedagogy', 'warning', 'scene', scene.id, '讲稿没有明确说到当前讲解锚点。', '画面和讲解容易断开。', '把 narrationAnchor 写进讲解或改成讲稿真实锚点。', true)
    }

    // 方向二内容形态契约:讲稿是口语文本,会被 TTS 朗读并上字幕带——LaTeX 标记
    // 会被原样读出/显示(真检实证:字幕带露出「\(F_0\)」源码)
    if (/\\\(|\\\[|\\frac|\\times|\\sqrt/.test(scene.teacherScript)) {
      issue(issues, 'pedagogy', 'warning', 'scene', scene.id, '讲稿(teacherScript)含 LaTeX 标记。', 'TTS 会把「\\(…\\)」当文字读出,字幕带露出源码。', '讲稿里公式改自然语言读法(如「n 平方加 n 加 41」),LaTeX 只进 contentSlots/boardText。', false)
    }

    if ((sceneBeatCounts.get(scene.id) ?? 0) === 0) {
      issue(issues, 'performance', 'blocking', 'scene', scene.id, '场景没有任何 beat。', '长时间讲解时画面不会变化。', '为场景补 reveal、point、ask、react 或 wait beat。', false)
    }
  }
}

function pushBeatIssues(course: MainlineCourse, sceneIds: Set<string>, issues: QualityIssue[]) {
  for (const beat of course.beats) {
    if (!sceneIds.has(beat.sceneId)) {
      issue(issues, 'performance', 'blocking', 'beat', beat.id, `beat 引用了不存在的场景 ${beat.sceneId}。`, '播放流程会中断。', '修正 beat.sceneId。', true)
    }
    if (beat.durationMs !== undefined && beat.durationMs < 0) {
      issue(issues, 'performance', 'blocking', 'beat', beat.id, 'beat 时长为负数。', '播放状态机会异常。', '把 durationMs 调整为非负数。', true)
    }
  }
}

const DEDICATED_PRESENTATION_SCENE_TYPES = new Set<SceneType>([
  'source-reading',
  'visual-observation',
  'concept-build',
  'contrast',
  'worked-example',
  'practice',
  'recap',
  'ai-verify',
  'ai-inquiry',
  'ai-collab',
])

function presentationFamily(scene: LessonScene): string {
  // 这些幕型在 SceneTechniqueView 中先按 sceneType 进入独立渲染器，
  // sceneTechnique 只是讲解元数据，不能再拿它冒充实际页面形态。
  return DEDICATED_PRESENTATION_SCENE_TYPES.has(scene.sceneType)
    ? `scene:${scene.sceneType}`
    : `technique:${scene.sceneTechnique}`
}

function pushCourseShapeIssues(course: MainlineCourse, issues: QualityIssue[]) {
  const layouts = new Set(course.scenes.map(scene => scene.dialogueLayout))
  if (course.scenes.length >= 4 && layouts.size < 2) {
    issue(issues, 'visual', 'blocking', 'course', course.id, '整节课只有一种对白 / 角色版式。', '不同内容类型会被同一种 UI 压住，课程显得机械重复。', '至少加入内容全屏、教师侧讲、学生提问或角落头像中的另一种版式。', false)
  }

  const presentationFamilies = new Set(course.scenes.map(presentationFamily))
  if (course.scenes.length >= 4 && presentationFamilies.size < 3) {
    issue(issues, 'technique', 'warning', 'course', course.id, '整节课实际呈现形态变化不足。', '学生可能感觉每页结构相同，画面和讲解关系不够清楚。', '按内容需要加入不同幕型或真正不同的局部放大、路径追踪、步骤回放等呈现形态。', false)
  }
}

/** 走学段学科路由的幕型(与 master-routing.ts RoutedSceneType 同源)。 */
const ROUTED_SCENE_TYPES: readonly RoutedSceneType[] = ['source-reading', 'concept-build', 'worked-example', 'practice', 'recap', 'contrast', 'ai-collab']

/**
 * 构图母版撞车检查(2026-07-22 学段学科表现路由配套):此前反同质化只数
 * dialogueLayout/sceneTechnique,母版层撞车零暴露。路由的加权哈希允许倾斜,
 * 但同幕型 ≥3 幕全部落进同一母版意味着「同课仍有真实形态差异」的承诺失效
 * (ai-verify 清单式锁死教训的母版版),warning 显式暴露,不拦流程。
 */
function pushMasterRoutingIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const sceneType of ROUTED_SCENE_TYPES) {
    const scenes = course.scenes.filter(scene => scene.sceneType === sceneType)
    if (scenes.length < 3) continue
    const masters = new Set(scenes.map(scene => pickMasterRouted(course, scene, sceneType)))
    if (masters.size === 1) {
      issue(issues, 'visual', 'warning', 'course', course.id, `幕型 ${sceneType} 共 ${scenes.length} 幕全部命中同一构图母版(#${[...masters][0]})。`, '同款母版连撞使整课该幕型呈现清一色,学段学科路由承诺的同课形态差异失效。', '哈希撞车所致:检查该学段学科下权重是否过度集中,或扩充该幕型母版池。', false)
    }
  }
}

/**
 * v4 M1 教研资产闸门(docs/v4-master-plan-2026-07-13.md §3.1):
 * - 学段语气禁词:低幼称呼/低段抽象术语等,严重级别由词条自带;
 * - 错误讲法:命中误概念库 bannedPhrasings 即 blocking——错误讲法出现在讲稿/板书里
 *   是事实事故,不是风格问题。辨析幕整幕豁免:它的职责就是把误区摆出来再纠正。
 */
function pushPedagogyRegistryIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    const text = [scene.teacherScript, ...scene.boardText, ...Object.values(scene.contentSlots)].join(' ')

    for (const v of findToneViolations(text, course.gradeBand)) {
      issue(issues, 'cast-voice-grade', v.severity, 'scene', scene.id, `学段语气违规:出现「${v.phrase}」。`, `${v.reason};目标学段学生会出戏或听不懂。`, '按学段语气契约改写该表述。', true)
    }

    if (scene.sceneType === 'contrast') continue
    for (const v of findBannedPhrasings(text, course.subject)) {
      issue(issues, 'pedagogy', 'blocking', 'scene', scene.id, `错误讲法命中误概念库 ${v.entryId}。`, v.risk, '按误概念库修正指引重写;若确需讨论该误区,移入辨析幕。', false)
    }
  }
}

/**
 * v4 M2 剧情护栏(宪法级,docs/v4-master-plan-2026-07-13.md §3.2):
 * 剧情不得抢内容主体——下集钩子只许出现在 recap 幕,且字数受预算约束。
 */
function pushSeasonGuardIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    const hook = scene.contentSlots[SERIAL_HOOK_SLOT]
    if (!hook) continue
    if (scene.sceneType !== 'recap') {
      issue(issues, 'pedagogy', 'blocking', 'scene', scene.id, '下集钩子出现在非收束幕。', '剧情侵入教学主体,违反「剧情只在开场承接/结尾钩子」的宪法护栏。', `删除本幕 contentSlots.${SERIAL_HOOK_SLOT},钩子只属于 recap 幕。`, true)
    }
    if (hook.length > SERIAL_HOOK_MAX) {
      issue(issues, 'pedagogy', 'blocking', 'scene', scene.id, `下集钩子超出预算(${hook.length} > ${SERIAL_HOOK_MAX} 字)。`, '剧情文字挤占收束幕的教学沉淀空间。', `把钩子压缩到 ${SERIAL_HOOK_MAX} 字以内,只留一句悬念。`, true)
    }
  }
}

/**
 * v5 M2 ai-verify 溯源闸门(blocking,docs/v5-master-plan-2026-07-20.md §10.5 缺口 1),
 * v5 骨架去重合并后扩展为逐条校验:
 * AI 找茬幕的错误说法必须可溯源到该 KP 的 misconceptions 标注原文
 * (misconceptionSourcesOf(scene) 统一读取单条/合并态,生成期写入,fill-scenes
 * 不覆写)——禁止 LLM 自由编造错误,错误内容也要有教研背书。合并幕(sources.length
 * >1)逐条校验:优先用该条对应的 aiClaimN 细分槽做重合度判断，缺细分槽时只退回
 * 合并粗槽 aiClaim。揭底和讲稿即使引用了原文，也不能替错误说法冒充有溯源；学生
 * 首次看到的 claim 本身必须受约束。用确定性的字符双元组重合度判断“改写后是否
 * 还是那句错误”，不烧第二次 LLM 去做语义判断。
 */
function pushAiVerifyIssues(course: MainlineCourse, issues: QualityIssue[]) {
  for (const scene of course.scenes) {
    if (scene.sceneType !== 'ai-verify') continue
    const sources = misconceptionSourcesOf(scene).map(s => s.trim()).filter(Boolean)
    if (sources.length === 0) {
      issue(issues, 'pedagogy', 'blocking', 'scene', scene.id, 'AI 找茬幕缺少误区溯源(misconceptionSource)。', 'AI 的错误说法没有教研背书,可能是自由编造的错误。', '重新展开本片段骨架,确保 ai-verify 幕携带对应 KP 的 misconceptions 标注原文。', false)
      continue
    }

    const pairs = aiVerifyPairs(scene)
    if (sources.length > 1) {
      const missingSlots = sources.flatMap((_, index) => {
        const pairNumber = index + 1
        return [`aiClaim${pairNumber}`, `reveal${pairNumber}`]
          .filter(key => !scene.contentSlots[key]?.trim())
      })
      if (missingSlots.length > 0) {
        issue(
          issues,
          'pedagogy',
          'blocking',
          'scene',
          scene.id,
          `多误区 AI 找茬幕缺少逐条内容槽：${missingSlots.join('、')}。`,
          '多条误区被迫回退到同一段粗文本，学生无法逐条判断，核查结论也无法和原说法一一对应。',
          '按 misconceptionSources 顺序补齐每一组 aiClaimN 与 revealN；每组只处理一条误区。',
          true,
        )
      }
    }

    sources.forEach((source, index) => {
      const pair = pairs[index]
      const overlap = aiVerifyTextOverlapRatio(source, pair?.claim ?? '')
      if (overlap >= AI_VERIFY_OVERLAP_THRESHOLD) return

      const locator = sources.length === 1 ? '' : `第 ${index + 1}/${sources.length} 处误区`
      issue(
        issues, 'pedagogy', 'blocking', 'scene', scene.id,
        `AI 找茬幕${locator}的说法与教材标注误区原文重合度过低,疑似 LLM 自由编造错误。`,
        '错误内容失去教研背书,可能教出真实不存在的误区。',
        sources.length === 1
          ? `重新生成本幕,aiClaim 必须紧扣误区原文「${source}」改写,不得替换成其他错误。`
          : `重新生成本幕,第 ${index + 1} 处错误(aiClaim${index + 1} 或合并 aiClaim 里对应部分)必须紧扣误区原文「${source}」改写,不得替换成其他错误。`,
        false,
      )
    })
  }
}

const EXECUTOR_LABEL: Record<Executor, string> = { teacher: '教师', ai: 'AI', co: '教师+AI 协同' }

/**
 * v5 M2 executor 分工观察(info,不阻断):全课清一色 teacher 或清一色 ai 时提示
 * "这节课没有用到双师分工"。只做观察,不拦流程——是否分工是教研/教师的判断,
 * 闸门不越权拍板(设计草案 §1)。
 */
function pushExecutorMixIssues(course: MainlineCourse, issues: QualityIssue[]) {
  if (course.scenes.length === 0) return
  const executors = new Set(course.scenes.map(s => sceneExecutor(s)))
  if (executors.size === 1) {
    const only = [...executors][0]!
    issue(issues, 'pedagogy', 'info', 'course', course.id, `这节课全部幕都是「${EXECUTOR_LABEL[only]}」执教,没有用到双师人机分工。`, '教师侧的掌控感与 AI 素养弧线在这节课不成立。', '按需把部分幕的 executor 改为 teacher/co,体现人机分工(工作台可逐页调整)。', false)
  }
}

function isMissingSceneField(scene: LessonScene, field: (typeof REQUIRED_SCENE_FIELDS)[number]): boolean {
  const value = scene[field]
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'string') return !hasText(value)
  if (typeof value === 'object' && value !== null) return Object.keys(value).length === 0
  return value === undefined || value === null
}

function gateForSceneField(field: (typeof REQUIRED_SCENE_FIELDS)[number]): QualityGateId {
  if (field === 'characterLayer' || field === 'dialogueLayout' || field === 'voiceCue') return 'performance'
  if (field === 'peerFunction' || field === 'gradeTone' || field === 'subjectTeachingMode') return 'cast-voice-grade'
  if (field === 'sceneTechnique' || field === 'interactionContract' || field === 'fallbackPresentation') return 'technique'
  if (field === 'visualFocus' || field === 'syncStrategy' || field === 'boardText' || field === 'evidenceOnScreen') return 'visual'
  return 'pedagogy'
}

function isContentDense(scene: LessonScene): boolean {
  const slotTextLength = Object.values(scene.contentSlots).join('').length
  const boardTextLength = scene.boardText.join('').length
  return (
    scene.sceneType === 'source-reading' ||
    scene.sceneType === 'worked-example' ||
    slotTextLength > 120 ||
    boardTextLength > 80
  )
}

function hasText(value: string | undefined): value is string {
  return Boolean(value && value.trim().length > 0)
}

function issue(
  issues: QualityIssue[],
  gate: QualityGateId,
  severity: QualitySeverity,
  targetType: QualityTargetType,
  targetId: string,
  message: string,
  impact: string,
  fix: string,
  autoFixable: boolean,
) {
  issues.push({
    id: `${gate}:${targetType}:${targetId}:${issues.length + 1}`,
    gate,
    severity,
    targetType,
    targetId,
    message,
    impact,
    fix,
    autoFixable,
  })
}
