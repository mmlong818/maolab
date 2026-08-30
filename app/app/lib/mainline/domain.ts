import type { CastAssetSelection } from '@maolab/shared-types'
import type { CoursePlanningState } from './planning/page-contract.js'
import type { CoursePageContentState } from './planning/page-content-contract.js'

export type GradeBand = 'lower-primary' | 'upper-primary' | 'middle-school' | 'high-school'

export type SubjectId =
  | 'chinese'
  | 'math'
  | 'science'
  | 'english'
  | 'history'
  | 'politics'
  | 'geography'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'general'

/**
 * 学习时期(方向三·时期与时令 v1,2026-07-22):同一知识点在学年不同时刻的课,
 * 学习动作与表现姿态都不同——新授先预测后取证、复习先闭卷提取后纠错、
 * 考前先限时诊断后核查边界。缺省 'new'(旧课零回退,见 lessonPhaseOf)。
 * 幕数仍由知识类型与薄弱加固决定；学习时期不靠增页伪装差异。
 */
export type LessonPhase = 'new' | 'review' | 'exam-prep'

export const DEFAULT_LESSON_PHASE: LessonPhase = 'new'

export function lessonPhaseOf(course: { lessonPhase?: LessonPhase }): LessonPhase {
  return course.lessonPhase ?? DEFAULT_LESSON_PHASE
}

export type SceneType =
  | 'source-reading'
  | 'concept-build'
  | 'worked-example'
  | 'visual-observation'
  | 'contrast'
  | 'practice'
  | 'recap'
  /** v5 M2 双师剧本 AI 素养幕型(docs/v5-master-plan-2026-07-20.md §4 方向三)。 */
  | 'ai-verify'
  | 'ai-inquiry'
  | 'ai-collab'

/**
 * v5 M2 人机分工:每幕显式标注执教者。缺省 'ai'(旧课零回退——已落库课程没有
 * `executor` 字段时按 'ai' 读,见 sceneExecutor)。骨架库按 docs 设计草案 §1 表
 * 给新课分配默认值,教师可在工作台通过 PATCH 改写(见 EDITABLE_SCENE_FIELDS)。
 */
/**
 * 信息形状(E 轨,2026-07-28):这一幕的内容在**逻辑上**是什么形状。
 *
 * ## ⚠️ 立此词汇表的原始理由已被推翻,读之前先看清现状
 *
 * 本类型落地(E-1)时的立论是「内容的逻辑形状是选择器看不到的隐藏信息,
 * 需要生成期声明出来」。**该立论 2026-07-28 当天即被实测推翻**
 * (`tasks/e-infoshape-presentation-2026-07-28.md` 文末「实测推翻」,Codex 独立复核确认):
 *
 * `generation/fill-scenes.ts` 的 `SCENE_ROLES` 在生成 prompt 里**按幕型写死了槽键**
 * ——recap 的 `path` 必须用「→」连 3-5 节点(恒 progressive)、visual-observation 必须
 * `panelA/B/C` 三键(恒 parallel-3)、contrast 必须 `misconception`/`correction`
 * (恒 contrast-2)。真库 126 幕实测:**8 个幕型有 7 个的核心槽键组合只有 1 种**。
 *
 * **所以形状目前 100% 可由 `sceneType` 推出,不是隐藏信息。** 由 LLM 自报它零信息量、
 * 只增幻觉面;据此收窄母版候选也换不来任何跨幕区分。原 E-2/E-4/E-5 已废止。
 *
 * ## 那为什么还留着这套词汇
 *
 * 真正的缺口在**内容层**:每个幕型只有一种信息结构可选,参考课件那十种版式我们
 * 结构上产生不出来。方向 E′ 是让 `SCENE_ROLES` 从「一幕型一套槽键」变成
 * 「一幕型 N 套候选**结构模板**」。届时:
 *
 * > **形状是「本幕选了哪套结构模板」的派生结果,不是 LLM 的自由声明。**
 * > 可信性是白来的——模板的槽要么填了要么没填,不需要额外的证伪机器。
 *
 * 这套六值词汇届时仍然适用,故保留;但**它的来源是模板派生,不是自报**。
 *
 * | 形状 | 判据(用于选模板,不是用于校验声明) |
 * |---|---|
 * | `parallel` 并列 | 任意调换两项,意思不变? |
 * | `progressive` 递进 | 调换后读不通,后项依赖前项? |
 * | `radial` 放射 | 去掉中心项,其余各项失去意义? |
 * | `contrast` 对照 | 恰好两侧,且要点能一一对位? |
 * | `hierarchy` 总分 | 有一句总述,其余都在支撑它? |
 * | `chronological` 时序 | 各项带**真实时间刻度**? |
 *
 * 两处刻意划清的边界(不划清就会互相污染):
 * - `radial` vs `hierarchy`:放射的中心是**对象**(一个句子、一个人物);总分的总是**论断**。
 * - `progressive` vs `chronological`:递进是**逻辑依赖**;时序是**时间坐标**。没年代就不是时序。
 *
 * ## 现状:E′ 已先在收束页落地
 *
 * 新生成的 recap 会由 `recap-template.ts` 根据知识点数量、认知类型和已标注误区
 * 确定模板并派生本值；生成模型只填模板槽，不能声明或改写形状。存量课程不迁移，
 * 缺省时继续走旧版 path/takeaway，因而旧课视觉与数据保持兼容。
 */
