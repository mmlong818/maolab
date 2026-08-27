/**
 * prep-brief · v5 M1「Prep Brief 教研简报」v0(docs/v5-master-plan-2026-07-20.md §4 方向一)
 *
 * 把生成管线里教师看不见的教研资产(误概念库/事实核查/学情/骨架依据)组装成一份
 * 结构化简报——**硬约束:零新增 LLM 调用,全部来自已落库数据的重组**(见 v5 方案
 * §10 风险表「Prep Brief 增加生成成本」行)。
 *
 * 分层:
 * - `assemblePrepBrief` 及其内部 build* 函数是纯函数,输入已取好的 course/KP 元数据/
 *   学情分数,可脱离 DB 单测(同 generation/__tests__ 风格)。
 * - `buildPrepBriefForCourse` 是唯一的 impure 入口:按 courseId 取 store + mastery-store +
 *   kp-metadata 三处已落库数据,交给纯函数组装。
 *
 * 每一节输出都带 `source` 标注(教材标注/事实核查/学情档案/骨架库/质量闸门),
 * 这是「教研背书可溯源」的产品语义,不是装饰字段。
 *
 * ⚠️ 依赖 DB(经 store.ts / mastery-store.ts / kp-metadata.ts),禁止从
 * `@/lib/mainline` barrel(index.ts)导出——同其余 server-only 模块。
 */

import type { KnowledgeType } from '@maolab/shared-types'
import { misconceptionSourcesOf, sceneExecutor, type Executor, type FactAuditRecord, type FactRepairTrace, type GradeBand, type LearningFragment, type LessonScene, type MainlineCourse, type SceneType, type SubjectId } from './domain.js'
import { fetchKpMetadata, type KpMetadata } from './kp-metadata.js'
import { masteryRecordsOf } from './mastery-store.js'
import {
  isWeakMastery,
  masteryCanGuideLowRiskAdaptation,
  type MasteryEvidenceStatus,
  type MasteryRecord,
  type PracticeEvidenceSnapshot,
} from './mastery.js'
import {
  auditMainlineCourse,
  summarizeQuality,
  type QualitySeverity,
  type QualitySummary,
} from './quality-gates.js'
import { DEFAULT_KP_KNOWLEDGE_TYPE, fragmentSkeletonFor, type FragmentSkeletonStep } from './generation/skeleton-library.js'
import { findMainlineCourse } from './store.js'
import { auditPresentationAntipatterns, type AntipatternFinding } from './presentation-antipatterns.js'

/** 简报每一节都标注数据来源,教师/教研员可判断这句话「谁说的」。 */
export type PrepBriefSource = '教材标注' | '事实核查' | '学情档案' | '骨架库' | '质量闸门' | '真检判例'

export interface PrepBriefMisconception {
  text: string
  /** 是否已有幕在处理它(只有片段骨架里存在 contrast 步骤,且是该 KP 第一条误区时才会被处理)。 */
  addressed: boolean
  /** 处理它的 contrast 幕 id;未处理时缺省。 */
  addressedInSceneId?: string
  /**
   * 该 KP 有辨析/找茬幕,但幕上绑定措辞与当前教材标注**整体零命中**
   * (标注在课程生成后被刷新的典型症状)。不等于未处理——需教师核对是否
   * 同一误区;系统不做语义模糊匹配,也不谎报「暂无幕处理」。
   */
  wordingDrift?: boolean
  /** 待核对的辨析/找茬幕 id(仅 wordingDrift 时给出)。 */
  reviewSceneId?: string
  source: PrepBriefSource
}

export interface PrepBriefMasteryNote {
  /** 当前掌握度分数;从未作答过该 KP 时缺省(不代表薄弱,代表无记录)。 */
  score?: number
  /** 分数的证据等级；有分数却缺少该字段属于不合法数据。 */
  evidenceStatus?: MasteryEvidenceStatus
  /** 有可用于低风险适配的证据时，当前档案是否判定为薄弱。 */
  isWeakNow: boolean
  /** 生成本课时骨架是否因薄弱而加固(取自持久化的 skeletonId `-reinforced` 后缀,不重算)。 */
  reinforcedInSkeleton: boolean
  /** 当前分数对应的完整练习证据；教师可据此复核题目、原答、反馈与订正。 */
  latestEvidence?: PracticeEvidenceSnapshot
  source: PrepBriefSource
}

