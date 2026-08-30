/**
 * compile-lesson · P2 骨架编译层(不烧 LLM)
 *
 * 输入 KP 元数据 + 卡司预设,输出结构完整的空骨架 MainlineCourse。
 *
 * 设计原则:
 * - **骨架驱动,幕数随内容伸缩**(设计 Step 2「定骨架」):课程 = 开场(source-reading)
 *   + 每个 KP 按其认知类型从 skeleton-library 展开一个 LearningFragment(2-3 幕)
 *   + 收束(recap)。单 factual KP 简单课 4 幕,3 个混合 KP 约 9-11 幕。
 * - 骨架选择只用 KP 的显式 knowledgeType 标注,无关键词/正则定型。
 * - 每 scene 的 dialogueLayout / sceneTechnique 组合已避开所有 blocking 闸门;
 *   内容密集幕(source-reading / worked-example)版式强制降级。
 * - contentSlots / teacherScript 用 KP 名建立结构占位；sourceMaterial 只写实际查到的
 *   来源定位和摘录，绝不把「待 LLM 填充」冒充教材原文。LLM 填槽(fill-scenes)
 *   负责把课堂内容做丰满。KP 带教材标注误区时,辨析幕的 misconception 槽
 *   直接以标注内容起底,fill-scenes 在其上润色而非凭空编造。
 * - 全课最多 1 个 ask 节拍,保持低交互契约。
 * - qualityStatus 初始 'draft',让 UI 上课路由知道这门课还没到 passed。
 */

import { randomUUID } from 'node:crypto'
import type {
  GradeBand,
  LessonPhase,
  LessonBeat,
  LessonScene,
  LearningFragment,
  LessonGoal,
  MainlineCourse,
  SourceMaterialGrounding,
  SourceMaterialRef,
  SubjectId,
} from '../domain.js'
import { runtimeSceneContractFor } from '../runtime-interaction.js'
import { lessonOpeningCopy } from '../lesson-phase.js'
import { conceptSeedContentSlots, selectConceptBuildTemplate } from '../concept-template.js'
import { recapSeedContentSlots, selectRecapTemplate } from '../recap-template.js'
import { selectObservableObjective, successSignalFromObjective } from '../learning-goal-contract.js'
import { assertValidCoursePlanningState } from '../planning/page-audit.js'
import { buildCoursePlanningState } from '../planning/page-first-planner.js'
import { subjectMode, type CastPreset } from './cast-preset.js'
import { planSkeleton, type FragmentSkeleton, type FragmentSkeletonStep, type SkeletonKpInput } from './skeleton-library.js'

const COURSE_LEVEL_SCENE_DURATION_SEC = 60

export interface CompileLessonInput {
  kps: SkeletonKpInput[]
  gradeBand: GradeBand
  subject: SubjectId
  preset: CastPreset
  courseId?: string
  groundingByKp?: Readonly<Record<string, SourceMaterialGrounding>>
  lessonPhase?: LessonPhase
}