export type InfoShape =
  | 'parallel'
  | 'progressive'
  | 'radial'
  | 'contrast'
  | 'hierarchy'
  | 'chronological'

export const INFO_SHAPES: readonly InfoShape[] = [
  'parallel',
  'progressive',
  'radial',
  'contrast',
  'hierarchy',
  'chronological',
]

export type Executor = 'teacher' | 'ai' | 'co'

/** LessonScene.executor 缺省值——判断/价值/组织讨论归教师,演示/反馈归 AI,不标注即 AI。 */
export const DEFAULT_EXECUTOR: Executor = 'ai'

/** 读取一幕的执教者,统一处理旧课缺省语义,禁止各处散落 `?? 'ai'`。 */
export function sceneExecutor(scene: Pick<LessonScene, 'executor'>): Executor {
  return scene.executor ?? DEFAULT_EXECUTOR
}

/**
 * 会由 fill-images 配整幅插图的幕型——**唯一事实源**。
 * fill-scenes 据此告知 LLM 哪些幕可指图讲解、哪些幕严禁指图表述;
 * quality-gates 据此拦截"无图幕文本指图"的课堂事故。
 */
export const IMAGE_SCENE_TYPES: readonly SceneType[] = ['visual-observation', 'contrast', 'recap']

/**
 * 配图保真档——不同学段对配图的诉求本质不同:
 * - `diagram-accurate` 准确图示:数量/比例/空间/年代关系必须经得起学科教师推敲
 * - `stylized-teaching` 风格化教学图:核心教学对象保真,周边表现自由
 * - `atmosphere` 氛围配图:只负责情绪与好奇心,禁止长得像图表以免被误读为事实
 * 定档策略(学段×学科×幕型)见 generation/image-fidelity,生成期显式落档,禁止各端自猜。
 */
export type ImageFidelity = 'diagram-accurate' | 'stylized-teaching' | 'atmosphere'

export type SceneTechniqueId =
  | 'static-board'
  | 'layered-reveal'
  | 'local-zoom'
  | 'path-tracing'
  | 'comparison-slider'
  | 'timeline'
  | 'draggable-model'
  | 'dynamic-chart'
  | 'simulation'
  | 'step-replay'

export type DialogueLayout =
  | 'teacher-left-content-right'
  | 'student-right-content-left'
  | 'dual-characters-center-content'
  | 'bottom-rpg'
  | 'corner-avatar'
  | 'narration-only'
  | 'no-character'

export type PeerFunction =
  | 'none'
  | 'questioner'
  | 'misconception'
  | 'attempt-answer'
  | 'peer-restate'
  | 'emotion-buffer'
  | 'comparison'

export type SubjectTeachingMode =
  | 'text-close-reading'
  | 'step-derivation'
  | 'experiment-observation'
  | 'pronunciation-modeling'
  | 'evidence-reading'
  | 'spatial-reasoning'
  | 'general-explanation'

export type BeatAction = 'reveal' | 'speak' | 'point' | 'ask' | 'wait' | 'react'

export type QualityGateId =
  | 'pedagogy'
  | 'visual'
  | 'performance'
  | 'asset'
  | 'cast-voice-grade'
  | 'technique'

export interface LessonGoal {
  id: string
  /** 目标对应的知识点 id；新课按 KP 建立，旧课可缺省。 */
  kpId?: string
  statement: string
  successSignal: string
  nonGoals?: string[]
}

/** 来源能证明到哪一层；目录定位和 AI 提取都不能冒充教材原文。 */
export type SourceEvidenceStatus = 'authoritative-excerpt' | 'curriculum-metadata' | 'ai-extracted' | 'unverified-excerpt'

