import type { KnowledgeType } from '@maolab/shared-types'
import type { LessonArcAction, LessonPagePurpose } from './page-contract.js'

export interface PageSkeletonStep {
  action: LessonArcAction
  role: string
  pagePurposes: LessonPagePurpose[]
}

export interface PageFragmentSkeleton {
  id: string
  knowledgeType: KnowledgeType
  teachingType: string
  steps: PageSkeletonStep[]
}

export interface PageSkeletonKpInput {
  id: string
  canonicalName: string
  knowledgeType?: KnowledgeType
  misconceptions?: readonly string[]
  needsReinforcement?: boolean
}

const DEFAULT_KNOWLEDGE_TYPE: KnowledgeType = 'conceptual'

/**
 * 新页面骨架只描述学习动作和它将产生的真实投影片，不含 sceneType。
 * 现有场景骨架在阶段 A 继续服务旧链路，二者不会互相写入。
 */
export const PAGE_FRAGMENT_SKELETONS: Record<KnowledgeType, PageFragmentSkeleton> = {
  conceptual: {
    id: 'page-frag-conceptual',
    knowledgeType: 'conceptual',
    teachingType: '观察建构',
    steps: [
      { action: 'observe', role: '观察证据', pagePurposes: ['observe'] },
      { action: 'explain', role: '建立概念', pagePurposes: ['explain'] },
      { action: 'practice-and-revise', role: '独立检核', pagePurposes: ['practice', 'feedback'] },
    ],
  },
  procedural: {
    id: 'page-frag-procedural',
    knowledgeType: 'procedural',
    teachingType: '讲授跟做',
    steps: [
      { action: 'explain', role: '方法讲授', pagePurposes: ['explain'] },
      { action: 'study-worked-example', role: '完整例题', pagePurposes: ['question', 'worked-step'] },
      { action: 'practice-and-revise', role: '同型跟做', pagePurposes: ['practice', 'feedback'] },
    ],
  },
  factual: {
    id: 'page-frag-factual',
    knowledgeType: 'factual',
    teachingType: '识记检核',
    steps: [
      { action: 'observe', role: '接触事实', pagePurposes: ['observe'] },
      { action: 'practice-and-revise', role: '事实检核', pagePurposes: ['practice', 'feedback'] },
    ],
  },
  metacognitive: {
    id: 'page-frag-metacognitive',
    knowledgeType: 'metacognitive',
    teachingType: '策略反思',
    steps: [
      { action: 'explain', role: '表述策略', pagePurposes: ['explain'] },
      { action: 'judge-and-revise', role: '比较提问', pagePurposes: ['question', 'answer'] },
      { action: 'practice-and-revise', role: '应用反思', pagePurposes: ['practice', 'feedback'] },
    ],
  },
}

export function pageSkeletonStepsFor(kp: PageSkeletonKpInput): PageSkeletonStep[] {
  const skeleton = PAGE_FRAGMENT_SKELETONS[kp.knowledgeType ?? DEFAULT_KNOWLEDGE_TYPE]
  const misconceptionSteps = normalize(kp.misconceptions ?? []).map((_, index) => ({
    action: 'judge-and-revise' as const,
    role: `误区核查 ${index + 1}`,
    pagePurposes: ['question', 'answer'] as LessonPagePurpose[],
  }))
  const practiceIndex = skeleton.steps.findIndex(step => step.action === 'practice-and-revise')
  const baseSteps = practiceIndex === -1
    ? [...skeleton.steps, ...misconceptionSteps]
    : [
        ...skeleton.steps.slice(0, practiceIndex),
        ...misconceptionSteps,
        ...skeleton.steps.slice(practiceIndex),
      ]
  if (!kp.needsReinforcement) return baseSteps.map(cloneStep)
  return [
    ...baseSteps.map(cloneStep),
    { action: 'practice-and-revise', role: '薄弱加固再练', pagePurposes: ['practice', 'feedback'] },
  ]
}

function cloneStep(step: PageSkeletonStep): PageSkeletonStep {
  return { ...step, pagePurposes: [...step.pagePurposes] }
}

function normalize(values: readonly string[]): string[] {
  return values.map(value => value.trim()).filter(Boolean)
}
