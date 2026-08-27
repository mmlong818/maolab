'use server'

import type { OutlineChunk, SetupConfig, QuickDecisionResult } from '@maolab/setup'
import { OutlineGenerator, QuickDecider, TeachingPlanBuilder, CurriculumDesigner } from '@maolab/setup'
import { createDb, createTeachingPlanRepository, createStageRepository } from '@maolab/db'
import { createUserProfileService } from '@maolab/user-profile'
import type { TeachingPlan } from '@maolab/shared-types'
import type { KnowledgeProfileForUI, ScenePreview } from '@/lib/types/setup-types'

const DB_URL = process.env.DATABASE_URL ?? 'file:./data/maolab.db'

function getLlmConfig() {
  const baseURL = process.env.OPENAI_BASE_URL
  return {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
    ...(baseURL !== undefined ? { baseURL } : {}),
  }
}

export async function generateOutline(
  config: SetupConfig,
  emphasizedConcepts: string[] = [],
): Promise<OutlineChunk[]> {
  const generator = new OutlineGenerator(getLlmConfig())
  return generator.generate(config, emphasizedConcepts)
}

export async function savePlan(
  config: SetupConfig,
  chunks: OutlineChunk[],
  emphasizedConcepts: string[] = [],
): Promise<TeachingPlan> {
  const profileService = createUserProfileService(DB_URL)
  const profile = await profileService.getProfile()
  const plan = TeachingPlanBuilder.fromCustom(config, chunks, emphasizedConcepts, profile.gradeLevel)
  const db = createDb(DB_URL)
  const repo = createTeachingPlanRepository(db)
  await repo.save(plan)
  return plan
}

export async function quickDecideAndSave(topic: string, gradeLevel?: string): Promise<TeachingPlan> {
  if (typeof topic !== 'string' || topic.trim().length === 0) {
    throw new Error('主题不能为空')
  }
  if (topic.length > 500) {
    throw new Error('主题不能超过 500 个字符')
  }
  if (gradeLevel !== undefined) {
    gradeLevel = gradeLevel.trim()
    if (gradeLevel.length === 0) {
      throw new Error('年级不能为空')
    }
  }
  const profileService = createUserProfileService(DB_URL)
  const profile = await profileService.getProfile()
  const mastery = await profileService.listConceptMastery()
  const weakConcepts = mastery.filter(m => m.score < 0.5).map(m => m.conceptId)

  const decider = new QuickDecider(getLlmConfig())
  const result = await decider.decide(topic, profile, weakConcepts, [], gradeLevel)

  const plan = TeachingPlanBuilder.fromQuickDecision(result, [], gradeLevel ?? profile.gradeLevel)
  const db = createDb(DB_URL)
  const repo = createTeachingPlanRepository(db)
  await repo.save(plan)
  return plan
}

export async function analyzeAndSave(
  topic: string,
  gradeLevel: string | undefined,
  audienceState: string,
  documents: import('@maolab/shared-types').DocumentRef[] = [],
): Promise<KnowledgeProfileForUI> {
  if (typeof topic !== 'string' || topic.trim().length === 0) {
    throw new Error('主题不能为空')
  }
  if (topic.length > 500) {
    throw new Error('主题不能超过 500 个字符')
  }
  if (typeof audienceState !== 'string') {
    throw new Error('受众描述格式不正确')
  }
  if (audienceState.length > 2000) {
    throw new Error('受众描述不能超过 2000 个字符')
  }
  if (gradeLevel !== undefined) {
    gradeLevel = gradeLevel.trim()
    if (gradeLevel.length === 0) {
      throw new Error('年级不能为空')
    }
  }
  const targetAudience = gradeLevel
    ? `${gradeLevel}学生。${audienceState}`
    : audienceState

  // Build optional document context — pass the chapter outline + a summary so
  // the curriculum-designer can ground its scene design in the uploaded book.
  let documentContext: string | undefined
  if (documents.length > 0) {
    const lines: string[] = ['【参考课本/教材】']
    for (const doc of documents) {
      lines.push(`- 《${doc.filename}》${doc.pageCount ? ` (${doc.pageCount} 页)` : ''}`)
      if (doc.summary) lines.push(`  概述:${doc.summary}`)
      if (doc.chapters && doc.chapters.length > 0) {
        lines.push('  章节:')
        for (const ch of doc.chapters.slice(0, 20)) {
          lines.push(`    ${ch.index + 1}. ${ch.title}${ch.concepts?.length ? ` [${ch.concepts.join(' / ')}]` : ''}`)
        }
        if (doc.chapters.length > 20) lines.push(`    …(还有 ${doc.chapters.length - 20} 章)`)
      }
    }
    documentContext = lines.join('\n')
  }

  const designer = new CurriculumDesigner(getLlmConfig())
  const profile = await designer.design(topic, targetAudience, 'zh-CN', documentContext)

  const quickResult: QuickDecisionResult = {
    topic: profile.topic,
    style: 'lecture',
    language: profile.language,
    difficulty: profile.difficulty,
    agentCount: 2,
    outline: profile.outline.map(item => ({
      title: item.title,
      sceneType: item.sceneType as QuickDecisionResult['outline'][number]['sceneType'],
      objective: item.objective,
      durationHint: item.durationHint,
      ...(item.concepts ? { concepts: item.concepts } : {}),
    })),
    reasoning: profile.reasoning,
  }

  const profileService = createUserProfileService(DB_URL)
  const mastery = await profileService.listConceptMastery()
  const weakConcepts = mastery.filter(m => m.score < 0.6).map(m => m.conceptId)

  const plan = TeachingPlanBuilder.fromQuickDecision(quickResult, weakConcepts, gradeLevel)
  if (documents.length > 0) {
    plan.sourceDocuments = documents
  }

  const db = createDb(DB_URL)
  const planRepo = createTeachingPlanRepository(db)
  await planRepo.save(plan)

  return {
    planId: plan.id,
    topic: profile.topic,
    audienceSummary: profile.targetAudience,
    learningObjectives: profile.outline.slice(0, 4).map(item => item.objective),
    difficulty: profile.difficulty,
    reasoning: profile.reasoning,
    outlinePreview: profile.outline.map(item => ({
      title: item.title,
      sceneType: item.sceneType,
      objective: item.objective,
    })),
  }
}

export async function getStageScenes(stageId: string): Promise<ScenePreview[]> {
  const db = createDb(DB_URL)
  const stageRepo = createStageRepository(db)
  const stage = await stageRepo.find(stageId)
  if (!stage) return []
  return stage.scenes.map(s => ({
    id: s.id,
    title: s.title,
    type: s.content.type,
  }))
}