export interface SourceProvenance {
  source: string
  externalId?: string
  confidence?: number
  evidenceStatus: SourceEvidenceStatus
}

/** 已与知识点和标题双重匹配的备课候选，不代表已经进入学生页面。 */
export interface SourceAssetRef {
  id: string
  kind: 'textbook-asset'
  title: string
  assetUrl: string
  mediaType: string
  sourceUrl?: string
  citation?: string
  revealPolicy?: string
}

export interface SourceMaterialRef {
  kind: 'textbook' | 'poem' | 'problem' | 'definition' | 'formula' | 'historical-source' | 'experiment-data' | 'generated-example'
  title: string
  excerpt?: string
  citation?: string
  /** 素材对应的知识点 id;由 compile-lesson 写入,供按 kpId 反查 KP 名。 */
  kpId?: string
  provenance?: SourceProvenance
  candidateResources?: readonly SourceAssetRef[]
}

export type SourceMaterialGrounding = Pick<SourceMaterialRef, 'excerpt' | 'citation' | 'provenance' | 'candidateResources'>

export interface CharacterExpressionAsset {
  expression: string
  src: string
  kind: 'half-body-cutout' | 'avatar-cutout' | 'fallback-symbol'
  transparentBackground: boolean
}

export interface CastProfile {
  id: string
  role: 'teacher' | 'student' | 'narrator' | 'peer'
  displayName: string
  identity: string
  gradeFit: GradeBand[]
  subjectFit: SubjectId[]
  visualIdentity: string
  expressionSet: readonly string[]
  assetRefs?: readonly CharacterExpressionAsset[]
}

export interface VoiceProfile {
  castId: string
  voiceId: string
  pace: 'slow' | 'medium' | 'fast'
  emotionRange: readonly string[]
  stabilityRule: string
}

export interface GradeAdaptationProfile {
  gradeBand: GradeBand
  languageDensity: 'low' | 'medium' | 'high'
  boardDensity: 'low' | 'medium' | 'high'
  interactionDensity: 'low' | 'medium' | 'high'
  teacherPace: 'slow' | 'medium' | 'fast'
  roleMaturity: 'childlike' | 'balanced' | 'mature'
}

export interface TeacherSubjectProfile {
  teacherId: string
  subject: SubjectId
  teachingMode: SubjectTeachingMode
  boardStyle: string
  techniquePreference: SceneTechniqueId[]
  voiceNotes: string
}

export interface PeerRoleProfile {
  peerId: string
  allowedFunctions: PeerFunction[]
  nonGoals: string[]
}

export interface TeachingSkeleton {
  id: string
  knowledgeType: string
  teachingType: string
  arc: readonly string[]
  requiredVisualForms: readonly string[]
  requiredChecks: readonly QualityGateId[]
  nonGoals: readonly string[]
}

export interface LearningFragment {
  id: string
  goalId: string
  /**
   * 本知识点完整教学序列的目标总时长，可由多个独立学生页面累加而成。
   * 它不等于单次认知分段；新课的单页节奏以 LessonScene.durationTargetSec 为准。
   */
  durationTargetSec: number
  sceneIds: string[]
  successSignal: string
  /** 片段承载的知识点 id;开场/收束等课级片段无此值。 */
  kpId?: string
  /** 展开本片段所用的片段骨架 id(skeleton-library);P3 换骨架 = 换 id 重展开。 */
  skeletonId?: string
}

export interface CharacterLayer {
  castId?: string
  expression?: string
  layout: DialogueLayout
  positionRule: string
  exitRule: string
}

export interface VoiceCue {
  castId?: string
  emotion: string
  pace: 'slow' | 'medium' | 'fast'
  pauseRule: string
}

