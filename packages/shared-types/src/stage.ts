import type { SceneContentType } from './plan.js'
import type { Action } from './action.js'
import type { AgentConfig } from './plan.js'

export type StageStatus = 'generating' | 'ready' | 'error' | 'partial'
export type SceneGenerationStatus = 'pending' | 'done' | 'error'

export type SlideLayout =
  | 'formula'
  | 'bullets'
  | 'compare'
  | 'statement'
  | 'summary'
  | 'process'
  // Phase 1 PPT-grade layouts
  | 'cover'
  | 'argument'
  | 'data'
  | 'checklist'
  // Phase 2 PPT-grade layouts
  | 'timeline'
  | 'quote'
  | 'table'
  | 'causality'
  | 'question'
  | 'matrix-2x2'
  // Phase 3 PPT-grade layouts
  | 'case-study'
  | 'kpi-board'
  | 'persona'
  | 'chart-bar'
  | 'roadmap'
  | 'quadrant'
  | 'cta'
  | 'diagram'
  // Education layouts (Step 3B) — 教学专用版式
  | 'knowledge-card'    // 概念解释：定义 + 关键词 + 例子
  | 'step-by-step'      // 步骤教学：编号步骤 + 当前步骤详解
  | 'distinguish'       // 对比辨析：相似概念双栏 + 易混点
  | 'key-point'         // 重难点：大字重点 + 解读
  | 'worked-example'    // 例题解析：题干 + 分步求解 + 答案
  | 'prompt'            // 课堂提问：问题 + 提示词
  | 'recap'             // 总结回顾：分块要点

export interface SlideStat {
  value: string
  label: string
  source?: string
}

export interface SlideColumn {
  title: string
  items: string[]
}

export interface SlideTimelineEvent {
  time: string
  title: string
  desc?: string
}

export interface SlideTableColumn {
  id: string
  label: string
  align?: 'left' | 'right' | 'center'
}

export interface SlideTableRow {
  cells: Record<string, string>
  emphasis?: boolean
}

export interface SlideCausalLink {
  cause: string
  because?: string
}

export interface SlideMatrixCell {
  label: string
  desc?: string
  emphasis?: boolean
}

export interface SlideMatrixAxes {
  x: { low: string; high: string }
  y: { low: string; high: string }
}

export interface SlideQuote {
  text: string
  source: string
  highlight?: string
}

export interface SlideCaseResult {
  metric: string
  value: string
  delta?: string
}

export interface SlideKpi {
  label: string
  value: string
  delta?: string
  deltaTone?: 'pos' | 'neg' | 'flat'
  hint?: string
}

export interface SlidePersonaAttr {
  label: string
  value: string
}

export interface SlideChartBar {
  label: string
  value: number
  note?: string
}

export interface SlideRoadmapMilestone {
  period: string
  span?: number
  label: string
  emphasis?: boolean
}

export interface SlideRoadmapLane {
  name: string
  items: SlideRoadmapMilestone[]
}

export interface SlideQuadrantAxes {
  x: { label: string; low: string; high: string }
  y: { label: string; low: string; high: string }
}

export interface SlideQuadrantPoint {
  id: string
  label: string
  /** Integer 0–4 — grid column */
  gridX: number
  /** Integer 0–4 — grid row */
  gridY: number
}

