/**
 * skeleton-library · 教学骨架库(设计 project-redesign-2026-06-30 Step 2「定骨架」落地)
 *
 * 骨架选择走**纯显式数据路径**:KP 在教材索引期已由标注管线写入
 * dimensions.knowledgeType(Anderson 四类,见 shared-types/knowledge-type-rules),
 * 这里按该标注从片段骨架库展开幕序列——禁止任何关键词/正则定型
 * (旧 lib/v2/teaching-skeletons.ts 的 signals 匹配即因此不迁移)。
 *
 * 结构:课程 = 开场(source-reading) + 每个 KP 一个 LearningFragment + 收束(recap)。
 * 每个片段按 KP 认知类型展开 2-3 个独立学生页面；单页是认知分段单位，
 * LearningFragment 是同一目标下的多页完整序列。幕数随 KP 数与类型自然伸缩；
 * 单 factual KP 的简单课只有 4 幕，不加复杂壳。
 *
 * P3 备课工作台接口:LearningFragment.skeletonId 记录片段用了哪个骨架
 * (换骨架 = 换 skeletonId 重展开该片段),scene.kpId 记录幕归属(删页/单页重生成定位)。
 */

import type { KnowledgeType } from '@maolab/shared-types'
import { QUALITY_GATES, type Executor, type SceneType, type TeachingSkeleton } from '../domain.js'

/** KP 无标注(annotations 为空)时的兜底类型:实测库内分布 conceptual 占 63%。 */
export const DEFAULT_KP_KNOWLEDGE_TYPE: KnowledgeType = 'conceptual'

export interface SkeletonKpInput {
  id: string
  canonicalName: string
  /** 教材索引期标注的认知类型;缺省走 DEFAULT_KP_KNOWLEDGE_TYPE。 */
  knowledgeType?: KnowledgeType
  /** 教材索引期标注的常见误解;非空时直接喂给辨析幕的 misconception 槽。 */
  misconceptions?: string[]
  /** 教材索引期标注的学习目标(行为动词开头)。 */
  learningObjectives?: string[]
  /** v4 M3:学情判定薄弱(掌握度低于阈值)→ 骨架追加一幕加固再练。 */
  needsReinforcement?: boolean
}

export interface FragmentSkeletonStep {
  sceneType: SceneType
  /** 这一步承担的教学动作,用户可读,组进课程 arc。 */
  role: string
  /** v5 M2 人机分工:此步骤缺省由谁执教(骨架库权威数据,见设计草案 §1 表)。 */
  executor: Executor
  /** 单页一个主要教学动作的目标时长；展开场景时原样落到 LessonScene。 */
  durationTargetSec: number
  /**
   * ai-verify 步骤专属:对应 SkeletonKpInput.misconceptions 的下标列表(0-based)。
   * 每片段至多 1 个 ai-verify 步骤(骨架合并规则,见 aiVerifyStepsFor),该步骤
   * 一次性收编片段剩余的**全部**误区下标——不再逐条追加步骤/幕,根治"一课塞
   * 5-8 幕同一张 ai-verify 脸"的结构性重复。
   */
  misconceptionIndices?: number[]
}

export interface FragmentSkeleton {
  id: string
  knowledgeType: KnowledgeType
  /** 片段的教学形态标签,进 TeachingSkeleton.arc 与备课展示。 */
  teachingType: string
  steps: readonly FragmentSkeletonStep[]
  durationTargetSec: number
  successSignalTemplate: (kpName: string) => string
}

type FragmentSkeletonDefinition = Omit<FragmentSkeleton, 'durationTargetSec'>

function totalStepDuration(steps: readonly FragmentSkeletonStep[]): number {
  return steps.reduce((sum, step) => sum + step.durationTargetSec, 0)
}

/** 片段总时长只从各页骨架步骤求和，避免总量与逐页预算成为两份会漂移的事实源。 */
function defineFragmentSkeleton(definition: FragmentSkeletonDefinition): FragmentSkeleton {
  return {
    ...definition,
    durationTargetSec: totalStepDuration(definition.steps),
  }
}

