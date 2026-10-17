export interface Concept {
  name: string
  desc: string
}

export interface KnowledgeProfile {
  topic: string
  domain: string
  difficulty: string
  coreConcepts: Concept[]
  causalChain: string[]
  misconceptions: string[]
  narrativeHooks: string[]
  analogies: string[]
  keyFigures: string[]
  emphasizedConcepts: string[]
  prerequisites?: string[]
}
