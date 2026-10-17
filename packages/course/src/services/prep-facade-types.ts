/**
 * 备课门面（3c）的类型。本文件不 import 任何东西：
 * packages/bundle 与 apps/harness 只从这里 import type，tsc 因此不会把迁入的 maolab 源码（参数属性、DOM 类型）
 * 拉进它们的类型检查；运行时由 bundle 用 tsx 加载 @maolab/course（计划"已定事实"）。
 * 与 ports.ts、runtime.ts 的同构结构由 prep-facade.ts 里的编译期断言锁住，改了任何一边 course 的 typecheck 先红。
 */

export type PrepJson = null | boolean | number | string | PrepJson[] | { [key: string]: PrepJson }

/** 门面失败原因：工具原样交给模型。新增原因时同步改 bundle 工具描述与计划 Task 6 的原因表 */
export type PrepFailureReason =
  | 'not-found'
  | 'invalid-input'
  | 'unknown-kp'
  | 'plan-conflict'
  | 'write-conflict'
  | 'session-conflict'
  | 'session-not-ready'
  | 'page-blocked'
  | 'images-unavailable'
  | 'render-evidence-missing'
  | 'pages-not-accepted'
  | 'audit-blocked'
  | 'not-ready'
  /** 课程没有关联知识点（或关联的知识点在知识库里查不到），不能进公共库索引 */
  | 'no-knowledge-point'
  | 'model-channel-missing'
  /** 生成页时模型通道传输失败（超时、网络、网关不可用）：不算闸门失败，页放回队列，稍后重试（审查 I2） */
  | 'model-unavailable'
  /** 工具调用被取消（exec.signal 已中止）：立即停止，页放回队列 */
  | 'cancelled'
  | 'failed'

export interface PrepFailure {
  ok: false
  reason: PrepFailureReason
  message: string
  details?: PrepJson
}

export type PrepResult<T extends { [key: string]: PrepJson }> = ({ ok: true } & T) | PrepFailure

export type PrepDocumentKind = 'course' | 'season'

export interface PrepDocumentRecord {
  id: string
  title: string
  status: string
  payload: unknown
  createdAt: number
  updatedAt: number
}

export interface PrepDocumentInput {
  id: string
  title: string
  status: string
  payload: unknown
}

/** 已绑定 owner 的课程文档仓储（@maolab/domain 的 PgCourseDocuments.forOwner(owner) 满足它） */
export interface PrepDocumentStore {
  find(kind: PrepDocumentKind, id: string): Promise<PrepDocumentRecord | undefined>
  save(kind: PrepDocumentKind, doc: PrepDocumentInput): Promise<number>
  saveIfUnchanged(kind: PrepDocumentKind, doc: PrepDocumentInput, expectedUpdatedAt: number): Promise<boolean>
  list(kind: PrepDocumentKind): Promise<PrepDocumentRecord[]>
  delete(kind: PrepDocumentKind, id: string): Promise<boolean>
}

export interface PrepKnowledgeRow {
  id: string
  canonical_name: string
  subject: string
  grade_band: string | null
  annotations: string | null
}

export interface PrepKnowledgeSourceRow {
  knowledgePointId: string
  source: string
  externalId?: string | null
  evidenceSnippet?: string | null
  confidence?: number | null
}

/** 知识点读取（@maolab/domain 的 PgCourseKnowledge 满足它；K12，按 id 取） */
export interface PrepKnowledgePort {
  knowledgePoints(ids: readonly string[]): Promise<PrepKnowledgeRow[]>
  knowledgePointSources(ids: readonly string[]): Promise<PrepKnowledgeSourceRow[]>
}

export interface PrepLlmRequest {
  system?: string
  user: string
  temperature: number
  timeoutMs: number
  signal: AbortSignal
  attempt: number
}

export interface PrepAssetInput {
  bytes: Uint8Array
  contentType: string
  name: string
}