/**
 * 片段骨架库:按 KP 认知类型注册。每型的幕序列都由样板课验证过的
 * sceneType 组合构成(fill-scenes SCENE_ROLES 与 SceneTechnique 注册表全覆盖)。
 */
export const FRAGMENT_SKELETONS: Record<KnowledgeType, FragmentSkeleton> = {
  conceptual: defineFragmentSkeleton({
    id: 'frag-conceptual',
    knowledgeType: 'conceptual',
    teachingType: '观察建构',
    steps: [
      { sceneType: 'visual-observation', role: '观察对象', executor: 'ai', durationTargetSec: 35 },
      // 2026-08-25「讲稿过于简化」:45→55(片段总时长顶格设计上限 180,单页仍守 60s 契约)
      { sceneType: 'concept-build', role: '建立概念', executor: 'co', durationTargetSec: 55 },
      { sceneType: 'contrast', role: '辨析误区', executor: 'teacher', durationTargetSec: 40 },
      { sceneType: 'practice', role: '独立检核', executor: 'ai', durationTargetSec: 50 },
    ],
    successSignalTemplate: kp => `学生能用自己的话说出 ${kp} 的核心含义,并判断一个典型误区。`,
  }),
  procedural: defineFragmentSkeleton({
    id: 'frag-procedural',
    knowledgeType: 'procedural',
    teachingType: '讲授跟做',
    steps: [
      // 2026-08-25 用户裁决「整节课基本没有教学,全是问答」:程序性知识不能从
      // 例题直接开始——先由老师把方法/规则本身讲授出来(它是什么、每一步为什么、
      // 何时用),再进例题示范与跟做。认知契约「新信息先建立结构,再用例子巩固」。
      { sceneType: 'concept-build', role: '方法讲授', executor: 'ai', durationTargetSec: 60 },
      { sceneType: 'worked-example', role: '完整例题', executor: 'ai', durationTargetSec: 60 },
      { sceneType: 'practice', role: '同型跟做', executor: 'ai', durationTargetSec: 50 },
    ],
    successSignalTemplate: kp => `学生能独立完成一道 ${kp} 的同型任务,并说明关键步骤的依据。`,
  }),
  factual: defineFragmentSkeleton({
    id: 'frag-factual',
    knowledgeType: 'factual',
    teachingType: '识记检核',
    steps: [
      { sceneType: 'visual-observation', role: '观察事实', executor: 'ai', durationTargetSec: 45 },
      { sceneType: 'practice', role: '识记检核', executor: 'ai', durationTargetSec: 45 },
    ],
    successSignalTemplate: kp => `学生能准确说出 ${kp} 的关键事实并通过一次检核。`,
  }),
  metacognitive: defineFragmentSkeleton({
    id: 'frag-metacognitive',
    knowledgeType: 'metacognitive',
    teachingType: '策略反思',
    steps: [
      { sceneType: 'concept-build', role: '表述策略', executor: 'co', durationTargetSec: 45 },
      { sceneType: 'practice', role: '应用反思', executor: 'ai', durationTargetSec: 45 },
    ],
    successSignalTemplate: kp => `学生能说出 ${kp} 的使用时机,并在一个情境里应用它。`,
  }),
}

export interface FragmentPlan {
  kp: SkeletonKpInput
  skeleton: FragmentSkeleton
}

export interface SkeletonPlan {
  /** 课级骨架记录(进 MainlineCourse.teachingSkeleton)。 */
  skeleton: TeachingSkeleton
  /** 每个 KP 的片段展开计划,顺序与勾选顺序一致。 */
  fragments: FragmentPlan[]
}

/** sceneType → 版式所需视觉形式;导出给 edit/fragment-reskeleton.ts 重算 requiredVisualForms。 */
export const VISUAL_FORM_BY_SCENE_TYPE: Partial<Record<SceneType, string>> = {
  'source-reading': 'definition-card',
  'visual-observation': 'observation',
  'concept-build': 'definition-card',
  'worked-example': 'worked-steps',
  contrast: 'comparison',
  practice: 'practice-check',
  recap: 'summary',
  // v5 M2 三个 AI 素养幕型:选用语义最近的既有 visualForm,专属视觉组件是后续任务。
  'ai-verify': 'comparison',
  'ai-inquiry': 'comparison',
  'ai-collab': 'practice-check',
}