export interface LessonScene {
  id: string
  sceneType: SceneType
  /** 本幕聚焦的知识点 id;开场/收束等课级幕无此值。P3 删页/单页重生成按此定位。 */
  kpId?: string
  /**
   * 本页一个主要教学动作的目标时长。新骨架必须写入；存量课缺省时，
   * 备课简报会按所属 LearningFragment 总时长平均估算，不强制改库。
   */
  durationTargetSec?: number
  visualLayout: string
  contentSlots: Record<string, string>
  /**
   * 本幕内容的逻辑形状(E 轨)。可选；当前由收束结构模板和元认知策略页消费。
   *
   * 定位已随 E 轨立论推翻而改变(见 `InfoShape` 顶部说明):它**不是给 LLM 自报的字段**
   * ——它记录的是**本幕选了哪套结构模板**,由知识类型与编译模板派生而非由 LLM
   * 自报。同一 concept-build 已可分别采用普通定义页或元认知策略闭环页；存量课程
   * 可以继续缺省并沿用旧版式。
   */
  infoShape?: InfoShape
  visualFocus: string
  narrationAnchor: string
  syncStrategy: string
  boardText: string[]
  sceneTechnique: SceneTechniqueId
  interactionContract: string
  fallbackPresentation: string
  characterLayer: CharacterLayer
  dialogueLayout: DialogueLayout
  peerFunction: PeerFunction
  subjectTeachingMode: SubjectTeachingMode
  voiceCue: VoiceCue
  gradeTone: string
  teacherScript: string
  studentAction: string
  evidenceOnScreen: string[]
  /** 由 fill-images 生成的教学配图 URL(如 `/generated-images/xxx.png`)。可选:仅覆盖 visual-observation / contrast / recap 等需要图示的 sceneType。 */
  imageUrl?: string
  /** 生成 imageUrl 时使用的 prompt,便于重试或追溯质量。 */
  imagePrompt?: string
  /** 生成 imageUrl 时采用的保真档,与 imagePrompt 一同留痕。 */
  imageFidelity?: ImageFidelity
  /** 生成图的原生宽高比 `W:H`(按版式槽位定制,如 '1312:880');存量 '3:2'/'1:1' 兼容,缺省按 3:2。 */
  imageAspect?: string
  /**
   * v5 M1 逐页编辑:教师手改过本幕内容字段(见 EDITABLE_SCENE_FIELDS)。
   * 非 force 的整课 fill 据此跳过本幕重填,避免覆盖教师手改;
   * 单幕 regen / 整课 fill?force=1 会清除此标记(视为重新交给 AI 生成)。
   */
  editedByTeacher?: boolean
  /**
   * v5 M2 双师人机分工:本幕执教者。缺省(undefined)按 'ai' 读,见 sceneExecutor——
   * 旧课/未标注课零回退。
   */
  executor?: Executor
  /**
   * v5 M2 contrast / ai-verify 专属:本幕明确处理的源头误概念原文,逐字复制自该 KP 的
   * misconceptions 标注(SkeletonKpInput.misconceptions),生成期一次性落档,
   * fill-scenes 只覆写 contentSlots/teacherScript 等内容字段、不触碰此字段——
   * 溯源闸门(quality-gates pushAiVerifyIssues)据此校验 AI 的错误说法没有偏离
   * 教研背书的误区注册文本,禁止 LLM 自由编造错误。用于知识点误区辨析
   * (contrast)与 AI 找茬(ai-verify)；普通内容对照页不设此字段。
   *
   * 单条误区时携带该条原文(旧课兼容,含义不变)。骨架合并规则(每片段至多 1 幕
   * ai-verify)命中多条误区时,这里回填**第一条**原文,不代表全量——多条场景一律
   * 改读 misconceptionSources,禁止只读这个字段当作"唯一误区"。
   */
  misconceptionSource?: string
  /**
   * v5 M2 ai-verify 幕合并(骨架去重:一个片段的剩余误概念全部收编进同一幕,
   * 不再逐条追加幕——46 页课 19 页同一张 ai-verify 脸的重复感由此根治)。
   * 仅当本幕合并了 ≥2 条误区时出现;单条时不设此字段,读取一律走
   * misconceptionSourcesOf(scene),禁止各处散落 `?? []` 判断。
   *
   * contentSlots 渲染契约(粗槽向后兼容,细槽向前预留):
   * - aiClaim / reveal:**始终存在**的合并粗槽——单条时就是那一条改写;多条时是
   *   AI 助教一段话里连续犯的全部错误 + 老师的合并揭底，继续供旧课兼容。
   * - aiClaim1..N / reveal1..N:多条(N=sources.length>1)时**额外**并存的细分槽,
   *   每对紧扣 misconceptionSources 对应下标的原文。课堂首次作答与最终核查
   *   都按这些细分槽逐条展示，质量闸门会阻断缺项。
   */
  misconceptionSources?: string[]
}

/** 读取一幕的误区溯源原文(单条/合并态统一入口),禁止各处散落
 * `scene.misconceptionSources ?? (scene.misconceptionSource ? [...] : [])` 式判断。 */