export type PrepBriefContingencyKind = 'advance' | 'repair' | 'misconception'

/**
 * 一条课堂应变动作。触发条件和动作都来自已落库的成功信号、场景结构或教材误区，
 * 不做学情推断；target/resume 只在对应页面真实存在时提供。
 */
export interface PrepBriefContingencyMove {
  kind: PrepBriefContingencyKind
  trigger: string
  action: string
  targetSceneId?: string
  resumeSceneId?: string
  source: PrepBriefSource
}

export interface PrepBriefContingencyPlan {
  available: boolean
  successSignal?: string
  practiceSceneId?: string
  missingReason?: string
  moves: PrepBriefContingencyMove[]
  source: PrepBriefSource
}

export interface PrepBriefKpEntry {
  kpId: string
  canonicalName: string
  knowledgeType: KnowledgeType
  /** knowledgeType 是教材标注还是无标注时的默认兜底。 */
  knowledgeTypeSource: PrepBriefSource | '默认兜底'
  learningObjectives: string[]
  misconceptions: PrepBriefMisconception[]
  contingencyPlan: PrepBriefContingencyPlan
  mastery: PrepBriefMasteryNote
}

export interface PrepBriefFactAuditDetail {
  severity: QualitySeverity
  message: string
  impact: string
  fix: string
}

export interface PrepBriefFactAuditSceneEntry {
  sceneId: string
  sceneType?: SceneType
  kpId?: string
  fatalCount: number
  misleadingCount: number
  impreciseCount: number
  /** 核查服务失败，本幕断言未经验证且不得进入正式课堂。 */
  unverified: boolean
  /** 教师修改过事实内容，旧结论已作废，必须重新核查本页后才能上课。 */
  pendingReview: boolean
  details: PrepBriefFactAuditDetail[]
}

export interface PrepBriefFactAuditSummary {
  /** 本课是否已跑过事实核查(fill 完成后才有;draft 课为 false)。 */
  available: boolean
  auditedAt?: string
  auditedSceneCount: number
  /** 存量课程可能只有旧版事实核查记录，尚未真正运行过跨页一致性检查。 */
  consistencyAvailable: boolean
  consistencyAuditedSceneCount: number
  consistencyConflictCount: number
  pendingSceneCount: number
  unverifiedSceneCount: number
  fatalCount: number
  /** fill 后自动修正的逐轮轨迹；教师可确认系统修过什么、为什么仍阻断。 */
  repairTrace?: FactRepairTrace
  byScene: PrepBriefFactAuditSceneEntry[]
  source: PrepBriefSource
}

export interface PrepBriefSkeletonRationale {
  fragmentId: string
  kpId: string
  skeletonId: string
  teachingType: string
  steps: readonly FragmentSkeletonStep[]
  successSignal: string
  reinforced: boolean
  source: PrepBriefSource
}

export interface PrepBriefQualitySummary extends QualitySummary {
  source: PrepBriefSource
}

/**
 * 真实课堂走查沉淀出的呈现诊断。它与质量闸门并列，但永远不改变课程状态；
 * 教师可把建议当作备课清单，不能把它误读成“系统已自动修复”。
 */
export interface PrepBriefPresentationReview {
  findings: readonly AntipatternFinding[]
  high: number
  medium: number
  low: number
  /** 明示非阻断语义，防止 UI 把审美建议混进质量状态。 */
  blocking: false
  source: PrepBriefSource
}

/** v5 M2 人机分工一项:某执教者承担的幕数与预估时长。 */
export interface PrepBriefExecutorEntry {
  executor: Executor
  sceneCount: number
  /** 按逐幕 durationTargetSec 汇总的估算时长，四舍五入到整秒。
   * 存量课没有逐幕时长时，才按所属片段总时长均摊。 */
  estimatedDurationSec: number
}

/**
 * v5 M2 executor 分工简报(docs/v5-master-plan-2026-07-20.md §4「Prep Brief 增量」):
 * 教师最关心的数字——"明天你要亲自讲多少分钟,AI 承担多少分钟"。
 */