export function compileLessonFromKps(input: CompileLessonInput): MainlineCourse {
  const { kps, gradeBand, subject, preset } = input
  if (kps.length === 0) throw new Error('compileLessonFromKps: kps 不能为空')

  const courseId = input.courseId ?? randomUUID()
  const kpNames = kps.map(k => k.canonicalName)
  const kpTextBlock = kpNames.join('、')
  const studentCastId = preset.peerRoleProfile.peerId
  const teacherCastId = preset.selectedTeacher

  const sourceMaterial: SourceMaterialRef[] = kps.map(kp => ({
    kind: 'textbook',
    title: kp.canonicalName,
    kpId: kp.id,
    ...(input.groundingByKp?.[kp.id] ?? {}),
  }))

  const plan = planSkeleton(kps, courseId)
  const goals: LessonGoal[] = plan.fragments.map(({ kp, skeleton }, index) => {
    const goal = defaultGoal(kp, skeleton)
    return {
      id: `goal-kp-${String(index + 1).padStart(2, '0')}`,
      kpId: kp.id,
      ...goal,
      nonGoals: ['不要求扩展相邻概念'],
    }
  })
  const topic = lessonTopic(kps, goals, kpTextBlock)
  const planning = buildCoursePlanningState({
    courseId,
    topic,
    subject,
    goals,
    kps,
    sourceMaterial,
  })
  assertValidCoursePlanningState(planning)

  const base: SceneBaseInput = {
    topic,
    kpTextBlock,
    teacherCastId,
    studentCastId,
    subject,
    ...(input.lessonPhase ? { lessonPhase: input.lessonPhase } : {}),
  }

  const scenes: LessonScene[] = []
  const learningFragments: LearningFragment[] = []
  let sceneSeq = 0
  const nextSceneId = (sceneType: string) => `p2-${String(++sceneSeq).padStart(2, '0')}-${sceneType}`

  const introScene = {
    ...buildSourceReadingScene(base, nextSceneId('source-reading')),
    durationTargetSec: COURSE_LEVEL_SCENE_DURATION_SEC,
  }
  scenes.push(introScene)
  learningFragments.push({
    id: 'fragment-intro',
    goalId: goals[0]!.id,
    durationTargetSec: COURSE_LEVEL_SCENE_DURATION_SEC,
    sceneIds: [introScene.id],
    successSignal: `学生完整看到 ${kpTextBlock} 是本课主线。`,
  })

  for (const [index, fragment] of plan.fragments.entries()) {
    const kp = fragment.kp
    // 辨析幕是每个片段唯一的立绘幕;多片段按序左右轮换,破除同侧重复
    const fragmentScenes = buildFragmentScenes(kp, fragment.skeleton, base, nextSceneId, index % 2 === 0 ? 'left' : 'right')
    scenes.push(...fragmentScenes)
    learningFragments.push({
      id: `fragment-kp-${String(index + 1).padStart(2, '0')}`,
      goalId: goals[index]!.id,
      durationTargetSec: fragment.skeleton.durationTargetSec,
      sceneIds: fragmentScenes.map(s => s.id),
      successSignal: fragment.skeleton.successSignalTemplate(kp.canonicalName),
      kpId: kp.id,
      skeletonId: fragment.skeleton.id,
    })
  }

  const recapTemplate = selectRecapTemplate(kps)
  const recapScene = {
    ...buildRecapScene(base, nextSceneId('recap'), kps),
    durationTargetSec: COURSE_LEVEL_SCENE_DURATION_SEC,
  }
  scenes.push(recapScene)
  learningFragments.push({
    id: 'fragment-recap',
    goalId: goals[0]!.id,
    durationTargetSec: COURSE_LEVEL_SCENE_DURATION_SEC,
    sceneIds: [recapScene.id],
    successSignal: recapTemplate.successSignal,
  })
  const beats: LessonBeat[] = buildBeats(scenes)

  return {
    id: courseId,
    topic,
    audience: `${gradeBandLabel(gradeBand)},已有基本学习习惯,首次接触本课知识点`,
    gradeBand,
    subject,
    sourceMaterial,
    goals,
    boundary: `本课只解决${topic}的初步理解；不做刷题拓展，不引入相邻单元。`,
    selectedTeacher: preset.selectedTeacher,
    teacherSubjectProfile: preset.teacherSubjectProfile,
    peerRoleProfile: preset.peerRoleProfile,
    castProfiles: preset.castProfiles,
    voiceProfiles: preset.voiceProfiles,
    gradeAdaptationProfile: preset.gradeAdaptationProfile,
    teachingSkeleton: plan.skeleton,
    learningFragments,
    scenes,
    beats,
    planning,
    qualityStatus: 'draft',
    ...(input.lessonPhase ? { lessonPhase: input.lessonPhase } : {}),
  }
}

function lessonTopic(
  kps: readonly SkeletonKpInput[],
  goals: readonly LessonGoal[],
  fallback: string,
): string {
  if (kps.length !== 1 || goals.length !== 1 || !selectObservableObjective(kps[0]?.learningObjectives)) {
    return fallback
  }
  const title = goals[0]!.statement
    .trim()
    .replace(/^(?:能|会|能够|可以)\s*/, '')
    .replace(/[。；;]+$/, '')
  if (!title) return fallback
  return title.includes(fallback) || sharesSpecificTopicPhrase(fallback, title)
    ? title
    : `${fallback}：${title}`
}

function sharesSpecificTopicPhrase(topic: string, title: string): boolean {
  const compactTopic = topic.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '')
  const compactTitle = title.replace(/[^\p{Script=Han}A-Za-z0-9]/gu, '')
  if (compactTopic.length < 4 || compactTitle.length < 4) return false
  for (let index = 0; index <= compactTopic.length - 4; index += 1) {
    if (compactTitle.includes(compactTopic.slice(index, index + 4))) return true
  }
  return false
}

function defaultGoal(kp: SkeletonKpInput, skeleton: FragmentSkeleton): Pick<LessonGoal, 'statement' | 'successSignal'> {
  const authored = selectObservableObjective(kp.learningObjectives)
  if (authored) {
    return {
      statement: authored,
      successSignal: successSignalFromObjective(authored),
    }
  }

  let statement: string
  switch (skeleton.knowledgeType) {
    case 'conceptual': statement = skeleton.steps.some(step => step.sceneType === 'contrast')
      ? `能解释${kp.canonicalName}的核心含义，并辨析一个教研确认的典型误区。`
      : `能解释${kp.canonicalName}的核心含义，并在一个新例中指出关键特征。`
      break
    case 'procedural': statement = `能按步骤完成一道${kp.canonicalName}的同型任务，并说明关键依据。`; break
    case 'factual': statement = `能准确说出${kp.canonicalName}的关键事实，并通过一次检核。`; break
    case 'metacognitive': statement = `能说出${kp.canonicalName}的使用时机，并在新情境中应用。`; break
  }
  return { statement, successSignal: skeleton.successSignalTemplate(kp.canonicalName) }
}