/** ai-verify 幕的基础时长预算(与 v4 M3 薄弱加固追加 practice 幕同量级);
 * 合并进同一幕的每追加一条误区,再加一点时长——一幕多讲几处找茬确实要多花时间,
 * 但远小于"每条误区一整幕"的预算膨胀。 */
const AI_VERIFY_BASE_DURATION_SEC = 30
const AI_VERIFY_PER_EXTRA_CLAIM_SEC = 15

/**
 * v5 M2 误概念覆盖断层收编(docs/v5-master-plan-2026-07-20.md §10.5 缺口 1),
 * v5 骨架去重合并(每片段至多 1 幕 ai-verify,不再逐条误区追加幕——旧规则曾让
 * 12-18 幕的课塞进 5-8 幕同一张 ai-verify 脸,46 页里约 19 页重复,结构性重复
 * 必须在骨架层修):
 * conceptual 型片段已有 contrast 步骤处理 misconceptions[0],ai-verify 只需
 * 收编第 2 条起的**全部**剩余误区,合成一个步骤;procedural/factual/metacognitive
 * 型没有 contrast 步骤,ai-verify 收编全部条目,同样只合成一个步骤。
 * 无标注误区(misconceptions 为空/未定义)或收编后无剩余条目时不追加——
 * 旧课/无标注 KP 零回退。
 */
function aiVerifyStepsFor(base: FragmentSkeleton, misconceptions: readonly string[] | undefined): FragmentSkeletonStep[] {
  if (!misconceptions || misconceptions.length === 0) return []
  const hasContrastStep = base.steps.some(s => s.sceneType === 'contrast')
  const startIndex = hasContrastStep ? 1 : 0
  const remainingIndices = misconceptions.slice(startIndex).map((_, offset) => startIndex + offset)
  if (remainingIndices.length === 0) return []
  return [{
    sceneType: 'ai-verify' as const,
    role: 'AI 找茬:误概念验证',
    executor: 'teacher' as const,
    durationTargetSec: AI_VERIFY_BASE_DURATION_SEC
      + (remainingIndices.length - 1) * AI_VERIFY_PER_EXTRA_CLAIM_SEC,
    misconceptionIndices: remainingIndices,
  }]
}

function normalizeSkeletonKp(kp: SkeletonKpInput): SkeletonKpInput {
  const misconceptions = kp.misconceptions
    ?.map(item => item.trim())
    .filter(item => item.length > 0)
  const { misconceptions: _ignored, ...withoutMisconceptions } = kp
  return misconceptions && misconceptions.length > 0
    ? { ...withoutMisconceptions, misconceptions }
    : withoutMisconceptions
}

/**
 * 概念骨架里的辨析页必须有教材标注或教研资产作为错误说法来源。没有可靠误区时，
 * 保留观察、建构和独立练习，把成功信号改为新例识别；不能为了凑固定页数让模型
 * 自行发明“典型误区”。
 */
function groundedBaseSkeletonFor(kp: SkeletonKpInput): FragmentSkeleton {
  const base = FRAGMENT_SKELETONS[kp.knowledgeType ?? DEFAULT_KP_KNOWLEDGE_TYPE]
  if (base.knowledgeType !== 'conceptual' || (kp.misconceptions?.length ?? 0) > 0) return base

  const steps = base.steps.filter(step => step.sceneType !== 'contrast')
  return {
    ...base,
    steps,
    durationTargetSec: totalStepDuration(steps),
    successSignalTemplate: kpName => `学生能用自己的话说出 ${kpName} 的核心含义,并在一个新例中指出关键特征。`,
  }
}