export interface PrepBriefExecutorBreakdown {
  byExecutor: readonly PrepBriefExecutorEntry[]
  totalDurationSec: number
  source: PrepBriefSource
}

export interface PrepBrief {
  courseId: string
  topic: string
  gradeBand: GradeBand
  subject: SubjectId
  qualityStatus: MainlineCourse['qualityStatus']
  kps: PrepBriefKpEntry[]
  factAudit: PrepBriefFactAuditSummary
  presentationReview: PrepBriefPresentationReview
  skeletonRationale: PrepBriefSkeletonRationale[]
  qualitySummary: PrepBriefQualitySummary
  executorBreakdown: PrepBriefExecutorBreakdown
  /** 简报组装时间(报告元数据,不是教研数据本身)。 */
  generatedAt: string
}

const VERDICT_PATTERN = /^(?:断言核查|跨幕一致性核查) (FATAL|MISLEADING|IMPRECISE):/
const UNVERIFIED_FACT_PATTERN = /事实核查未完成.*未经验证/

function isReleaseBlockingFactIssue(issue: FactAuditRecord['issues'][number]): boolean {
  return issue.severity === 'blocking' || VERDICT_PATTERN.exec(issue.message)?.[1] === 'MISLEADING'
}

/** 课程实际用到的 KP id 清单,顺序与建课时的勾选顺序一致(sourceMaterial 逐一对应)。 */
function courseKpIds(course: MainlineCourse): string[] {
  return course.sourceMaterial
    .map(s => s.kpId)
    .filter((id): id is string => Boolean(id))
}

function buildMisconceptions(
  course: MainlineCourse,
  kpId: string,
  misconceptions: readonly string[],
): PrepBriefMisconception[] {
  // 处理误区的幕有两种:contrast 辨析幕吃 misconceptions[0](仅 conceptual 骨架有此步骤),
  // v5 M2 起 ai-verify 找茬幕**收编其余全部条目**(procedural/factual/metacognitive 无
  // contrast 步骤时则收编全部)——见 generation/skeleton-library.ts aiVerifyStepsFor。
  //
  // 2026-07-27 修:原实现只认 contrast 幕,把已被 ai-verify 覆盖的误区报成「未处理」,
  // 教师看到假警报、可能手工插一幕做已经做过的事。
  //
  // ai-verify 覆盖了哪几条,**读溯源字段**:compile-lesson 保证 misconceptionSource(s)
  // 逐字来自 SkeletonKpInput.misconceptions 原文(见其注释「供溯源闸门校验」),
  // 故按文本相等精确匹配即可,统一走 domain.ts 的 misconceptionSourcesOf 入口
  // (该处明令禁止各处自行判断)。**不要改用 aiClaim1..N 细槽计数**——domain.ts 已注明
  // 细槽是「向前预留、现状渲染器不读」的脚手架,拿它当覆盖依据在细槽被编辑后会失真。
  const contrastScene = course.scenes.find(s => s.sceneType === 'contrast' && s.kpId === kpId)
  const verifyScene = course.scenes.find(s => s.sceneType === 'ai-verify' && s.kpId === kpId)
  const contrastCovered = new Set(contrastScene ? misconceptionSourcesOf(contrastScene) : [])
  const verifyCovered = new Set(verifyScene ? misconceptionSourcesOf(verifyScene) : [])

  // 幕上措辞与当前标注整体零命中且确有处理幕 → 措辞漂移(标注刷新后的典型症状),
  // 报「暂无幕处理」是假警报;有部分精确命中时,未命中条仍是真漏处理,照实报。
  const anyExactHit = misconceptions.some(text => contrastCovered.has(text) || verifyCovered.has(text))
  const driftScene = !anyExactHit && (contrastCovered.size > 0 || verifyCovered.size > 0)
    ? (verifyScene ?? contrastScene)
    : undefined

  return misconceptions.map(text => {
    const byContrast = contrastCovered.has(text)
    const byVerify = verifyCovered.has(text)
    const scene = byContrast ? contrastScene : byVerify ? verifyScene : undefined
    return {
      text,
      addressed: Boolean(scene),
      ...(scene ? { addressedInSceneId: scene.id } : {}),
      ...(!scene && driftScene ? { wordingDrift: true as const, reviewSceneId: driftScene.id } : {}),
      source: '教材标注' as const,
    }
  })
}