export interface SceneBaseInput {
  topic: string
  kpTextBlock: string
  teacherCastId: string
  studentCastId: string
  subject: SubjectId
  lessonPhase?: LessonPhase
}

export interface SceneKpInput extends SceneBaseInput {
  id: string
  kpId: string
  /** 本幕聚焦的单个 KP 名(区别于全课 kpTextBlock)。 */
  focus: string
}

/**
 * 按片段骨架的 steps 展开一个 KP 的场景序列——compileLessonFromKps 与 v5 M1
 * 换骨架(edit/fragment-reskeleton.ts)共用同一套 scene builder,禁止各自复刻。
 */
export function buildFragmentScenes(
  kp: SkeletonKpInput,
  skeleton: FragmentSkeleton,
  base: SceneBaseInput,
  makeSceneId: (sceneType: string) => string,
  spriteSide: 'left' | 'right',
): LessonScene[] {
  return skeleton.steps.map(step => {
    const ctx: SceneKpInput = { ...base, id: makeSceneId(step.sceneType), kpId: kp.id, focus: kp.canonicalName }
    const scene = buildSceneForStep(step, ctx, kp, spriteSide)
    // executor 与单页时长都是骨架步骤的权威数据，统一在这里落到 scene，
    // 各 builder 函数只负责内容与呈现。
    return { ...scene, executor: step.executor, durationTargetSec: step.durationTargetSec }
  })
}

function buildSceneForStep(
  step: FragmentSkeletonStep,
  ctx: SceneKpInput,
  kp: SkeletonKpInput,
  spriteSide: 'left' | 'right',
): LessonScene {
  switch (step.sceneType) {
    case 'visual-observation': return buildObservationScene(ctx)
    case 'concept-build': return buildConceptBuildScene(ctx, kp.knowledgeType)
    case 'contrast': {
      const misconception = kp.misconceptions?.[0]?.trim()
      if (!misconception) throw new Error(`contrast 步骤缺少可靠误区来源: ${kp.id}`)
      return buildContrastScene(ctx, misconception, spriteSide)
    }
    case 'worked-example': return buildWorkedExampleScene(ctx)
    case 'practice': return buildPracticeScene(ctx, kp.knowledgeType === 'conceptual')
    case 'ai-verify': {
      const indices = step.misconceptionIndices ?? []
      const texts = indices.map(i => kp.misconceptions?.[i]).filter((t): t is string => Boolean(t))
      return buildAiVerifyScene(ctx, texts, spriteSide)
    }
    case 'ai-inquiry': return buildAiInquiryScene(ctx)
    default: throw new Error(`skeleton step 不支持的 sceneType: ${step.sceneType}`)
  }
}

function buildSourceReadingScene(input: SceneBaseInput, id: string): LessonScene {
  const { topic, kpTextBlock, subject } = input
  const opening = lessonOpeningCopy({
    topic,
    kpTitles: kpTextBlock.split('、'),
    ...(input.lessonPhase ? { phase: input.lessonPhase } : {}),
  })
  return {
    id,
    sceneType: 'source-reading',
    executor: 'co',
    visualLayout: 'central-text-safe / topic-display',
    contentSlots: {
      topic,
      learningPath: opening.learningPath,
      openingQuestion: opening.openingQuestion,
    },
    visualFocus: topic,
    narrationAnchor: topic,
    ...runtimeSceneContractFor('source-reading'),
    boardText: opening.boardText,
    sceneTechnique: 'static-board',
    characterLayer: {
      layout: 'no-character',
      positionRule: 'source-reading 主题页无角色,内容居中。',
      exitRule: '进入下一页后老师从左侧入场。',
    },
    dialogueLayout: 'no-character',
    peerFunction: 'none',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: input.teacherCastId,
      emotion: 'calm',
      pace: 'medium',
      pauseRule: 'KP 之间短停,总标题前停 700ms。',
    },
    gradeTone: '语言简洁,先说本课教什么;不夹带术语和结论。',
    teacherScript: opening.teacherScript,
    studentAction: opening.studentAction,
    evidenceOnScreen: [topic, kpTextBlock, opening.evidenceLabel],
  }
}

