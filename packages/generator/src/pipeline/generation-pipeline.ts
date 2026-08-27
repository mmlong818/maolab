import pLimit from 'p-limit'
import { randomUUID } from 'node:crypto'
import type {
  TeachingPlan,
  Stage,
  Scene,
  OutlineItem,
  Program,
  ContentRef,
  ContentUnit,
} from '@maolab/shared-types'
import type {
  StageRepository,
  ContentUnitRepository,
  ProgramRepository,
} from '@maolab/db'
import type { WorkerRegistry } from '../workers/registry.js'
import type { KnowledgeProfileExtractor } from '../knowledge/extractor.js'
import { generateObjectives } from '../workers/objectives-worker.js'
import { sceneToContentUnit, scoreCandidate } from './scene-to-content-unit.js'

export interface PipelineOptions {
  concurrency?: number
  skipObjectives?: boolean
  callLLM?: (userPrompt: string, systemPrompt?: string) => Promise<string>
  /** When true, the pipeline will look up the ContentUnit library before invoking a worker. */
  reuseFromLibrary?: boolean
}

export interface GenerationEvent {
  type: 'scene_done' | 'scene_error' | 'scene_reused' | 'stage_done' | 'stage_error'
  stageId: string
  sceneId?: string
  sceneTitle?: string
  unitId?: string
  error?: string
}

export type EventHandler = (event: GenerationEvent) => void

export class GenerationPipeline {
  constructor(
    private readonly stageRepo: StageRepository,
    private readonly registry: WorkerRegistry,
    private readonly extractor: KnowledgeProfileExtractor,
    private readonly opts: PipelineOptions = {},
    private readonly contentRepo?: ContentUnitRepository,
    private readonly programRepo?: ProgramRepository,
  ) {}

  async run(plan: TeachingPlan, stage: Stage, onEvent?: EventHandler): Promise<void> {
    const concurrency = this.opts.concurrency ?? 3
    const limit = pLimit(concurrency)

    await this.stageRepo.updateStatus(stage.id, 'generating')

    // A Program shadow-tracks this run, written alongside the legacy Stage.
    // If the plan already has a program (e.g. user re-ran generation or the page
    // re-mounted), reuse it instead of spawning a duplicate row.
    let program: Program | undefined
    if (this.programRepo) {
      const existing = await this.programRepo.listByPlan(plan.id)
      const reuseId = existing[0]?.id
      program = {
        id: reuseId ?? randomUUID(),
        planId: plan.id,
        status: 'generating',
        ordered: [],
        agents: stage.agents,
      }
      await this.programRepo.save(program)
    }

    let profile: Awaited<ReturnType<KnowledgeProfileExtractor['extract']>>
    try {
      profile = await this.extractor.extract({
        topic: plan.topic,
        domain: 'auto-detect',
        difficulty: plan.difficulty,
        emphasizedConcepts: plan.emphasizedConcepts,
      })
    } catch {
      onEvent?.({ type: 'scene_error', stageId: stage.id, error: 'knowledge extraction failed, using basic mode' })
      profile = {
        topic: plan.topic,
        domain: plan.topic,
        difficulty: plan.difficulty,
        coreConcepts: [{ name: plan.topic, desc: plan.topic }],
        causalChain: [plan.topic],
        misconceptions: [],
        narrativeHooks: [],
        analogies: [],
        keyFigures: [],
        emphasizedConcepts: plan.emphasizedConcepts,
      }
    }

    // Phase 1: generate learning objectives in parallel
    let enrichedOutline: OutlineItem[] = plan.outline
    if (!this.opts.skipObjectives && this.opts.callLLM) {
      const callLLM = this.opts.callLLM
      enrichedOutline = await Promise.all(
        plan.outline.map(async (item) => {
          const objectives = await generateObjectives(item, profile, plan, callLLM)
          return { ...item, learningObjectives: objectives }
        }),
      )
    }

    // Phase 2: per outline item — first try library, then worker
    const orderedRefs: Array<{ orderIndex: number; ref: ContentRef }> = []
    const tasks = enrichedOutline.map((item, orderIndex) =>
      limit(async () => {
        try {
          // ── Library lookup ────────────────────────────────────────────────
          let reusedUnit: ContentUnit | undefined
          if (this.opts.reuseFromLibrary && this.contentRepo) {
            reusedUnit = await this.findReusable(item, profile, plan)
          }

          if (reusedUnit) {
            const scene: Scene = {
              id: randomUUID(),
              outlineItemId: item.id,
              type: reusedUnit.subkind as Scene['type'],
              title: reusedUnit.title,
              content: reusedUnit.content,
              actions: [],
              durationHint: reusedUnit.durationHint,
              generationStatus: 'done',
            }
            await this.stageRepo.updateScene(stage.id, scene)
            orderedRefs.push({ orderIndex, ref: { unitId: reusedUnit.id, orderIndex } })
            onEvent?.({
              type: 'scene_reused',
              stageId: stage.id,
              sceneId: scene.id,
              unitId: reusedUnit.id,
              sceneTitle: item.title,
            })
            return
          }

          // ── Worker fallback ───────────────────────────────────────────────
          const worker = this.registry.resolve(item.sceneType, plan.teachingMethod)
          const scene: Scene = await worker.generate(item, profile, plan)
          await this.stageRepo.updateScene(stage.id, scene)

          if (this.contentRepo) {
            const unit = sceneToContentUnit(scene, item, profile, plan)
            await this.contentRepo.save(unit)
            orderedRefs.push({ orderIndex, ref: { unitId: unit.id, orderIndex } })
            onEvent?.({
              type: 'scene_done',
              stageId: stage.id,
              sceneId: scene.id,
              unitId: unit.id,
              sceneTitle: item.title,
            })
          } else {
            onEvent?.({ type: 'scene_done', stageId: stage.id, sceneId: scene.id, sceneTitle: item.title })
          }
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err)
          onEvent?.({ type: 'scene_error', stageId: stage.id, error })
        }
      }),
    )