export function misconceptionSourcesOf(scene: Pick<LessonScene, 'misconceptionSource' | 'misconceptionSources'>): string[] {
  if (scene.misconceptionSources && scene.misconceptionSources.length > 0) return scene.misconceptionSources
  return scene.misconceptionSource ? [scene.misconceptionSource] : []
}

export interface LessonBeat {
  id: string
  sceneId: string
  action: BeatAction
  targetId?: string
  script?: string
  durationMs?: number
}

/**
 * 一门课程的版本归属。每次“退回规划”都会创建新的课程记录，旧记录继续可用，
 * 因此版本关系只保存引用，不把两个版本的页面正文混在同一载荷中。
 */
export interface MainlineCourseRevision {
  familyId: string
  revisionNo: number
  basedOnCourseId?: string
  supersededByCourseId?: string
}

export interface MainlineCourse {
  id: string
  topic: string
  audience: string
  gradeBand: GradeBand
  subject: SubjectId
  sourceMaterial: SourceMaterialRef[]
  goals: LessonGoal[]
  boundary: string
  selectedTeacher: string
  teacherSubjectProfile: TeacherSubjectProfile
  peerRoleProfile: PeerRoleProfile
  castProfiles: CastProfile[]
  voiceProfiles: VoiceProfile[]
  gradeAdaptationProfile: GradeAdaptationProfile
  teachingSkeleton: TeachingSkeleton
  learningFragments: LearningFragment[]
  scenes: LessonScene[]
  beats: LessonBeat[]
  /**
   * 新课的页面级规划版本。存在时，页面数量、顺序、受众、问答配对和视觉要求
   * 已在正文填充前确定；旧课缺省并继续通过兼容读取路径工作。
   */
  planning?: CoursePlanningState
  /** 阶段 B 页面正文；页面 ID、数量和顺序必须与 planning 完全一致。 */
  pageContent?: CoursePageContentState
  /** 页面优先课程的版本关系；旧课缺省并继续按原链路读取。 */
  revision?: MainlineCourseRevision
  qualityStatus: 'draft' | 'blocked' | 'passed'
  /** v4 M1 事实核查留痕:fill 时核查的结论落库,上课页据此拦 FATAL(页面自身不重跑 LLM 核查)。 */
  factAudit?: FactAuditRecord
  /** v4 M2 课程季归属:属于某季的第几集;单课模式为空,所有旧路径零影响。 */
  season?: SeasonRef
  /** 服务端按真实上课时间锁定的立绘矩阵切片;前端不得自行按本地时间切换。 */
  castAssetSelection?: CastAssetSelection
  /** 学习时期(方向三 v1):建课时可选,缺省新授;影响表现路由的密度/正式度倾斜。 */
  lessonPhase?: LessonPhase
  /** 模板替换(2026-07-22):教师手动指定的风格包 id,覆盖 stylePackFor 的哈希分流;
   * 缺省 = 自动分配。三档 id 均可(精修字面量 / imported:xxx / generative:锚:mood:tint:质感),
   * 解析见 presentation/style-packs.ts resolveStylePackById,解析失败回落自动分配。 */
  stylePackId?: string
}

/** 课程 → 季的归属引用(季本体 Season 定义在 season.ts,含剧情弧线与进度)。 */
export interface SeasonRef {
  seasonId: string
  episodeNo: number
}

export interface FactRepairAttemptRecord {
  /** 从 1 开始的修正轮次。 */
  attempt: number
  /** 首轮兼顾 warning，后续轮次只追仍会阻断授课的 blocking。 */
  scope: 'blocking-and-warning' | 'blocking-only'
  attemptedSceneIds: string[]
  repairedSceneIds: string[]
  skipped: Array<{
    sceneId: string
    reason: 'teacher-edit-protected' | 'scene-missing'
  }>
  failed: Array<{ sceneId: string; error: string }>
  remainingBlockingCount: number
  remainingWarningCount: number
}

export interface FactRepairTrace {
  /** 配置的硬上限；即使环境变量异常也会被限制在安全范围内。 */
  maxAttempts: number
  attempts: FactRepairAttemptRecord[]
  stoppedReason: 'no-actionable-issues' | 'no-blocking-issues' | 'no-progress' | 'max-attempts'
}