/** 一次工具调用的模型、图像与产物通道（runWithCourseRuntime 的入参） */
export interface PrepRuntime {
  llm?: { completeJson(request: PrepLlmRequest): Promise<string> }
  image?: { generate(prompt: string, request: { size: string }): Promise<string> }
  assets?: { put(input: PrepAssetInput): Promise<string> }
  sleep?: (ms: number) => Promise<void>
}

export interface PrepFacadeDeps {
  documents: PrepDocumentStore
  knowledge: PrepKnowledgePort
  /** 测试用：固定新课程 id 与生成会话 id */
  newId?: () => string
}

export type PrepLessonPhase = 'new' | 'review' | 'exam-prep'

export interface PrepPlanCommand {
  action: 'save' | 'approve' | 'structure'
  /** save/approve：[{ pageId, learningAction, newInformation, visualReason?, teachingMove? }]（plan.ts 的 UpdateSchema 校验） */
  updates?: PrepJson
  /** structure：{ type: 'move' | 'delete' | 'insert-explanation' | 'split-explanation', … } */
  operation?: PrepJson
}

export interface PrepGenerateOptions {
  /** 图像通道可用（D3）；false 时需要教学图像的页一律拒绝 */
  imagesAvailable: boolean
  /** 老师的修改意见，并入生成器的 qualityFeedback（最多 PREP_MAX_FEEDBACK 条，每条最多 400 字） */
  feedback?: readonly string[]
  /** 工具调用的取消信号（exec.signal）：已中止时不再开始新一轮，返回 cancelled（审查 I2） */
  signal?: AbortSignal
}

