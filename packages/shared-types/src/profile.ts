import type { Difficulty, TeachingStyle } from './plan.js'

export type LearnerType = 'individual' | 'group'
export type Gender = 'male' | 'female' | 'other'

export interface LearnerProfile {
  id: 'me'
  learnerType: LearnerType
  nickname?: string
  age?: number
  gender?: Gender
  gradeLevel?: string
  preferredLanguage: string
  preferredStyle: TeachingStyle
  preferredDifficulty: Difficulty
  preferredAgentCount: number
  createdAt: number
  updatedAt: number
}

export interface CourseHistory {
  id: string
  topic: string
  stageId: string
  completionRate: number
  lastAccessedAt: number
  totalDuration: number
  status: CourseStatus
}

export type CourseStatus = 'generating' | 'ready' | 'in_progress' | 'completed'

export interface ConceptMastery {
  conceptId: string
  score: number
  lastReviewedAt: number
}

export interface AdaptiveState {
  weak_concepts: string[]
  recommended_next: string[]
  last_updated: number
}

export interface QuizResult {
  score: number
  feedback: string
}
