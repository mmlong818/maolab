export interface KnowledgeProfileForUI {
  planId: string
  topic: string
  audienceSummary: string
  learningObjectives: string[]
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  reasoning: string
  outlinePreview: Array<{ title: string; sceneType: string; objective: string }>
}

export interface ScenePreview {
  id: string
  title: string
  type: string
}