function buildMasteryNote(
  course: MainlineCourse,
  kpId: string,
  record: MasteryRecord | undefined,
): PrepBriefMasteryNote {
  const score = record?.score
  const fragment = course.learningFragments.find(f => f.kpId === kpId)
  return {
    ...(score !== undefined ? { score } : {}),
    ...(record ? { evidenceStatus: record.evidenceStatus } : {}),
    ...(record?.latestEvidence ? { latestEvidence: record.latestEvidence } : {}),
    // 演示种子和来源不明的历史分数可披露，但不能在备课简报中冒充当前薄弱诊断。
    isWeakNow: record !== undefined
      && masteryCanGuideLowRiskAdaptation(record.evidenceStatus)
      && isWeakMastery(score),
    reinforcedInSkeleton: Boolean(fragment?.skeletonId?.endsWith('-reinforced')),
    source: '学情档案',
  }
}

const GENERIC_SUPPORT_SCENE_TYPES: ReadonlySet<SceneType> = new Set([
  'concept-build',
  'worked-example',
  'visual-observation',
])

function unavailableContingencyPlan(reason: string): PrepBriefContingencyPlan {
  return {
    available: false,
    missingReason: reason,
    moves: [],
    source: '骨架库',
  }
}

/**
 * 把“观察到什么证据后做什么”预先写成可执行分支。这里只使用课程中真实存在的页面，
 * 不根据分数猜测全班状态，也不为制造分支而编造教材误区。
 */
function buildContingencyPlan(
  course: MainlineCourse,
  kpId: string,
  misconceptions: readonly PrepBriefMisconception[],
): PrepBriefContingencyPlan {
  const fragment = course.learningFragments.find(candidate => candidate.kpId === kpId)
  if (!fragment) {
    return unavailableContingencyPlan('本知识点没有学习片段，无法把成功标准与课堂页面对应起来。')
  }

  const successSignal = fragment.successSignal.trim()
  if (!successSignal) {
    return unavailableContingencyPlan('本知识点缺少可观察的成功信号，暂时不能制定可靠应变分支。')
  }

  const fragmentScenes = fragment.sceneIds
    .map(sceneId => course.scenes.find(scene => scene.id === sceneId))
    .filter((scene): scene is LessonScene => Boolean(scene))
  const practiceScene = fragmentScenes.filter(scene => scene.sceneType === 'practice').at(-1)
  if (!practiceScene) {
    return unavailableContingencyPlan('本知识点没有独立练习，无法先取得完整成功标准的课堂证据。')
  }

  const practiceIndex = fragmentScenes.findIndex(scene => scene.id === practiceScene.id)
  const supportScene = fragmentScenes
    .slice(0, practiceIndex)
    .reverse()
    .find(scene => GENERIC_SUPPORT_SCENE_TYPES.has(scene.sceneType))
  const nextSceneIndex = course.scenes.findIndex(scene => scene.id === practiceScene.id) + 1
  const nextScene = nextSceneIndex > 0 ? course.scenes[nextSceneIndex] : undefined

  const moves: PrepBriefContingencyMove[] = [{
    kind: 'advance',
    trigger: `独立作答已经达到：${successSignal}`,
    action: '不重复整段讲解；请学生用一句话说清依据，然后继续下一项学习活动。',
    ...(nextScene ? { targetSceneId: nextScene.id } : {}),
    source: '骨架库',
  }, {
    kind: 'repair',
    trigger: `独立作答尚未达到：${successSignal}`,
    action: supportScene
      ? '回到最近的支架页，只处理第一处缺失的依据或步骤；不直接给答案，再返回独立练习重答。'
      : '只提示检查路径，不给出答案；让学生定位第一处缺失的依据或步骤，再完成独立练习。',
    ...(supportScene ? { targetSceneId: supportScene.id } : {}),
    resumeSceneId: practiceScene.id,
    source: '骨架库',
  }]

  const misconceptionsByScene = new Map<string, string[]>()
  for (const misconception of misconceptions) {
    if (!misconception.addressedInSceneId) continue
    const texts = misconceptionsByScene.get(misconception.addressedInSceneId) ?? []
    texts.push(misconception.text)
    misconceptionsByScene.set(misconception.addressedInSceneId, texts)
  }
  for (const [sceneId, texts] of misconceptionsByScene) {
    moves.push({
      kind: 'misconception',
      trigger: `学生出现教材误区：${texts.join('；')}`,
      action: '定位到已绑定的辨析或找茬页，让学生先指出冲突证据，再返回独立练习重新作答。',
      targetSceneId: sceneId,
      resumeSceneId: practiceScene.id,
      source: '教材标注',
    })
  }

  return {
    available: true,
    successSignal,
    practiceSceneId: practiceScene.id,
    moves,
    source: '骨架库',
  }
}

