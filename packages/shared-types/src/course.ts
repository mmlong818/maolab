/**
 * Course — v2 顶层聚合（Sprint 0）
 *
 * 一个 Course 把 Plan / MethodPlan / Rundown / ScriptDoc[] / Atom[] 串起来
 * 它的 status 字段是整个三关审批 + 生成管线的状态机
 */

import type { TeachingPlanV2 } from './teaching-plan.js'
import type { TeachingMethodPlan } from './teaching-method-plan.js'
import type { Rundown } from './rundown.js'
import type { ShowScript } from './show-script.js'
import type { SceneAtom } from './scene-atom.js'
import type { ScriptDoc } from './script-doc.js'

/** Course 状态机（v2） */
export type CourseStatusV2 =
  | 'analyzing'         // /api/analyze 进行中
  | 'auditing'          // /api/material-audit 进行中(B2 新增:检查内容完整度)
  | 'audited'           // audit 结果待用户确认目标和补全(B2 新增)
  | 'plan-draft'        // TeachingPlan 草稿待审批
  | 'plan-approved'     // 已通过计划，等待方法规划
  | 'method-drafting'   // /api/method-plan 进行中
  | 'method-draft'      // TeachingMethodPlan 草稿待审批
  | 'method-approved'   // 已通过方法
  | 'rundown-drafting'  // /api/rundown 进行中
  | 'rundown-draft'     // Rundown 草稿待审批
  | 'rundown-approved'  // 节目单通过，进入生成
  | 'scripting'         // 讲稿生成中(每段增量保存)
  | 'scripted'          // 讲稿全部生成完毕，等待用户审阅/触发 atom 生成
  | 'generating'        // (兼容旧链路) 讲稿+atom 一次性生成中
  | 'atom-generating'   // 基于 scriptDocs 生成 atom 中
  | 'ready'             // 全部生成完毕，可上课
  | 'failed'            // 任一阶段失败

/** 创建来源 */
export type CourseOrigin =
  | 'one-line'          // 一句话主题
  | 'paragraph'         // 一段话描述
  | 'material'          // 教材 / 教辅上传
  | 'kp-selection'      // 从教材 KP 树勾选(多 KP 建课, 跳过 analyze)

/** 图配置规则 (v1, 4 维) — 全课所有图共享这套策略 */
export interface ImagePolicy {
  /** 维度 1: 配图密度 (按学段+课长生成) */
  density: {
    /** 推荐图数 */
    target: number
    /** 上限 (硬约束, 超量裁剪) */
    max: number
    /** 下限 */
    min: number
  }
  /** 维度 2: 触发场景规则 — 哪些 atom role 必配 / 强烈建议 / 禁配 */
  triggers: {
    mustHave: string[]      // role 列表, 如 ['hook', 'introduce-history']
    encouraged: string[]    // 如 ['illustrate', 'demonstration']
    forbidden: string[]     // 如 ['single-question', 'derivation-step', 'dialogue-turn']
  }
  /** 维度 3: 学科适配 — 一句话描述该学科图的典型形态 */
  subjectGuidance: string
  /** 维度 4: 视觉风格 token — 全课统一, 自动追加到每张图 prompt */
  visualStyle: string
  /** 风格英文描述 (给生图 API 用, 中文模型有时识别差) */
  visualStyleEn?: string | undefined
  generatedAt: number
}

