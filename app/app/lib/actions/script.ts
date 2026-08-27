'use server'

import { createDb, createStageRepository, createTeachingPlanRepository } from '@maolab/db'
import { generateScript, callLLM } from '@maolab/generator'
import type { AgentConfig, KnowledgeProfile } from '@maolab/shared-types'

const DB_URL = process.env.DATABASE_URL ?? 'file:./data/maolab.db'

function getLLMConfig() {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set')
  const baseURL = process.env['OPENAI_BASE_URL']
  return {
    apiKey,
    model: process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
    ...(baseURL !== undefined ? { baseURL } : {}),
  }
}

function buildCallLLM(llmConfig: ReturnType<typeof getLLMConfig>) {
  return (user: string, system: string) =>
    callLLM(user, llmConfig, { systemPrompt: system })
}

function buildSlideContent(scene: { content: { type: string; slides?: Array<{ title: string; body: string }> } }): string {
  if (scene.content.type !== 'slide' || !('slides' in scene.content)) return ''
  const slides = scene.content.slides ?? []
  return slides.map((s) => `## ${s.title}\n${s.body}`).join('\n\n')
}

export async function generateTeacherScripts(stageId: string, teacher: AgentConfig): Promise<void> {
  const db = createDb(DB_URL)
  const stageRepo = createStageRepository(db)
  const planRepo = createTeachingPlanRepository(db)

  const stage = await stageRepo.find(stageId)
  if (!stage) throw new Error(`Stage not found: ${stageId}`)

  const plan = await planRepo.find(stage.planId)
  if (!plan) throw new Error(`Plan not found: ${stage.planId}`)

  const llmConfig = getLLMConfig()
  const boundCallLLM = buildCallLLM(llmConfig)

  const minimalProfile: KnowledgeProfile = {
    topic: plan.topic,
    domain: plan.topic,
    difficulty: plan.difficulty,
    coreConcepts: [],
    causalChain: [],
    misconceptions: [],
    narrativeHooks: [],
    analogies: [],
    keyFigures: [],
    emphasizedConcepts: [],
  }

  const slideScenes = stage.scenes.filter((s) => s.type === 'slide')

  const outlineMap = new Map(plan.outline.map((item) => [item.id, item]))

  await Promise.all(
    slideScenes.map(async (scene) => {
      try {
        const outlineItem = outlineMap.get(scene.outlineItemId)
        if (!outlineItem) return

        const slideContent = buildSlideContent(scene as Parameters<typeof buildSlideContent>[0])

        const script = await generateScript(
          outlineItem,
          minimalProfile,
          plan,
          teacher,
          slideContent,
          boundCallLLM,
        )

        const updatedScene = {
          ...scene,
          scripts: { ...(scene.scripts ?? {}), [teacher.id]: script },
        }

        await stageRepo.updateScene(stageId, updatedScene)
      } catch {
        // single scene failure does not block the rest
      }
    }),
  )
}