function buildKpEntries(
  course: MainlineCourse,
  kpMetadata: ReadonlyMap<string, KpMetadata>,
  masteryByKpId: ReadonlyMap<string, MasteryRecord>,
): PrepBriefKpEntry[] {
  return courseKpIds(course).map(kpId => {
    const meta = kpMetadata.get(kpId)
    const sourceMaterialTitle = course.sourceMaterial.find(s => s.kpId === kpId)?.title
    const misconceptions = buildMisconceptions(course, kpId, meta?.misconceptions ?? [])
    return {
      kpId,
      canonicalName: meta?.canonicalName ?? sourceMaterialTitle ?? kpId,
      knowledgeType: meta?.knowledgeType ?? DEFAULT_KP_KNOWLEDGE_TYPE,
      knowledgeTypeSource: meta?.knowledgeType ? '教材标注' : '默认兜底',
      learningObjectives: meta?.learningObjectives ?? [],
      misconceptions,
      contingencyPlan: buildContingencyPlan(course, kpId, misconceptions),
      mastery: buildMasteryNote(course, kpId, masteryByKpId.get(kpId)),
    }
  })
}

function buildFactAuditSummary(course: MainlineCourse): PrepBriefFactAuditSummary {
  const record = course.factAudit
  if (!record) {
    return {
      available: false,
      auditedSceneCount: 0,
      consistencyAvailable: false,
      consistencyAuditedSceneCount: 0,
      consistencyConflictCount: 0,
      pendingSceneCount: 0,
      unverifiedSceneCount: 0,
      fatalCount: 0,
      byScene: [],
      source: '事实核查',
    }
  }

  const bySceneMap = new Map<string, PrepBriefFactAuditSceneEntry>()
  const unverifiedSceneIds = new Set([
    ...(record.unverifiedSceneIds ?? []),
    ...record.issues.filter(issue => UNVERIFIED_FACT_PATTERN.test(issue.message)).map(issue => issue.targetId),
  ])
  for (const sceneId of record.pendingSceneIds ?? []) {
    const scene = course.scenes.find(candidate => candidate.id === sceneId)
    if (!scene) continue
    bySceneMap.set(sceneId, {
      sceneId,
      sceneType: scene.sceneType,
      ...(scene.kpId ? { kpId: scene.kpId } : {}),
      fatalCount: 0,
      misleadingCount: 0,
      impreciseCount: 0,
      unverified: unverifiedSceneIds.has(sceneId),
      pendingReview: true,
      details: [{
        severity: 'info',
        message: '教师修改后尚未重新进行事实核查。',
        impact: '本页的新断言可能尚未经过教材事实核验。',
        fix: '打开本页并点击“核查本页”，通过后再开始上课。',
      }],
    })
  }

  for (const sceneId of unverifiedSceneIds) {
    if (bySceneMap.has(sceneId)) continue
    const scene = course.scenes.find(candidate => candidate.id === sceneId)
    if (!scene) continue
    bySceneMap.set(sceneId, {
      sceneId,
      sceneType: scene.sceneType,
      ...(scene.kpId ? { kpId: scene.kpId } : {}),
      fatalCount: 0,
      misleadingCount: 0,
      impreciseCount: 0,
      unverified: true,
      pendingReview: false,
      details: [],
    })
  }

  for (const issue of record.issues) {
    const sceneId = issue.targetId
    const scene = course.scenes.find(s => s.id === sceneId)
    let entry = bySceneMap.get(sceneId)
    if (!entry) {
      entry = {
        sceneId,
        ...(scene ? { sceneType: scene.sceneType } : {}),
        ...(scene?.kpId ? { kpId: scene.kpId } : {}),
        fatalCount: 0,
        misleadingCount: 0,
        impreciseCount: 0,
        unverified: false,
        pendingReview: false,
        details: [],
      }
      bySceneMap.set(sceneId, entry)
    }

    const verdict = VERDICT_PATTERN.exec(issue.message)?.[1]
    if (verdict === 'FATAL') entry.fatalCount += 1
    else if (verdict === 'MISLEADING') entry.misleadingCount += 1
    else if (verdict === 'IMPRECISE') entry.impreciseCount += 1
    else if (UNVERIFIED_FACT_PATTERN.test(issue.message)) entry.unverified = true

    entry.details.push({ severity: issue.severity, message: issue.message, impact: issue.impact, fix: issue.fix })
  }

  return {
    available: true,
    ...(record.auditedAt ? { auditedAt: record.auditedAt } : {}),
    auditedSceneCount: record.auditedSceneCount,
    consistencyAvailable: record.consistencyAuditedSceneIds !== undefined,
    consistencyAuditedSceneCount: record.consistencyAuditedSceneIds?.length ?? 0,
    consistencyConflictCount: record.consistencyConflictCount
      ?? record.issues.filter(issue => issue.id.includes(':consistency-') && issue.severity !== 'info').length,
    pendingSceneCount: record.pendingSceneIds?.length ?? 0,
    unverifiedSceneCount: unverifiedSceneIds.size,
    // 旧记录把 MISLEADING 保存成 warning 且未计入 fatalCount；摘要按当前发布边界
    // 重新解释，避免教师看到“误导阻断”卡片时页头仍显示 0 处严重问题。
    fatalCount: Math.max(record.fatalCount, record.issues.filter(isReleaseBlockingFactIssue).length),
    ...(record.repairTrace ? { repairTrace: record.repairTrace } : {}),
    byScene: [...bySceneMap.values()].sort((left, right) => {
      const leftIndex = course.scenes.findIndex(scene => scene.id === left.sceneId)
      const rightIndex = course.scenes.findIndex(scene => scene.id === right.sceneId)
      return leftIndex - rightIndex
    }),
    source: '事实核查',
  }
}