/** 内容完整度审计结果(B2 新增) */
export interface MaterialAudit {
  /** 输入内容能支撑的知识点 */
  coverage: { topic: string; evidence?: string | undefined }[]
  /** 主题需要但当前输入不足以覆盖的内容 */
  gaps: { topic: string; reason: string; severity: 'critical' | 'recommended' | 'optional' }[]
  /** 建议的教学边界(讲什么不讲什么) */
  boundaries: { include: string[]; exclude: string[] }
  /** AI 提议的教学目标(用户可勾选/编辑后才进 plan 阶段) */
  proposedObjectives: { id: string; statement: string; rationale: string; selected?: boolean | undefined }[]
  /** 用户审阅后的修订(可由前端覆写) */
  userAccepted?: {
    selectedObjectiveIds: string[]
    addedObjectives: { id: string; statement: string }[]
    boundaryOverrides?: { include?: string[] | undefined; exclude?: string[] | undefined } | undefined
  } | undefined
  /** 图配置规则 v1: 全课视觉策略 */
  imagePolicy?: ImagePolicy | undefined
  /** B-4 关键词 (extractKeywords) */
  keywords?: string[] | undefined
  /** B-4 教材内容四栏 (analyzeMaterialContent) */
  materialAnalysis?: {
    status: string
    coreQuestion: string
    logic: string
    knowledgeMap: Array<{ concept: string; children: string[] }>
  } | undefined
  /** B-5 学情分析四栏 (analyzeStudentSituation) */
  studentSituation?: {
    priorKnowledge: string[]
    pitfalls: Array<{
      pitfall: string
      whyHappens: string
      fix: string
      severity: 'critical' | 'moderate' | 'minor'
    }>
  } | undefined
  /** 是否注入了 lessonPlanBaseline (供 UI 显示 "已对齐国家教学设计") */
  baselineLessonId?: string | undefined
  /** 生成时间 */
  generatedAt: number
}

/** 上传素材引用 */
export interface CourseMaterial {
  id: string
  kind: 'pdf' | 'image' | 'url' | 'text'
  name: string
  /** 本地相对 URL 或外链 */
  src: string
  /** 提取后的文本摘要（供 prompt 使用） */
  extractedText?: string
}

/**
 * atom 生成失败的结构化记录.
 * - kind='atom': 单个 node 重试 N 次仍失败 (validator 错 / LLM 错)
 * - kind='segment': 整段 script-worker 失败, 段内 nodes 全未生成
 */
export type AtomGenWarning =
  | {
      kind: 'atom'
      nodeId: string
      error: string
      attempts: number
      failedAt: number
    }
  | {
      kind: 'segment'
      segmentId: string
      error: string
      failedAt: number
    }

export type LearningFragmentStage =
  | 'preview'
  | 'first-learn'
  | 'example'
  | 'misconception'
  | 'practice'
  | 'test'
  | 'review'

export type LearningFragmentForm =
  | 'story'
  | 'lecture'
  | 'comic'
  | 'experiment'
  | 'dialogue'
  | 'quiz'
  | 'real-case'
  | 'formula'
  | 'worked-example'

export interface LearningFragment {
  id: string
  title: string
  stage: LearningFragmentStage
  form: LearningFragmentForm
  objective: string
  durationTargetSec: number
  durationEstimatedSec: number
  atomIds: string[]
  rundownSegmentIds: string[]
  knowledgePointIds: string[]
  prerequisiteFragmentIds: string[]
  successSignal: string
  designNotes?: string
  generatedAt: number
}

export type CastSchoolStage = 'primary' | 'middle' | 'high'
export type CastSeason = 'summer' | 'autumn'

export interface CastAssetSelection {
  schoolStage: CastSchoolStage
  season: CastSeason
  /** Server-side timestamp for the class-time cast swap. */
  resolvedAt?: number
}

