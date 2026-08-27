import { randomUUID } from 'node:crypto'
import toposort from 'toposort'
import type { TeachingPlan, OutlineItem, AgentConfig } from '@maolab/shared-types'
import type { SetupConfig, OutlineChunk, QuickDecisionResult } from './types.js'

const AGENT_ROLES = ['teacher', 'student', 'expert', 'host'] as const
const AGENT_NAMES = ['主讲老师', '助教', '领域专家', '主持人', '观察者']

function makeAgents(count: number): AgentConfig[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `agent-${i + 1}`,
    name: AGENT_NAMES[i] ?? `智能体${i + 1}`,
    role: AGENT_ROLES[i % AGENT_ROLES.length] as AgentConfig['role'],
    persona: 'professional and engaging',
  }))
}

function mapSceneType(raw: OutlineChunk['sceneType']): OutlineItem['sceneType'] {
  return raw
}

function sortChunks(chunks: OutlineChunk[]): OutlineChunk[] {
  const hasPrerequisites = chunks.some(c => c.prerequisites && c.prerequisites.length > 0)
  if (!hasPrerequisites) return chunks

  const titleSet = new Set(chunks.map(c => c.title))
  const edges: [string, string][] = []
  for (const chunk of chunks) {
    for (const pre of chunk.prerequisites ?? []) {
      if (titleSet.has(pre)) edges.push([pre, chunk.title])
    }
  }

  const ordered = toposort.array(chunks.map(c => c.title), edges)
  const byTitle = new Map(chunks.map(c => [c.title, c]))
  return ordered.map((title, index) => ({ ...byTitle.get(title)!, index }))
}

function chunksToOutlineItems(chunks: OutlineChunk[]): OutlineItem[] {
  return sortChunks(chunks).map(chunk => ({
    id: randomUUID(),
    title: chunk.title,
    sceneType: mapSceneType(chunk.sceneType),
    objective: chunk.objective,
    durationHint: chunk.durationHint,
    ...(chunk.concepts ? { concepts: chunk.concepts } : {}),
  }))
}

export class TeachingPlanBuilder {
  static fromCustom(
    config: SetupConfig,
    chunks: OutlineChunk[],
    emphasizedConcepts: string[],
    gradeLevel?: string,
  ): TeachingPlan {
    if (chunks.length === 0) {
      throw new Error('TeachingPlanBuilder: outline cannot be empty')
    }
    return {
      id: randomUUID(),
      topic: config.topic,
      sourceDocuments: [],
      teachingMethod: config.teachingMethod,
      style: config.style,
      language: config.language,
      difficulty: config.difficulty,
      agents: makeAgents(config.agentCount),
      outline: chunksToOutlineItems(chunks),
      emphasizedConcepts,
      createdAt: Date.now(),
      ...(gradeLevel !== undefined ? { gradeLevel } : {}),
    }
  }

  static fromQuickDecision(
    result: QuickDecisionResult,
    emphasizedConcepts: string[],
    gradeLevel?: string,
  ): TeachingPlan {
    const chunks: OutlineChunk[] = result.outline.map((item, index) => ({
      ...item,
      index,
    }))
    return {
      id: randomUUID(),
      topic: result.topic,
      sourceDocuments: [],
      teachingMethod: 'standard',
      style: result.style,
      language: result.language,
      difficulty: result.difficulty,
      agents: makeAgents(result.agentCount),
      outline: chunksToOutlineItems(chunks),
      emphasizedConcepts,
      createdAt: Date.now(),
      ...(gradeLevel !== undefined ? { gradeLevel } : {}),
    }
  }
}