function buildSkeletonRationale(
  course: MainlineCourse,
  kpMetadata: ReadonlyMap<string, KpMetadata>,
): PrepBriefSkeletonRationale[] {
  const kpFragments = course.learningFragments.filter(
    (f): f is LearningFragment & { kpId: string; skeletonId: string } => Boolean(f.kpId && f.skeletonId),
  )
  return kpFragments.map(fragment => {
    const meta = kpMetadata.get(fragment.kpId)
    const reinforced = fragment.skeletonId.endsWith('-reinforced')
    // 用持久化的 kpId + skeletonId 后缀(而非当前学情)重放 fragmentSkeletonFor,
    // 还原生成时实际展开的骨架形状(teachingType/steps),successSignal 本身已落库直接取用。
    const skeleton = fragmentSkeletonFor({
      id: fragment.kpId,
      canonicalName: meta?.canonicalName ?? fragment.kpId,
      ...(meta?.knowledgeType ? { knowledgeType: meta.knowledgeType } : {}),
      ...(meta?.misconceptions ? { misconceptions: meta.misconceptions } : {}),
      needsReinforcement: reinforced,
    })
    return {
      fragmentId: fragment.id,
      kpId: fragment.kpId,
      skeletonId: fragment.skeletonId,
      teachingType: skeleton.teachingType,
      steps: skeleton.steps,
      successSignal: fragment.successSignal,
      reinforced,
      source: '骨架库',
    }
  })
}

function buildQualitySummary(course: MainlineCourse): PrepBriefQualitySummary {
  const issues = auditMainlineCourse(course)
  return { ...summarizeQuality(issues), source: '质量闸门' }
}

function buildPresentationReview(course: MainlineCourse): PrepBriefPresentationReview {
  const findings = auditPresentationAntipatterns(course)
  return {
    findings,
    high: findings.filter(finding => finding.severity === 'high').length,
    medium: findings.filter(finding => finding.severity === 'medium').length,
    low: findings.filter(finding => finding.severity === 'low').length,
    blocking: false,
    source: '真检判例',
  }
}