function buildObservationScene(input: SceneKpInput): LessonScene {
  const { id, kpId, focus, subject } = input
  return {
    id,
    kpId,
    sceneType: 'visual-observation',
    visualLayout: 'three-panel-observation / narration-only',
    contentSlots: {
      panelA: `待 LLM 填充:${focus} 的第一层观察要素`,
      panelB: `待 LLM 填充:${focus} 的第二层观察要素`,
      panelC: `待 LLM 填充:${focus} 的第三层观察要素`,
    },
    visualFocus: `${focus} 的关键观察要素`,
    narrationAnchor: '关键观察要素',
    ...runtimeSceneContractFor('visual-observation'),
    boardText: ['先看整体', '再看局部要素', '最后连成关系'],
    sceneTechnique: 'path-tracing',
    characterLayer: {
      layout: 'narration-only',
      positionRule: '三栏需要完整展示,角色退场,只保留旁白字幕。',
      exitRule: '进入下一页时切换版式。',
    },
    dialogueLayout: 'narration-only',
    peerFunction: 'none',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: input.teacherCastId,
      emotion: 'analytical',
      pace: 'medium',
      pauseRule: '每层要素讲完停 600ms,路径移动再讲下一层。',
    },
    gradeTone: '按层次组织观察,不做整段口述。',
    teacherScript: `这一页我们把 ${focus} 的关键观察要素分成三层来看。观察不是随便看,而是沿路径一步一步识别,画面会按顺序显现,便于对照。这里的重点是关键观察要素,先建立骨架,细节留到下一步。`,
    studentAction: '按三栏路径识别每一层要素,并说出层与层之间的关系。',
    evidenceOnScreen: ['第一层要素', '第二层要素', '第三层要素'],
  }
}

function buildConceptBuildScene(input: SceneKpInput, knowledgeType: SkeletonKpInput['knowledgeType']): LessonScene {
  const { id, kpId, focus, subject } = input
  const template = selectConceptBuildTemplate(knowledgeType)
  if (template.id === 'strategy-cycle') {
    return {
      id,
      kpId,
      sceneType: 'concept-build',
      infoShape: 'progressive',
      visualLayout: 'central-text-safe / strategy-cycle',
      contentSlots: conceptSeedContentSlots(template, focus),
      visualFocus: `${focus} 的使用时机、步骤与自检`,
      narrationAnchor: template.narrationAnchor,
      ...runtimeSceneContractFor('concept-build'),
      boardText: ['先识别使用时机', '再按步骤执行', '最后用问题自检'],
      sceneTechnique: 'path-tracing',
      characterLayer: {
        layout: 'narration-only',
        positionRule: '策略闭环需要完整展示，角色退场，只保留旁白字幕。',
        exitRule: '进入应用页时切换任务版式。',
      },
      dialogueLayout: 'narration-only',
      peerFunction: 'none',
      subjectTeachingMode: subjectMode(subject),
      voiceCue: {
        castId: input.teacherCastId,
        emotion: 'analytical',
        pace: 'medium',
        pauseRule: '使用时机说完停 600ms，每个步骤后短停，最后留 1000ms 自检。',
      },
      gradeTone: '策略要落到可判断的使用时机、可执行步骤和可回答的自检问题。',
      teacherScript: `这一页不是背 ${focus} 的定义，而是学会何时启动它、怎样按步骤执行，以及怎样检查它是否真正帮助了当前任务。先找到策略使用时机，再沿路径演练，最后用自检问题回看结果。`,
      studentAction: '写出一个适用情境，逐步记录执行结果，并回答自检问题。',
      evidenceOnScreen: ['策略使用时机', '可执行步骤', '自我检查问题'],
    }
  }
  return {
    id,
    kpId,
    sceneType: 'concept-build',
    visualLayout: 'central-text-safe / concept-statement',
    contentSlots: conceptSeedContentSlots(template, focus),
    visualFocus: `${focus} 的核心表述`,
    narrationAnchor: '核心表述',
    ...runtimeSceneContractFor('concept-build'),
    boardText: ['核心表述', '一个正例', '适用边界'],
    sceneTechnique: 'layered-reveal',
    characterLayer: {
      layout: 'narration-only',
      positionRule: '概念建立以表述为主体,角色退场,只保留旁白字幕;立绘留给本片段的辨析幕。',
      exitRule: '进入辨析页时学生立绘入场。',
    },
    dialogueLayout: 'narration-only',
    peerFunction: 'none',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: input.teacherCastId,
      emotion: 'calm',
      pace: 'slow',
      pauseRule: '核心表述读完停 800ms,再进正例。',
    },
    gradeTone: '定义先行、单概念推进;每个术语都要指向屏幕上的表述或正例。',
    teacherScript: `现在把刚才观察到的东西收拢成一句话:${focus} 的核心表述就在屏幕中央。先把这句话读稳,再看下面这个正例,它把表述里的每个关键词都落到了具体对象上。表述和例子对上了,概念才算立住。`,
    studentAction: '朗读核心表述,并在正例中指出每个关键词对应的位置。',
    evidenceOnScreen: ['核心表述', '完整正例'],
  }
}

