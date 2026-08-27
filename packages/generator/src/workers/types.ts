import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'

export interface ContentWorker {
  readonly type: Scene['type']
  generate(
    item: OutlineItem,
    profile: KnowledgeProfile,
    plan: TeachingPlan,
  ): Promise<Scene>
}