/** 固定展示顺序:教师最关心"我要讲多少",排最前;AI 排最后。 */
const EXECUTOR_BREAKDOWN_ORDER: readonly Executor[] = ['teacher', 'co', 'ai']

/** 新课使用骨架写入的逐幕时长；存量课没有该字段时，仍按所属片段均摊，
 * 保持旧课可用而不在读取时静默改库。显式的非法时长返回 0，由质量闸门单独阻断。 */
function sceneDurationEstimate(course: MainlineCourse, sceneId: string): number {
  const scene = course.scenes.find(candidate => candidate.id === sceneId)
  if (scene?.durationTargetSec !== undefined) {
    return Number.isFinite(scene.durationTargetSec) && scene.durationTargetSec > 0
      ? scene.durationTargetSec
      : 0
  }
  const fragment = course.learningFragments.find(f => f.sceneIds.includes(sceneId))
  if (!fragment || fragment.sceneIds.length === 0) return 0
  const fragmentScenes = fragment.sceneIds
    .map(id => course.scenes.find(candidate => candidate.id === id))
    .filter((candidate): candidate is LessonScene => Boolean(candidate))
  const explicitDuration = fragmentScenes.reduce((sum, candidate) => {
    const duration = candidate.durationTargetSec
    return sum + (duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : 0)
  }, 0)
  const missingCount = fragmentScenes.filter(candidate => candidate.durationTargetSec === undefined).length
  if (missingCount === 0) return 0
  return Math.max(fragment.durationTargetSec - explicitDuration, 0) / missingCount
}

function buildExecutorBreakdown(course: MainlineCourse): PrepBriefExecutorBreakdown {
  const totals = new Map<Executor, { sceneCount: number; durationSec: number }>(
    EXECUTOR_BREAKDOWN_ORDER.map(executor => [executor, { sceneCount: 0, durationSec: 0 }]),
  )

  for (const scene of course.scenes) {
    const entry = totals.get(sceneExecutor(scene))!
    entry.sceneCount += 1
    entry.durationSec += sceneDurationEstimate(course, scene.id)
  }

  const byExecutor = EXECUTOR_BREAKDOWN_ORDER.map(executor => {
    const entry = totals.get(executor)!
    return { executor, sceneCount: entry.sceneCount, estimatedDurationSec: Math.round(entry.durationSec) }
  })

  return {
    byExecutor,
    totalDurationSec: byExecutor.reduce((sum, entry) => sum + entry.estimatedDurationSec, 0),
    source: '骨架库',
  }
}

/** 纯函数组装:course + 已取好的 KP 元数据 + 学情分数 → 结构化简报。不触发任何 I/O。 */
export function assemblePrepBrief(
  course: MainlineCourse,
  kpMetadata: ReadonlyMap<string, KpMetadata>,
  masteryByKpId: ReadonlyMap<string, MasteryRecord>,
): PrepBrief {
  return {
    courseId: course.id,
    topic: course.topic,
    gradeBand: course.gradeBand,
    subject: course.subject,
    qualityStatus: course.qualityStatus,
    kps: buildKpEntries(course, kpMetadata, masteryByKpId),
    factAudit: buildFactAuditSummary(course),
    presentationReview: buildPresentationReview(course),
    skeletonRationale: buildSkeletonRationale(course, kpMetadata),
    qualitySummary: buildQualitySummary(course),
    executorBreakdown: buildExecutorBreakdown(course),
    generatedAt: new Date().toISOString(),
  }
}

/** 唯一 impure 入口:按 courseId 取 store + mastery-store + kp-metadata,组装简报。课程不存在时返回 undefined。 */
export async function buildPrepBriefForCourse(courseId: string): Promise<PrepBrief | undefined> {
  const course = await findMainlineCourse(courseId)
  if (!course) return undefined

  const kpIds = courseKpIds(course)
  const [kpMetadata, masteryByKpId] = await Promise.all([
    fetchKpMetadata(kpIds),
    masteryRecordsOf(kpIds),
  ])

  return assemblePrepBrief(course, kpMetadata, masteryByKpId)
}