export function fragmentSkeletonFor(kp: SkeletonKpInput): FragmentSkeleton {
  const normalizedKp = normalizeSkeletonKp(kp)
  const base = groundedBaseSkeletonFor(normalizedKp)

  const verifySteps = aiVerifyStepsFor(base, normalizedKp.misconceptions)
  const withVerify: FragmentSkeleton = verifySteps.length === 0
    ? base
    : (() => {
        const steps = [...base.steps, ...verifySteps]
        return {
          ...base,
          steps,
          durationTargetSec: totalStepDuration(steps),
        }
      })()

  if (!kp.needsReinforcement) return withVerify
  // v4 M3 薄弱加固:幕数加权——片段末尾追加一幕同型再练(幕数随学情伸缩,
  // 与幕数随认知类型伸缩同一机制)
  const reinforcementStep = {
    sceneType: 'practice',
    role: '薄弱加固再练',
    executor: 'ai',
    durationTargetSec: 40,
  } satisfies FragmentSkeletonStep
  const steps = [...withVerify.steps, reinforcementStep]
  return {
    ...withVerify,
    id: `${base.id}-reinforced`,
    teachingType: `${withVerify.teachingType}·薄弱加固`,
    steps,
    durationTargetSec: totalStepDuration(steps),
    successSignalTemplate: kpName => `${base.successSignalTemplate(kpName)}(薄弱加固:再独立完成一道同型任务。)`,
  }
}

/** 课级知识类型:单一类型直接用,混合课按出现顺序 `+` 连接(显式暴露混合,不假装单型)。 */
function courseKnowledgeType(fragments: FragmentPlan[]): string {
  const seen: string[] = []
  for (const f of fragments) {
    if (!seen.includes(f.skeleton.knowledgeType)) seen.push(f.skeleton.knowledgeType)
  }
  return seen.join('+')
}

/**
 * v5 M2 ai-inquiry 课级插入(至多 1 幕,遵守"10-15 分钟嵌入"共识,不喧宾夺主):
 * 在首个 metacognitive 片段的 practice 前插入 ai-inquiry;没有 metacognitive
 * KP 时不插入——AI 提问链是形成性活动，不能替代会保存原答与订正的独立练习。
 */
function applyAiInquirySlot(fragments: FragmentPlan[]): FragmentPlan[] {
  const targetIndex = fragments.findIndex(f => f.skeleton.knowledgeType === 'metacognitive')
  if (targetIndex === -1) return fragments
  const target = fragments[targetIndex]!
  const practiceIndex = target.skeleton.steps.findIndex(s => s.sceneType === 'practice')
  if (practiceIndex === -1) return fragments

  const steps = [...target.skeleton.steps]
  steps.splice(practiceIndex, 0, {
    sceneType: 'ai-inquiry',
    role: 'AI 提问链:浅问 vs 追问',
    executor: 'co',
    durationTargetSec: 45,
  })
  return fragments.map((f, i) => (i === targetIndex
    ? { ...f, skeleton: { ...f.skeleton, steps, durationTargetSec: totalStepDuration(steps) } }
    : f))
}

export function planSkeleton(kps: SkeletonKpInput[], courseIdSeed: string): SkeletonPlan {
  if (kps.length === 0) throw new Error('planSkeleton: kps 不能为空')
  const fragments: FragmentPlan[] = applyAiInquirySlot(kps.map(input => {
    const kp = normalizeSkeletonKp(input)
    return { kp, skeleton: fragmentSkeletonFor(kp) }
  }))

  const arc = [
    '进入话题',
    ...fragments.map(f => `${f.kp.canonicalName}·${f.skeleton.teachingType}`),
    '路径收束',
  ]

  const sceneTypes: SceneType[] = [
    'source-reading',
    ...fragments.flatMap(f => f.skeleton.steps.map(s => s.sceneType)),
    'recap',
  ]
  const requiredVisualForms = [...new Set(sceneTypes.map(t => VISUAL_FORM_BY_SCENE_TYPE[t]).filter((v): v is string => Boolean(v)))]

  return {
    skeleton: {
      id: `skeleton-${courseIdSeed.slice(0, 8)}`,
      knowledgeType: courseKnowledgeType(fragments),
      teachingType: '低交互讲解',
      arc,
      requiredVisualForms,
      requiredChecks: QUALITY_GATES,
      nonGoals: ['不做刷题', '不堆装饰', '角色让位于内容', '简单课不加复杂剧情壳'],
    },
    fragments,
  }
}