export interface CourseV2 {
  /** Course id（贯穿所有子结构） */
  id: string
  /** 标题（来自 plan.topic） */
  title: string
  /** 创建来源 */
  origin: CourseOrigin
  /** 原始输入 */
  rawInput: {
    text: string
    materials: CourseMaterial[]
  }
  /** 状态机 */
  status: CourseStatusV2
  /** 教材源(阶段 A 新增): 用户在创课时选定的国家智慧教育平台教材章节 */
  textbookSource?: {
    textbookId: string
    textbookTitle: string
    stage: '小学' | '初中' | '高中'
    subject: string
    version: string
    grade: string
    volume: string
    chapterId?: string
    chapterTitle?: string
    sectionId?: string
    sectionTitle?: string
  }
  /** 内容完整度审计结果(B2: plan 前置步骤) */
  materialAudit?: MaterialAudit
  /** 三关产物（可能为 undefined，按 status 推进） */
  teachingPlan?: TeachingPlanV2
  methodPlan?: TeachingMethodPlan
  rundown?: Rundown
  /** 导演场本（谁说什么/起什么作用/发生什么）。rundown 审批后生成，是多角色讲稿的蓝本。见 show-script.ts */
  showScript?: ShowScript
  /** 讲稿（一个 RundownSegment 对应一份 ScriptDoc） */
  scriptDocs?: Record<string, ScriptDoc>
  /** 原子列表（按 rundown node 顺序） */
  atoms?: SceneAtom[]
  learningFragments?: LearningFragment[]
  /**
   * 片段级质量门槛结果。
   * 用于把重复内容、连续同模板、错误生图承载、长句换行风险等问题前移到入库阶段。
   */
  fragmentQualityIssues?: Array<{
    fragmentId: string
    severity: 'warning' | 'critical'
    code?: string
    message: string
    fix?: string
    atomIds?: string[]
  }>
  /**
   * atom 生成过程中失败的节点 / segment 记录.
   * 2026-05-26 加入, 解决 v11 cluster 真检发现的"validator 失败→silent skip"问题.
   * 当 atomGenWarnings.length > 0 时, UI 应顶部 banner 提示"N 节内容生成失败".
   */
  atomGenWarnings?: AtomGenWarning[]
  /**
   * atom 暴力质检结果记录 (2026-05-27 加入).
   * atoms 生成完毕后跑规则 + AI 双层质检, 发现 critical issue 的 atom 会被
   * 重新生成 1 次. 这里记录每个被质检命中的 atom 的 issue 列表 + 重试结果.
   * finalPass=true 表示重试后通过; false 表示重试后仍有 critical issue.
   */
  atomQAWarnings?: Array<{
    atomId: string
    issues: Array<{ kind: string; field: string; message: string; severity: 'critical' | 'warning' }>
    retriedAt: number
    finalPass: boolean
  }>
  /**
   * v1.1 cluster #2: atom 按 KP 复用历史内容的记录.
   * 当本课某个 rundown node 被一个历史 atom 直接拷贝(相同 KP + 同 ageBand + 同 subject + 90 天内)替代时,
   * 在此追加一条. UI 顶部蓝色 banner 显示 "本课 N 个画面复用了历史内容".
   * atomId 是注入后的新 id (避免与旧 atom id 冲突); sourceCourseId 指向原课.
   */
  atomReuseLog?: Array<{
    atomId: string
    kpId: string
    sourceCourseId: string
    reusedAt: number
  }>
  /**
   * v1.1 cluster #2: 复用候选因分龄质检不合格被剔除的数量 (改走 LLM 重新生成).
   * 仅用于 UI banner 展示, 不持久化原因 (避免污染数据).
   */
  atomReuseRejectedCount?: number
  /** 用户在 v2-preview 选定的教师人设（来自 PRESET_TEACHERS） */
  selectedTeacherId?: string
  /** Server-resolved portrait matrix selection; frontend must not infer season from local time. */
  castAssetSelection?: CastAssetSelection
  /** 教师口语讲稿:{ atomId -> 一段自然口语,60-150 字 }(教师授课模式用) */
  narrations?: Record<string, string>
  /** narrations 对应的 teacherId(用于判断是否需要重新生成) */
  narrationsTeacherId?: string
  /** 自学陪伴话术:{ atomId -> 一段陪伴口吻,40-100 字 }(学生自学模式用) */
  selfNarrations?: Record<string, string>
  /** selfNarrations 对应的 teacherId */
  selfNarrationsTeacherId?: string
  /** 教师人设对 atom payload 的覆写 (问题5: onCorrect/onIncorrect 按人设重写) */
  payloadOverrides?: Record<string, Record<string, unknown>>
  /** payloadOverrides 对应的 teacherId */
  payloadOverridesTeacherId?: string
  /**
   * 节目单完成后异步抽取的核心知识点 id 列表 (v1.1 cluster 接入).
   * 由 lib/v2/persist-kps.ts 在 rundown 生成后 fire-and-forget 写入.
   * 失败不影响 atom 生成, 字段缺省表示尚未抽取或抽取失败.
   */
  knowledgePointIds?: string[]
  /**
   * 多 KP 建课入口的用户勾选 (Agent A2 PR2 加入).
   * 仅当 origin === 'kp-selection' 时存在.
   * mark 决定后续 rundown 生成策略:
   *   - 'new'     全量讲解
   *   - 'review'  快速复习
   *   - 'preview' 引入式预告
   * Agent A3 改 rundown 生成时会读这个字段决定节奏.
   */
  kpSelections?: Array<{
    kpId: string
    mark: 'new' | 'review' | 'preview'
  }>
  /**
   * 课中单 KP 即时媒体（开小灶口诀 / 知识地图漫画）的存储。
   * 注意（2026-06-13，presentation-system-design P1）：课后"全课换个方式记"工坊入口已删除，
   * 全课媒体改为课程流内的 media-interlude atom；本字段仅由课中动态场景（StudyCompanion/KnowledgeMap）写入。
   */
  mediaForms?: MediaForm[]
  /** 时间戳 */
  createdAt: number
  updatedAt: number
  /** 最后失败原因（若 status === 'failed'） */
  failureReason?: string
}