function buildContrastScene(input: SceneKpInput, seedMisconception: string, spriteSide: 'left' | 'right' = 'left'): LessonScene {
  const { id, kpId, focus, studentCastId, subject } = input
  // contrast 是"中央左右对照"幕(误区/修正双栏),fill 后几乎必然内容密集——
  // student-right-content-left 的大立绘会吃掉右侧对照区并撞 isContentDense 闸门
  // (真检 rc14:数学平方差课第 2 个 contrast 落 right 侧被拦)。恒用 corner-avatar,
  // 给首次辨析与随后展开的完整对照都保留足够画面宽度。
  const dialogueLayout = 'corner-avatar'
  return {
    id,
    kpId,
    sceneType: 'contrast',
    visualLayout: `${dialogueLayout} / misconception-contrast`,
    contentSlots: {
      misconception: `教材或教研标注误区:${seedMisconception}`,
      correction: '待 LLM 填充:纠偏与判别依据',
    },
    // 与 ai-verify 一致带溯源:contentSlots.misconception 会被 fill 改写,
    // 溯源字段不会。排练引擎、Prep Brief、fact-audit 都按 misconceptionSourcesOf
    // 统一读取,contrast 不带的话「单条误区的 conceptual KP」在这些消费者眼里是空白
    // ——而那恰是最常见的情形(2026-07-27 排练引擎实现时撞到)。
    misconceptionSource: seedMisconception,
    visualFocus: '误区 vs 修正对照',
    narrationAnchor: '误区',
    ...runtimeSceneContractFor('contrast'),
    boardText: ['常见误区', '正确判别', '判别依据'],
    sceneTechnique: 'comparison-slider',
    characterLayer: {
      castId: studentCastId,
      expression: 'questioning',
      layout: dialogueLayout,
      positionRule: `学生立绘在${spriteSide === 'left' ? '左' : '右'}侧,对照卡落在对侧,不遮挡中央对照。`,
      exitRule: '误区澄清后立绘淡出。',
    },
    dialogueLayout,
    peerFunction: 'misconception',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: studentCastId,
      emotion: 'questioning',
      pace: 'medium',
      pauseRule: '提问后停 700ms,由老师接续。',
    },
    gradeTone: '学生问题应有分析价值,不做表层附和。',
    teacherScript: `这一页处理一个常见的误区。同学可能会问:关于 ${focus},是不是可以这样理解?这里我们不急着否定,先把误解和正确判别并排放,看它们分别在哪个位置。判别依据在板书上,可以对照使用。`,
    studentAction: '判断误解和正确判别之间的差异,说出判别依据。',
    evidenceOnScreen: ['误区表述', '正确判别', '判别依据'],
  }
}

/**
 * v5 M2 ai-verify 幕:把 KP 误概念标注改写成似是而非的待核查说法,
 * 学生找茬,教师随后给出核查结论——这是收编「误概念覆盖断层」的落点(docs/
 * v5-master-plan-2026-07-20.md §10.5 缺口 1)。
 *
 * v5 骨架去重合并:一个片段至多 1 幕 ai-verify,misconceptionTexts 可能携带
 * 多条误区原文(buildSceneForStep 按 misconceptionIndices 取值)——单条时行为
 * 与旧版完全一致;多条时按 domain.ts LessonScene.misconceptionSources 注释的
 * 渲染契约("粗槽向后兼容,细槽向前预留")铺 contentSlots:aiClaim/reveal 合并
 * 粗槽始终存在,aiClaim1..N/reveal1..N 细分槽额外并存。misconceptionText(s)
 * 必须逐字来自 SkeletonKpInput.misconceptions 原文,写入 misconceptionSource(第
 * 一条,旧课兼容)与 misconceptionSources(全量)供溯源闸门(quality-gates)校验,
 * fill-scenes 不覆写这两个字段。渲染复用 contrast 的对照版式
 * (comparison-slider),专属视觉组件是后续任务。
 */