/** 按 owner 绑定的备课门面：宿主按 owner 缓存一个实例 */
export interface PrepFacade {
  listCourses(): Promise<PrepResult<{ courses: PrepJson }>>
  readCourse(courseId: string, pageId?: string): Promise<PrepResult<{ course: PrepJson }>>
  brief(courseId: string): Promise<PrepResult<{ brief: PrepJson }>>
  planCourse(input: { kpIds: readonly string[]; lessonPhase?: PrepLessonPhase }): Promise<PrepResult<{ course: PrepJson }>>
  updatePlan(courseId: string, command: PrepPlanCommand, options: { imagesAvailable: boolean }): Promise<PrepResult<{ plan: PrepJson }>>
  /** 成功的 page：{ pageId, order, status, rounds, repairs, requeues, attempts, sessionStatus, remaining }；repairs 只计闸门修复，模型/瞬时错误的重排计 requeues */
  generateNextPage(courseId: string, runtime: PrepRuntime, options: PrepGenerateOptions): Promise<PrepResult<{ page: PrepJson }>>
  auditPage(courseId: string, pageId: string): Promise<PrepResult<{ audit: PrepJson }>>
  repairPage(courseId: string, pageId: string, runtime: PrepRuntime, options: PrepGenerateOptions): Promise<PrepResult<{ page: PrepJson }>>
  /**
   * 待截图的页（按页序）与各页当前的正文修订 id（revisions，渲染任务的 requestKey 带上它，终审 M4）；
   * 没有待截图的页时 note 说明当前阶段的下一步（审查 T6 M2）
   */
  renderablePages(courseId: string): Promise<PrepResult<{ pageIds: string[]; revisions: Record<string, string>; note?: string }>>
  /**
   * 整课审查（事实核查与 AI 教学审查，迁入的 defaultCourseAuditFacts 只发一次模型请求）。
   * 成功的 audit：{ auditId, sessionStatus, teachingQuality, acceptable, findings, note }；
   * 没通过时失败原因为 audit-blocked，details：{ teachingQuality, qualityStatus, findings, factIssues, unverifiedPageIds, pendingPageIds, auditError?, advice }（3c 裁决 F1、审查 I1）；
   * findings 与 factIssues 每条带 action（repair-page / add-source / rerun-audit，按它自带的 fix 归类），只含本次运行的结论（终审 M1）；
   * 事实核查因模型通道失败没完成时不报 audit-blocked，按传输类型报 model-channel-missing / model-unavailable / cancelled（终审 I1）
   */
  auditCourse(courseId: string, runtime: PrepRuntime): Promise<PrepResult<{ audit: PrepJson }>>
  /** 成功的 acceptance：{ accepted, remaining }（页 id） */
  acceptPage(courseId: string, pageId: string): Promise<PrepResult<{ acceptance: PrepJson }>>
  /** 成功的 acceptance：{ planStatus, finalSignature, supersededCourseId, note? }；本课是修订版时旧版本经 CAS 标为被替代，没标上时 supersededCourseId 为 null 并附 note */
  acceptCourse(courseId: string): Promise<PrepResult<{ acceptance: PrepJson }>>
  /** 成功的 export：{ pageCount, filename } */
  exportReadiness(courseId: string): Promise<PrepResult<{ export: PrepJson }>>
  /** 迁入的 AI 试学报告（tryoutCourse）：一次逻辑调用，失败时最多 2 次尝试；不写课程 */
  rehearse(courseId: string, runtime: PrepRuntime): Promise<PrepResult<{ report: PrepJson }>>
  /**
   * 面板视图（3d）：课程文档全文、与 read_course 相同的摘要、AI 教学审查记录是否与当前版本一致（服务端用 teachingQualityInputHash 算）、
   * 尚未按当前版本逐页验收的页、导出判定。只读，不调模型。workbench 的形状见 PrepWorkbenchView
   */
  workbench(courseId: string): Promise<PrepResult<{ workbench: PrepJson }>>
  /**
   * 发布草稿（4a）：整课可发布判定（与导出同一个 auditCourseReleaseReadiness）通过时，给出剥离了备课过程数据的快照、
   * 知识点、页数、family 与验收签名，以及读取时的 CAS 版本（sourceUpdatedAt）。只读，不调模型，不写课程。
   * 失败：not-found、not-ready（details { blockers }，与 exportReadiness 同形）、no-knowledge-point
   */
  packageDraft(courseId: string): Promise<{ ok: true; draft: PrepPackageDraft } | PrepFailure>
  /**
   * 修订（4b，Ruling [4b]；4a 需用户裁定第 18 条缺省）：已整课验收的课程不能原地再验收，给它建修订版。
   * 修订版用迁入的 forkCourseForReplanning 生成：同一修订族，revisionNo + 1，退回规划；正文、生成会话、截图证据、全部审查与验收都清空，
   * 之后要整课重新生成、截图、审查、验收，模型输出会和原课不同。
   * 只给修订族里最新的那门课建。族里已有更新的课（含尚未验收的修订版）时不建，返回那门课（existing: true）。
   * 成功的 revision：{ courseId, familyId, revisionNo, basedOnCourseId, existing, note }。
   * 失败：not-found；session-not-ready（还没整课验收，直接改这门课即可）。不调模型
   */
  reviseCourse(courseId: string): Promise<PrepResult<{ revision: PrepJson }>>
}

/** PrepFacade.workbench 返回的面板视图（3d，Task 5 详情接口与面板用） */
export interface PrepWorkbenchView {
  course: PrepJson                 // 课程文档全文（MainlineCourse），面板的页预览、结构树、简报用
  summary: PrepJson                // 与 read_course 同一份 courseSummary（含 pages：状态、诊断、截图、验收）
  teachingAudit: { status: string; state: 'current' | 'stale'; findings: PrepJson; unverifiedSources?: Array<'curriculum-standard' | 'textbook'> } | null
  unacceptedPageIds: string[]
  /** 会话停在 course-audit 且有本版本的核查或审查记录时：与 audit_course 返回的 audit-blocked details 同形（auditBlockedDetails(course, undefined)），否则 null */
  auditBlocked: PrepJson | null
  exportReady: { ok: true; pageCount: number; filename: string } | { ok: false; message: string; blockers: PrepJson }
}

/** 课程包草稿：课程包导出的输入 */
export interface PrepPackageDraft {
  sourceCourseId: string
  sourceUpdatedAt: number
  familyId: string
  signature: string
  title: string
  subject: string
  gradeBand: string
  kpIds: string[]
  pageCount: number
  snapshot: PrepJson
}