/** 媒介化产物 */
export interface MediaForm {
  id: string
  kind: 'song' | 'comic' | 'story' | 'longimage' | 'palace' | 'standup'
  title: string
  /** 覆盖的 KP id（可追溯, 防止媒介化时编造知识） */
  kpIds: string[]
  payload: SongPayload | ComicPayload | Record<string, unknown>
  generatedAt: number
}

/** 四格漫画 payload（方向 B） */
export interface ComicPayload {
  kind: 'comic'
  /** 主角设定（贯穿全篇, 保画风一致） */
  protagonist: string
  /** 漫画格 */
  panels: Array<{
    /** 画面描述（生图用） */
    scene: string
    /** 旁白（格顶/格底） */
    narration?: string | undefined
    /** 对白气泡 */
    speech?: { who: string; text: string } | undefined
    /** 本格落点 KP 名 */
    kpHint?: string | undefined
    /** 生成的图 URL */
    imageUrl?: string | undefined
  }>
}

/** 知识歌 payload（方向 A） */
export interface SongPayload {
  kind: 'song'
  /** 体裁: 口诀/儿歌/说唱/古风 */
  genre: string
  /** 逐句歌词 */
  lines: Array<{ text: string; kpHint?: string | undefined }>
  /** 可选副歌(重复段) */
  chorus?: string[]
  /** TTS 朗诵音色 id */
  voiceId?: string
}

/** 推进规则：什么状态允许走到什么状态 */
export const COURSE_STATUS_TRANSITIONS: Record<CourseStatusV2, CourseStatusV2[]> = {
  'analyzing': ['auditing', 'plan-draft', 'failed'],
  'auditing': ['audited', 'failed'],
  'audited': ['audited', 'plan-draft', 'failed'],
  'plan-draft': ['plan-draft', 'plan-approved', 'failed'],
  'plan-approved': ['method-drafting'],
  'method-drafting': ['method-draft', 'failed'],
  'method-draft': ['method-draft', 'method-approved', 'plan-draft', 'failed'],
  'method-approved': ['rundown-drafting'],
  'rundown-drafting': ['rundown-draft', 'failed'],
  'rundown-draft': ['rundown-draft', 'rundown-approved', 'method-draft', 'failed'],
  'rundown-approved': ['generating', 'scripting'],
  'scripting': ['scripted', 'failed'],
  'scripted': ['scripted', 'atom-generating', 'rundown-draft', 'failed'],
  'atom-generating': ['ready', 'failed'],
  'generating': ['ready', 'failed'],
  'ready': ['ready', 'scripting', 'atom-generating'],
  'failed': ['analyzing', 'method-drafting', 'rundown-drafting', 'generating', 'scripting', 'atom-generating'],
}

export function canTransition(from: CourseStatusV2, to: CourseStatusV2): boolean {
  return COURSE_STATUS_TRANSITIONS[from]?.includes(to) ?? false
}