function buildAiVerifyScene(input: SceneKpInput, misconceptionTexts: string[], spriteSide: 'left' | 'right' = 'left'): LessonScene {
  const { id, kpId, focus, studentCastId, subject } = input
  const primaryText = misconceptionTexts[0]
  const isMerged = misconceptionTexts.length > 1
  // ai-verify 与 contrast 同为"中央左右对照"幕(待核查说法/核查结论双栏),无论单条还是
  // 合并,fill 后 contentSlots 都够长而触发 isContentDense 闸门;student-right-content-left
  // 的大立绘不在密集版式白名单且会吃掉对照区(真检 rc14:平方差课单条 ai-verify 落
  // right 侧被拦)。恒用 corner-avatar,给首次找茬与随后展开的核查结论保留画面宽度。
  const dialogueLayout = 'corner-avatar'

  const aiClaim = isMerged
    ? misconceptionTexts.map((text, index) => `${index + 1}. ${text}`).join(' ')
    : primaryText
      ? primaryText
      : `待 LLM 填充:关于 ${focus} 的一个似是而非的说法`
  const reveal = isMerged
    ? `待 LLM 填充:逐条核查结论与判别依据(共 ${misconceptionTexts.length} 处)`
    : '待 LLM 填充:核查结论与判别依据'
  const fineGrainedSlots: Record<string, string> = isMerged
    ? Object.fromEntries(misconceptionTexts.flatMap((t, i) => [
        [`aiClaim${i + 1}`, t],
        [`reveal${i + 1}`, `待 LLM 填充:第 ${i + 1} 条核查结论与判别依据`],
      ]))
    : {}

  return {
    id,
    kpId,
    sceneType: 'ai-verify',
    ...(primaryText ? { misconceptionSource: primaryText } : {}),
    ...(isMerged ? { misconceptionSources: misconceptionTexts } : {}),
    visualLayout: `${dialogueLayout} / ai-claim-verify`,
    contentSlots: {
      aiClaim,
      reveal,
      ...fineGrainedSlots,
    },
    visualFocus: '这句话对不对',
    narrationAnchor: '找茬',
    ...runtimeSceneContractFor('ai-verify'),
    boardText: ['待核查说法', '你的判断', '核查依据'],
    sceneTechnique: 'comparison-slider',
    characterLayer: {
      castId: studentCastId,
      expression: 'questioning',
      layout: dialogueLayout,
      positionRule: isMerged
        ? '待核查说法卡在角落头像对照区,学生立绘只做旁听头像,不遮挡中央的多条找茬对照。'
        : `待核查说法卡在${spriteSide === 'left' ? '左' : '右'}侧对照区,学生立绘只做旁听头像,不遮挡中央对照。`,
      exitRule: '揭底完成后立绘淡出。',
    },
    dialogueLayout,
    peerFunction: 'misconception',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: studentCastId,
      emotion: 'questioning',
      pace: 'medium',
      pauseRule: '说法读完停 700ms,由老师接续核查。',
    },
    gradeTone: '找茬要基于证据判断,不做无依据的猜测。',
    teacherScript: `这一页是关于 ${focus} 的找茬任务。屏幕先呈现一句待核查说法,请学生圈出可疑之处,引用本课证据写下判断;完成后再查看核查结论并改正。`,
    studentAction: '判断屏幕上的说法是否正确,写出理由,再对照核查结论。',
    evidenceOnScreen: ['待核查说法', '判断理由', '核查依据'],
  }
}

/**
 * v5 M2 ai-inquiry 幕:对比浅问与追问两组真实问答样本,学生借此学习怎么问出
 * 让 AI 暴露边界的好问题——只在课级至多插入 1 幕(见 skeleton-library
 * applyAiInquirySlot),不按 KP 反复出现。
 */
function buildAiInquiryScene(input: SceneKpInput): LessonScene {
  const { id, kpId, focus, subject } = input
  return {
    id,
    kpId,
    sceneType: 'ai-inquiry',
    visualLayout: 'narration-only / ai-inquiry-compare',
    contentSlots: {
      shallowSample: `待 LLM 填充:关于 ${focus} 的一次浅问与 AI 给出的平庸回答`,
      probingSample: `待 LLM 填充:关于 ${focus} 的一次追问与 AI 因此暴露边界的回答`,
    },
    visualFocus: `${focus} 的提问质量对比`,
    narrationAnchor: '提问链',
    ...runtimeSceneContractFor('ai-inquiry'),
    boardText: ['浅问得到什么', '追问得到什么', '怎么问出边界'],
    sceneTechnique: 'comparison-slider',
    characterLayer: {
      layout: 'narration-only',
      positionRule: '两组问答需要完整展示,角色退场,只保留旁白字幕。',
      exitRule: '进入下一页时切换版式。',
    },
    dialogueLayout: 'narration-only',
    peerFunction: 'none',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: input.teacherCastId,
      emotion: 'analytical',
      pace: 'medium',
      pauseRule: '每组问答讲完停 700ms,再进入下一组对照。',
    },
    gradeTone: '追问要指向具体边界,不做空泛的"再问一次"。',
    teacherScript: `这一页我们沿着一条提问链,比较两种提问方式带来的差别。第一组是浅问,AI 给出的回答往往很平庸;第二组针对 ${focus} 追问下去,AI 的回答会暴露它的边界。同一个 AI,问法不同,答案质量完全不同。`,
    studentAction: '对比两组问答,说出追问好在哪里,并为一个新问题设计追问。',
    evidenceOnScreen: ['浅问问答', '追问问答', '边界暴露点'],
  }
}