export interface SlideData {
  title: string
  layout?: SlideLayout
  body: string
  steps?: string[]
  speakerNote: string
  visualHint: string
  /** PPT chapter / section eyebrow line above title */
  eyebrow?: string
  /** Substring inside `title` to accent-color */
  highlight?: string
  /** Multiple highlight fragments — used by `statement` layout */
  highlights?: string[]
  /** Optional sub-heading under hero title (cover / statement) */
  subtitle?: string
  /** Bullets for argument / checklist */
  points?: string[]
  /** Big numbers for data layout */
  stats?: SlideStat[]
  /** Structured compare layout — supersedes plain `body` when present */
  left?: SlideColumn
  right?: SlideColumn
  /** Timeline layout: chronological events */
  events?: SlideTimelineEvent[]
  /** Quote layout: highlighted citation */
  quote?: SlideQuote
  /** Table layout: structured comparison */
  columns?: SlideTableColumn[]
  rows?: SlideTableRow[]
  highlightColumn?: string
  /** Causality layout: cause→effect chain */
  chain?: SlideCausalLink[]
  conclusion?: string
  /** Question layout: prompt for the audience */
  question?: string
  hints?: string[]
  invitation?: string
  /** Matrix-2x2 layout: four-quadrant classification */
  axes?: SlideMatrixAxes
  cells?: [SlideMatrixCell, SlideMatrixCell, SlideMatrixCell, SlideMatrixCell]
  takeaway?: string
  /** Case-study layout */
  client?: string
  clientMeta?: string
  context?: string
  challenge?: string
  approach?: string
  results?: SlideCaseResult[]
  quoteAttribution?: string
  /** KPI board layout */
  period?: string
  kpis?: SlideKpi[]
  /** Persona layout */
  personaName?: string
  role?: string
  attributes?: SlidePersonaAttr[]
  needs?: string[]
  pains?: string[]
  /** Chart-bar layout */
  unit?: string
  bars?: SlideChartBar[]
  source?: string
  /** Roadmap layout */
  periods?: string[]
  lanes?: SlideRoadmapLane[]
  legend?: string
  /** Quadrant (5×5 scatter) layout */
  scatterAxes?: SlideQuadrantAxes
  quadrantPoints?: SlideQuadrantPoint[]
  highlightPoint?: string
  /** CTA layout */
  oldQuestion?: string
  newAction?: string
  /** Diagram layout: descriptive placeholder for later replacement */
  hint?: string
  /** Distinguish layout: 易混点提示 */
  confusion?: string
  /** Worked-example layout: 题干 */
  exampleProblem?: string
  /** Worked-example layout: 分步求解过程 */
  solutionSteps?: string[]
  /** Worked-example layout: 最终答案 */
  exampleAnswer?: string
  /** Recap layout: 分块小节 */
  recapSections?: { title: string; items: string[] }[]
  /** 教师备注 — 仅教师演讲者视图可见、可写入导出 PPT 的 notes */
  teacherNote?: string
}

export interface SlideContent {
  type: 'slide'
  slides: SlideData[]
  conceptIds: string[]
}

export type QuizQuestionType = 'multiple_choice' | 'short_answer'

export interface QuizQuestionFsrs {
  due: string
  stability: number
  difficulty: number
  elapsed_days: number
  scheduled_days: number
  reps: number
  lapses: number
  state: number
  last_review?: string
}

export interface QuizQuestionIRT {
  a: number
  b: number
  c: number
}

export interface QuizQuestion {
  id: string
  type: QuizQuestionType
  stem: string
  options?: string[]
  correctAnswers?: string[]
  explanation: string
  concepts: string[]
  fsrs?: QuizQuestionFsrs
  irt?: QuizQuestionIRT
}

export interface QuizContent {
  type: 'quiz'
  questions: QuizQuestion[]
}

export interface WhiteboardElement {
  id: string
  type: string
  data: unknown
}

export interface WhiteboardSnapshot {
  capturedAt: number
  elements: WhiteboardElement[]
  thumbnailUrl?: string
}

export interface VideoContent {
  type: 'video'
  url: string
  subtitlesUrl?: string
  duration: number
  thumbnailUrl?: string
}

export interface InteractiveContent {
  type: 'interactive'
  html: string
}

export interface AudioContent {
  type: 'audio'
  url: string
  duration: number
  transcriptUrl?: string
}

export interface DocumentContent {
  type: 'document'
  url: string
  mimeType: 'application/pdf' | 'text/markdown'
}

