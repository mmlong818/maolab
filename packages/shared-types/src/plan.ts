export type TeachingMethod =
  | 'standard'
  | 'ai-teacher'
  | 'dialogue'
  | 'standup-comedy'
  | 'music-mv'
  | 'podcast'
  | 'document'

export type TeachingStyle = 'lecture' | 'socratic' | 'project'

export type Difficulty = 'beginner' | 'intermediate' | 'advanced'

export type AgentRole = 'teacher' | 'student' | 'expert' | 'host'

export interface AgentConfig {
  id: string
  name: string
  role: AgentRole
  /** 性格 / 语气 / 教学风格描述（不含口头禅） */
  persona: string
  /** 口头禅 — 仅在合适处（回应学生作答）使用，整篇 ≤ 1 次 */
  catchphrase?: string
  /** 收尾问句模板（如"听起来怎么样？"），仅在 scene 结尾用 */
  wrapup?: string
  voiceId?: string
  avatarStyle?: string
}

export interface DocumentChapter {
  /** Zero-based position in the chapter list */
  index: number
  /** Chapter / section heading, e.g. "第二章 细胞的结构" */
  title: string
  /** Extracted plain text for this chapter */
  text: string
  /** Inclusive page range in the source document (1-based) */
  pageStart?: number
  pageEnd?: number
  /** Optional concept tags extracted by the LLM segmenter for retrieval */
  concepts?: string[]
}

export interface DocumentRef {
  id: string
  filename: string
  mimeType: string
  url: string
  /** Total pages (for paged formats such as PDF) */
  pageCount?: number
  /** Total characters in the extracted plain text */
  charCount?: number
  /** Full extracted text; may be trimmed when the source is very large */
  rawText?: string
  /** LLM-segmented chapters/sections — the unit teachers reference */
  chapters?: DocumentChapter[]
  /** Optional concise summary produced at upload time */
  summary?: string
  uploadedAt?: number
}

export type SceneContentType =
  | 'slide'
  | 'quiz'
  | 'video'
  | 'digital-human'
  | 'interactive'
  | 'audio'
  | 'document'
  | 'hotspot'
  | 'comparison'
  | 'drag-drop'
  | 'cloze'
  | 'animation'
  | 'branching'
  | 'model-3d'
  | 'math'
  | 'image'

export interface OutlineItem {
  id: string
  title: string
  sceneType: SceneContentType
  objective: string
  durationHint: number
  learningObjectives?: string[]
  /** Concept tags this outline item teaches — used for library retrieval. */
  concepts?: string[]
  /**
   * 教学方法 id（来自 TEACHING_MODES 注册表）。
   * 决定该场景的 "老师+媒介+学生参与" 组合形态。
   * 新管线（讲稿先于画面）下，此字段是 ScriptWorker + ContentWorker 的核心 routing。
   * 可选以便回退兼容旧 stage。
   */
  teachingModeId?: string
}

export interface TeachingPlan {
  id: string
  topic: string
  sourceDocuments: DocumentRef[]
  teachingMethod: TeachingMethod
  style: TeachingStyle
  language: string
  difficulty: Difficulty
  gradeLevel?: string
  agents: AgentConfig[]
  outline: OutlineItem[]
  emphasizedConcepts: string[]
  createdAt: number
}