function buildWorkedExampleScene(input: SceneKpInput): LessonScene {
  const { id, kpId, focus, subject } = input
  return {
    id,
    kpId,
    sceneType: 'worked-example',
    visualLayout: 'worked-steps / narration-only',
    contentSlots: {
      problem: `待 LLM 填充:一道 ${focus} 的完整题面(目标与已知条件写全)`,
      completionPrompt: `题面已有：${focus} 的已知条件已经列出。请在【待补】处补出接下来的关键步骤，并说明依据。`,
      steps: `待 LLM 填充:${focus} 的分步过程,每步写明操作依据,不跳步`,
    },
    visualFocus: `${focus} 的完整例题过程`,
    narrationAnchor: '分步过程',
    ...runtimeSceneContractFor('worked-example'),
    boardText: ['题面与目标', '每一步的依据', '中间结果写完整'],
    sceneTechnique: 'step-replay',
    characterLayer: {
      layout: 'narration-only',
      positionRule: '题面与步骤需要完整展示,角色退场,只保留旁白字幕。',
      exitRule: '例题讲完进入跟做页时切换版式。',
    },
    dialogueLayout: 'narration-only',
    peerFunction: 'none',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: input.teacherCastId,
      emotion: 'analytical',
      pace: 'slow',
      pauseRule: '每一步展开前停 600ms,先说依据再显示结果。',
    },
    gradeTone: '每一步都要说出操作依据,不能跳步;术语指向屏幕上的步骤。',
    teacherScript: `这一页我们完整做一道 ${focus} 的例题。先把题面看清:目标是什么,已知有哪些。然后进入分步过程,每一步先说依据,再看展开的结果。中间结果都写完整,你跟着核对,不要跳步。`,
    studentAction: '跟随步骤回放,每步先自己说出依据,再核对屏幕展开。',
    evidenceOnScreen: ['完整题面', '分步过程', '每步依据'],
  }
}

export function buildPracticeScene(input: SceneKpInput, contentFirst = false): LessonScene {
  const { id, kpId, focus, studentCastId, subject } = input
  const dialogueLayout = contentFirst ? 'narration-only' : 'corner-avatar'
  return {
    id,
    kpId,
    sceneType: 'practice',
    visualLayout: `central-task / ${dialogueLayout}`,
    contentSlots: {
      task: `待 LLM 填充:一道 ${focus} 的同型任务(对象或数字不同,难度持平)`,
      feedback: `待 LLM 填充:作答后的反馈要点与常见出错位置`,
    },
    visualFocus: `${focus} 的同型任务`,
    narrationAnchor: '同型任务',
    ...runtimeSceneContractFor('practice'),
    boardText: ['任务要求', '先自己答', '再对照反馈'],
    sceneTechnique: 'step-replay',
    characterLayer: contentFirst
      ? {
          layout: 'narration-only',
          positionRule: '本片段已由同学完成辨析发言,练习页让角色退场,完整保留任务与作答空间。',
          exitRule: '学生提交原答并展开反馈后仍不叠加角色。',
        }
      : {
          castId: studentCastId,
          expression: 'thinking',
          layout: 'corner-avatar',
          positionRule: '同学只以右下角头像出现,任务区至少保留 80% 宽度。',
          exitRule: '反馈讲完头像淡出。',
        },
    dialogueLayout,
    peerFunction: contentFirst ? 'none' : 'peer-restate',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: contentFirst ? input.teacherCastId : studentCastId,
      emotion: 'thinking',
      pace: 'medium',
      pauseRule: '任务读完停 1000ms 留作答时间,再进反馈。',
    },
    gradeTone: '任务表述与例题同型,不引入新术语;反馈指向具体出错位置。',
    teacherScript: contentFirst
      ? `轮到你独立完成 ${focus} 的同型任务了。这次不靠同学提示,先完整写下自己的判断、核心含义和理由,不要看反馈。提交原答后再逐条对照成功标准,找出一致和不一致的位置；如果需要修正,把新的判断、依据以及原答为什么不足一起写清楚。`
      : `轮到你了。这是一道同型任务,和刚才的例题相比只是对象换了。先自己完整做一遍,同学也会把自己的做法说出来对照。做完再看反馈,重点看你和反馈不一致的那一步,那里就是要补的地方。`,
    studentAction: '独立完成同型任务,再对照反馈定位自己的出错步骤。',
    evidenceOnScreen: ['任务题面', '反馈要点'],
  }
}