export interface HotspotContent {
  type: 'hotspot'
  svgDiagram: string
  title: string
  speakerNote: string
  hotspots: Array<{
    id: string
    /** Percentage position 0–100 of diagram width */
    x: number
    /** Percentage position 0–100 of diagram height */
    y: number
    label: string
    description: string
  }>
}

export interface ComparisonContent {
  type: 'comparison'
  leftTitle: string
  rightTitle: string
  title: string
  speakerNote: string
  rows: Array<{
    attribute: string
    left: string
    right: string
    isDifference: boolean
  }>
}

export interface DragDropContent {
  type: 'drag-drop'
  instruction: string
  speakerNote: string
  items: Array<{ id: string; text: string }>
  targets: Array<{ id: string; label: string }>
  matches: Record<string, string>
}

export interface ClozeContent {
  type: 'cloze'
  instruction: string
  speakerNote: string
  segments: Array<
    | { kind: 'text'; text: string }
    | { kind: 'blank'; id: string; answer: string; hint?: string }
  >
}

export interface AnimationContent {
  type: 'animation'
  title: string
  speakerNote: string
  steps: Array<{
    id: string
    label: string
    description: string
    svgFrame: string
  }>
}

export interface BranchingContent {
  type: 'branching'
  title: string
  speakerNote: string
  startNodeId: string
  nodes: Record<string, {
    type: 'situation' | 'consequence' | 'end'
    text: string
    choices?: Array<{
      id: string
      text: string
      nextNodeId: string
      isCorrect?: boolean
    }>
    feedback?: string
  }>
}

export type Model3dMotionProfile = 'road' | 'aircraft' | 'vessel' | 'specimen' | 'product' | 'orbit'

export interface Model3dContent {
  type: 'model-3d'
  title: string
  speakerNote: string
  description: string
  modelUrl: string
  motionProfile: Model3dMotionProfile
}

export type MathElementType = 'function' | 'point' | 'vector' | 'segment' | 'circle' | 'label'

export interface MathElement {
  type: MathElementType
  /** JS expression of x for function plots, e.g. "Math.sin(x)" or "x**2 - 2" */
  expression?: string
  x?: number
  y?: number
  /** End x coordinate for vector/segment */
  toX?: number
  /** End y coordinate for vector/segment */
  toY?: number
  radius?: number
  label?: string
  color?: string
}

export interface MathContent {
  type: 'math'
  title: string
  speakerNote: string
  description: string
  viewBox: { xMin: number; xMax: number; yMin: number; yMax: number }
  elements: MathElement[]
}

export interface ImageContent {
  type: 'image'
  title: string
  caption: string
  speakerNote: string
  prompt: string
  url: string
  width: number
  height: number
  altText: string
  provider: 'pollinations' | 'placeholder' | 'openai'
}

export type SceneContent =
  | SlideContent
  | QuizContent
  | VideoContent
  | InteractiveContent
  | AudioContent
  | DocumentContent
  | HotspotContent
  | ComparisonContent
  | DragDropContent
  | ClozeContent
  | AnimationContent
  | BranchingContent
  | Model3dContent
  | MathContent
  | ImageContent

export interface Scene {
  id: string
  outlineItemId: string
  type: SceneContentType
  title: string
  content: SceneContent
  actions: Action[]
  durationHint: number
  generationStatus: SceneGenerationStatus
  generationError?: string
  /** 旧字段：raw string 讲稿（向后兼容） */
  scripts?: Record<string, string>
  /** 新字段：行级 ScriptDoc（key=teacherId）。优先于 scripts 使用。 */
  scriptDocs?: Record<string, import('./script-doc.js').ScriptDoc>
  whiteboardSnapshot?: WhiteboardSnapshot
}

export interface Stage {
  id: string
  planId: string
  status: StageStatus
  scenes: Scene[]
  agents: AgentConfig[]
  generatedAt?: number
  errorMessage?: string
  /** Persisted slide visual theme (e.g. 'light', 'swiss-grid'). Null/undefined = client fallback. */
  slideTheme?: string | null
}