/** 事实核查记录。issue 形状与 QualityIssue 对齐,为免循环依赖在此独立声明。 */
export interface FactAuditRecord {
  /** 页面优先课程必须记录被核查的正文版本，防止旧核查结论套用到新正文。 */
  contentRevisionId?: string
  /** 最近一次实际核查时间；只有待核查、尚未成功跑过核查的记录可以缺省。 */
  auditedAt?: string
  /**
   * 已核查幕的精确集合。旧课只有 auditedSceneCount 时可缺省；所有新核查都会写入，
   * 使单页编辑、删除和重生成不再靠“计数加一并封顶”猜测覆盖范围。
   */
  auditedSceneIds?: string[]
  /** 本轮按事实密度、已知误区或教师显式请求判定为必须核查的幕。 */
  requiredSceneIds?: string[]
  /** 必须核查但因核查服务失败而尚未验证的幕；非空时不得进入正式课堂。 */
  unverifiedSceneIds?: string[]
  /** 教师修改事实内容后等待重新核查的幕；非空时课程不得进入正式课堂。 */
  pendingSceneIds?: string[]
  auditedSceneCount: number
  /** 已完成跨幕一致性核查的精确页面集合；与逐页事实核查分开记录，避免一种成功冒充另一种成功。 */
  consistencyAuditedSceneIds?: string[]
  /** 最近一次记录中仍存在的跨幕冲突数。 */
  consistencyConflictCount?: number
  /** 事实发布阻断总数。字段名为历史兼容保留，现同时包含 fatal 与 misleading。 */
  fatalCount: number
  /** fill 后自动事实修正的逐轮留痕；旧课没有该字段时保持兼容。 */
  repairTrace?: FactRepairTrace
  issues: Array<{
    id: string
    severity: 'blocking' | 'warning' | 'info'
    targetId: string
    /** 跨页面问题涉及的全部页面；targetId 是主要修正落点。 */
    relatedTargetIds?: string[]
    message: string
    impact: string
    fix: string
  }>
}

export const REQUIRED_SCENE_FIELDS = [
  'visualFocus',
  'narrationAnchor',
  'syncStrategy',
  'boardText',
  'sceneTechnique',
  'interactionContract',
  'fallbackPresentation',
  'characterLayer',
  'dialogueLayout',
  'peerFunction',
  'subjectTeachingMode',
  'voiceCue',
  'gradeTone',
  'teacherScript',
  'studentAction',
  'evidenceOnScreen',
] as const satisfies readonly (keyof LessonScene)[]

/**
 * v5 M1 逐页编辑白名单:与 fill-scenes(generation/fill-scenes.ts)LLM 填槽覆写的
 * 字段完全一致——教师能手改的,只能是 AI 填槽本就负责生成的内容字段;
 * sceneType/kpId/visualLayout/characterLayer/sceneTechnique/dialogueLayout 等
 * 结构字段禁止在此路径修改(只能通过换骨架/重生成整幕结构调整)。
 */
export const EDITABLE_SCENE_FIELDS = [
  'contentSlots',
  'visualFocus',
  'narrationAnchor',
  'boardText',
  'teacherScript',
  'studentAction',
  'evidenceOnScreen',
  // 辨析/AI 核查页可由教师重新声明“本页明确处理的教材误区”；API 只接受当前
  // 教材元数据中的原文，并同步维护旧版 misconceptionSource 兼容字段。
  'misconceptionSources',
  // 语速与停顿接续属于教师可修正的授课编排；保留声线与情绪，只开放整组原子更新。
  'voiceCue',
  // v5 M2:人机分工是教师可调的教学决策,不是内容填槽,但同样走逐页 PATCH 白名单
  // (教师改分工不需要整课 fill?force=1)。
  'executor',
] as const satisfies readonly (keyof LessonScene)[]

export const QUALITY_GATES: readonly QualityGateId[] = [
  'pedagogy',
  'visual',
  'performance',
  'asset',
  'cast-voice-grade',
  'technique',
]

export const SCENE_TECHNIQUE_IDS: readonly SceneTechniqueId[] = [
  'static-board',
  'layered-reveal',
  'local-zoom',
  'path-tracing',
  'comparison-slider',
  'timeline',
  'draggable-model',
  'dynamic-chart',
  'simulation',
  'step-replay',
]

export const DIALOGUE_LAYOUTS: readonly DialogueLayout[] = [
  'teacher-left-content-right',
  'student-right-content-left',
  'dual-characters-center-content',
  'bottom-rpg',
  'corner-avatar',
  'narration-only',
  'no-character',
]

export const PEER_FUNCTIONS: readonly PeerFunction[] = [
  'none',
  'questioner',
  'misconception',
  'attempt-answer',
  'peer-restate',
  'emotion-buffer',
  'comparison',
]