    const results = await Promise.allSettled(tasks)
    const hasError = results.some(r => r.status === 'rejected')

    // Reorder scenes to match outline order
    await this.reorderScenesByOutline(stage.id, enrichedOutline)

    // Persist program with the final ordered refs
    if (program && this.programRepo) {
      const sorted = orderedRefs
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((entry, idx) => ({ ...entry.ref, orderIndex: idx }))
      program.ordered = sorted
      program.status = hasError ? 'partial' : 'ready'
      program.generatedAt = Date.now()
      if (hasError) program.errorMessage = 'Some scenes failed'
      await this.programRepo.save(program)
      // Refresh usage counts for all referenced units
      if (this.contentRepo) {
        await Promise.all(sorted.map(r => this.contentRepo!.refreshUsageCount(r.unitId)))
      }
    }

    if (hasError) {
      await this.stageRepo.updateStatus(stage.id, 'partial', 'Some scenes failed to generate')
      onEvent?.({ type: 'stage_error', stageId: stage.id, error: 'Some scenes failed' })
    } else {
      await this.stageRepo.updateStatus(stage.id, 'ready')
      onEvent?.({ type: 'stage_done', stageId: stage.id })
    }
  }

  private async findReusable(
    item: OutlineItem,
    profile: Parameters<typeof scoreCandidate>[2],
    plan: TeachingPlan,
  ): Promise<ContentUnit | undefined> {
    if (!this.contentRepo) return undefined
    const conceptsQuery = [...(item.concepts ?? []), ...profile.emphasizedConcepts]
    if (conceptsQuery.length === 0) return undefined

    const candidates = await this.contentRepo.search({
      subkind: item.sceneType as ContentUnit['subkind'],
      concepts: conceptsQuery,
      language: plan.language,
      limit: 20,
    })
    if (candidates.length === 0) return undefined

    let best: ContentUnit | undefined
    let bestScore = 0
    for (const c of candidates) {
      // Never reuse a unit that was just produced for the same plan/program —
      // otherwise the same lesson would echo identical content across scenes.
      if (c.sourcePlanId === plan.id) continue
      const score = scoreCandidate(c, item, profile, plan)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
    return best
  }

  private async reorderScenesByOutline(stageId: string, outline: OutlineItem[]): Promise<void> {
    const current = await this.stageRepo.find(stageId)
    if (!current) return
    const orderIndex = new Map<string, number>()
    outline.forEach((item, idx) => orderIndex.set(item.id, idx))
    const sorted = [...current.scenes].sort((a, b) => {
      const ai = orderIndex.get(a.outlineItemId) ?? Number.MAX_SAFE_INTEGER
      const bi = orderIndex.get(b.outlineItemId) ?? Number.MAX_SAFE_INTEGER
      return ai - bi
    })
    const needsReorder = sorted.some((scene, idx) => scene.id !== current.scenes[idx]?.id)
    if (!needsReorder) return
    await this.stageRepo.save({ ...current, scenes: sorted })
  }
}