function buildRecapScene(input: SceneBaseInput, id: string, kps: readonly SkeletonKpInput[]): LessonScene {
  const { kpTextBlock, teacherCastId, subject } = input
  const template = selectRecapTemplate(kps)
  return {
    id,
    sceneType: 'recap',
    executor: 'co',
    infoShape: template.infoShape,
    visualLayout: `${template.id} / corner-avatar`,
    contentSlots: recapSeedContentSlots(template, kps, input.topic),
    visualFocus: template.visualFocus,
    narrationAnchor: template.narrationAnchor,
    ...runtimeSceneContractFor('recap'),
    boardText: template.id === 'belief-revision'
      ? ['起始想法', '本课证据', '修正后的解释']
      : template.id === 'concept-network'
        ? kps.slice(0, 5).map(kp => kp.canonicalName)
        : template.id === 'claim-evidence'
          ? ['本课总论断', '关键依据', '迁移结论']
          : ['理解对象', '掌握方法', '独立应用'],
    sceneTechnique: 'step-replay',
    characterLayer: {
      castId: teacherCastId,
      expression: 'thinking',
      layout: 'corner-avatar',
      positionRule: '老师只保留左下角头像,中央路径至少保留 80% 宽度。',
      exitRule: '路径完整回放后隐藏角色。',
    },
    dialogueLayout: 'corner-avatar',
    peerFunction: 'peer-restate',
    subjectTeachingMode: subjectMode(subject),
    voiceCue: {
      castId: teacherCastId,
      emotion: 'low-emphasis',
      pace: 'medium',
      pauseRule: '结论前明显降速并停顿。',
    },
    gradeTone: `用“${template.label}”帮助学生组织已学内容；每一个关系都必须指向本课已经出现的证据。`,
    teacherScript: `最后用${template.label}收束 ${kpTextBlock}。屏幕内容只是线索，不能照着念完就算学会。请解释其中一处关系为什么成立，再用一个新例子检验这条结论，并回看开场预测写下一处保留或修正。`,
    studentAction: template.id === 'belief-revision'
      ? '指出一处想法变化，并引用本课证据说明修正理由。'
      : template.id === 'concept-network'
        ? '解释三个分支与中心主题的联系，再迁移到一个新情境。'
        : template.id === 'claim-evidence'
          ? '用至少两条依据解释总论断，再举一个新例子并回看开场预测。'
          : '解释迁移阶梯中的关键一步，再把方法用于新情境。',
    evidenceOnScreen: template.id === 'belief-revision'
      ? ['起始想法', '修正解释', '修正证据']
      : template.id === 'concept-network'
        ? ['中心主题', '知识分支', '分支联系']
        : template.id === 'claim-evidence'
          ? ['总论断', '支撑依据', '迁移结论']
          : ['理解节点', '方法节点', '应用节点'],
  }
}

/**
 * 按 sceneType 为每幕派生节拍;全课最多 1 个 ask(低交互契约),
 * 后续辨析幕的误区改用 reveal 呈现。
 * 导出给 edit/fragment-reskeleton.ts:换骨架后全课节拍需要按新场景顺序重新派发,
 * 否则 askUsed 预算和旧场景 id 会对不上。
 */
export function buildBeats(scenes: LessonScene[]): LessonBeat[] {
  const beats: LessonBeat[] = []
  let seq = 0
  let askUsed = false
  const push = (sceneId: string, beat: Omit<LessonBeat, 'id' | 'sceneId'>) => {
    beats.push({ id: `p2-b${String(++seq).padStart(2, '0')}`, sceneId, ...beat })
  }

  for (const scene of scenes) {
    switch (scene.sceneType) {
      case 'source-reading':
        push(scene.id, { action: 'reveal', targetId: 'topic', durationMs: 700 })
        push(scene.id, { action: 'speak', script: '介绍本课主线', durationMs: 12000 })
        break
      case 'visual-observation':
        push(scene.id, { action: 'reveal', targetId: 'panelA', durationMs: 1500 })
        push(scene.id, { action: 'reveal', targetId: 'panelB', durationMs: 1500 })
        push(scene.id, { action: 'reveal', targetId: 'panelC', durationMs: 1500 })
        break
      case 'concept-build':
        push(scene.id, { action: 'reveal', targetId: 'statement', durationMs: 1500 })
        push(scene.id, { action: 'reveal', targetId: 'example', durationMs: 1800 })
        break
      case 'contrast':
        push(scene.id, { action: askUsed ? 'reveal' : 'ask', targetId: 'misconception', durationMs: 2200 })
        askUsed = true
        push(scene.id, { action: 'reveal', targetId: 'correction', durationMs: 2200 })
        break
      case 'worked-example':
        push(scene.id, { action: 'reveal', targetId: 'problem', durationMs: 1800 })
        push(scene.id, { action: 'reveal', targetId: 'steps', durationMs: 2600 })
        break
      case 'practice':
        push(scene.id, { action: 'reveal', targetId: 'task', durationMs: 2000 })
        push(scene.id, { action: 'reveal', targetId: 'feedback', durationMs: 2000 })
        break
      case 'ai-verify':
        push(scene.id, { action: 'reveal', targetId: 'aiClaim', durationMs: 2000 })
        push(scene.id, { action: 'reveal', targetId: 'reveal', durationMs: 2400 })
        break
      case 'ai-inquiry':
        push(scene.id, { action: 'reveal', targetId: 'shallowSample', durationMs: 2000 })
        push(scene.id, { action: 'reveal', targetId: 'probingSample', durationMs: 2400 })
        break
      case 'recap':
        push(scene.id, { action: 'reveal', targetId: 'path', durationMs: 3200 })
        push(scene.id, { action: 'speak', script: '路径回放收束', durationMs: 8000 })
        break
      default:
        push(scene.id, { action: 'speak', script: '讲解本页内容', durationMs: 8000 })
    }
  }
  return beats
}

function gradeBandLabel(gradeBand: GradeBand): string {
  switch (gradeBand) {
    case 'lower-primary': return '小学低段学生'
    case 'upper-primary': return '小学高段学生'
    case 'middle-school': return '初中学生'
    case 'high-school': return '高中学生'
  }
}
