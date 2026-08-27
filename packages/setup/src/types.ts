export interface QuickDecisionResult {
  topic: string
  style: 'lecture' | 'socratic' | 'project'
  language: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  agentCount: number
  outline: Array<{
    title: string
    sceneType: 'slide' | 'quiz' | 'interactive' | 'hotspot' | 'comparison' | 'drag-drop' | 'cloze' | 'animation' | 'branching' | 'model-3d' | 'image'
    objective: string
    durationHint: number
    concepts?: string[]
  }>
  reasoning: string
}

export interface SetupConfig {
  topic: string
  style: 'lecture' | 'socratic' | 'project'
  language: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  agentCount: number
  teachingMethod: 'standard'
}

export interface OutlineChunk {
  index: number
  title: string
  sceneType: 'slide' | 'quiz' | 'interactive' | 'hotspot' | 'comparison' | 'drag-drop' | 'cloze' | 'animation' | 'branching' | 'model-3d' | 'image'
  objective: string
  durationHint: number
  /** 前置节点的 title 列表，用于拓扑排序 */
  prerequisites?: string[]
  /** Concepts taught by this chunk — used for library reuse retrieval. */
  concepts?: string[]
}

export interface KnowledgeAnalysis {
  primaryType: 'factual' | 'conceptual' | 'procedural' | 'metacognitive'
  bloomsLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'
  reasoning: string
}

export interface CurriculumDesignResult {
  topic: string
  targetAudience: string
  language: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  knowledgeAnalysis: KnowledgeAnalysis
  outline: Array<{
    title: string
    sceneType: import('@maolab/shared-types').SceneContentType
    /** 新管线：教学方法 id（来自 TEACHING_MODES 注册表） */
    teachingModeId?: import('@maolab/shared-types').TeachingModeId
    objective: string
    durationHint: number
    rationale: string
    concepts?: string[]
  }>
  totalDurationHint: number
  reasoning: string
}
