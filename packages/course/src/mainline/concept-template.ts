import type { KnowledgeType } from '@maolab/shared-types'
import type { InfoShape, LessonScene } from './domain.js'

export type ConceptBuildTemplateId = 'definition-example' | 'strategy-cycle'

export interface ConceptBuildTemplateDefinition {
  id: ConceptBuildTemplateId
  infoShape?: InfoShape
  label: string
  mission: string
  constraints: string
  narrationAnchor: string
}

const DEFINITION_EXAMPLE: ConceptBuildTemplateDefinition = {
  id: 'definition-example',
  label: '概念建构',
  mission: '在观察基础上建立定义、规律或关系的正式表达，并用一个具体正例检查关键词。',
  constraints: 'contentSlots 至少含 statement / example 二键。板书写定义或规律要点。',
  narrationAnchor: '核心表述',
}

const STRATEGY_CYCLE: ConceptBuildTemplateDefinition = {
  id: 'strategy-cycle',
  infoShape: 'progressive',
  label: '策略建构',
  mission: '把元认知策略建成可执行的闭环：先识别什么时候需要它，再按步骤执行，最后用检查问题判断是否有效。',
  constraints: 'contentSlots 核心槽必须是 trigger / steps / selfCheck。trigger 写可观察的使用时机；step 用“→”连接 2-5 个可执行短步骤；selfCheck 写学生执行后自问的检查问题。不得退回 statement / example 的定义加例子结构。',
  narrationAnchor: '策略使用时机',
}

export function selectConceptBuildTemplate(knowledgeType: KnowledgeType | undefined): ConceptBuildTemplateDefinition {
  return knowledgeType === 'metacognitive' ? STRATEGY_CYCLE : DEFINITION_EXAMPLE
}

export function conceptTemplateForScene(
  scene: Pick<LessonScene, 'sceneType' | 'infoShape'>,
): ConceptBuildTemplateDefinition | null {
  if (scene.sceneType !== 'concept-build' || scene.infoShape !== 'progressive') return null
  return STRATEGY_CYCLE
}

export function conceptSeedContentSlots(
  template: ConceptBuildTemplateDefinition,
  focus: string,
): Record<string, string> {
  if (template.id !== 'strategy-cycle') {
    return {
      statement: `待 LLM 填充:${focus} 的核心表述(一句话,定义先行)`,
      example: `待 LLM 填充:一个把 ${focus} 用起来的完整正例`,
    }
  }
  return {
    trigger: `待 LLM 填充:什么学习信号出现时应使用 ${focus}`,
    steps: `待 LLM 填充:识别情境 → 执行 ${focus} → 核对结果`,
    selfCheck: '待 LLM 填充:我如何确认这个策略真的帮助了我',
  }
}

export function conceptTemplatePrompt(
  scene: Pick<LessonScene, 'sceneType' | 'infoShape'>,
): ConceptBuildTemplateDefinition | null {
  return conceptTemplateForScene(scene)
}

const PLACEHOLDER_PATTERN = /^待\s*(?:LLM\s*)?填充[:：]?/i

function useful(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && !PLACEHOLDER_PATTERN.test(trimmed) ? trimmed : undefined
}

function firstUseful(values: readonly (string | undefined)[], fallback: string): string {
  return values.map(useful).find((value): value is string => Boolean(value)) ?? fallback
}

const STRATEGY_ALIAS_KEYS = new Set([
  'trigger', 'useWhen', 'when', 'statement',
  'steps', 'procedure', 'example',
  'selfCheck', 'check', 'reflection',
])

/**
 * 模型只填文字，不能把元认知页改回“定义 + 正例”。额外的学科
 * typed 槽保留，结构别名收敛回 trigger / steps / selfCheck 三个核心槽。
 */
export function normalizeConceptContentSlots(
  scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>,
  generated: Record<string, string>,
  boardText: readonly string[],
): Record<string, string> {
  const template = conceptTemplateForScene(scene)
  if (template?.id !== 'strategy-cycle') return generated

  const extras = Object.fromEntries(
    Object.entries(generated).filter(([key]) => !STRATEGY_ALIAS_KEYS.has(key)),
  )
  const boards = boardText.map(item => item.trim()).filter(Boolean)
  return {
    ...extras,
    trigger: firstUseful(
      [generated.trigger, generated.useWhen, generated.when, generated.statement, scene.contentSlots.trigger],
      boards[0] ?? '遇到不确定的学习任务时启动策略',
    ),
    steps: firstUseful(
      [generated.steps, generated.procedure, generated.example, scene.contentSlots.steps],
      boards.slice(0, 3).join(' → ') || '识别情境 → 执行策略 → 核对结果',
    ),
    selfCheck: firstUseful(
      [generated.selfCheck, generated.check, generated.reflection, scene.contentSlots.selfCheck],
      boards.at(-1) ?? '我的结果是否有证据支持？',
    ),
  }
}

export function strategyStepNodes(value: string | undefined): string[] {
  return (value ?? '').split(/→|->/).map(item => item.trim()).filter(Boolean)
}

export function conceptTemplateProblems(
  scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>,
): string[] {
  const template = conceptTemplateForScene(scene)
  if (template?.id !== 'strategy-cycle') return []
  const problems = ['trigger', 'steps', 'selfCheck']
    .filter(key => !scene.contentSlots[key]?.trim())
    .map(key => `缺少策略槽 ${key}`)
  const steps = strategyStepNodes(scene.contentSlots.steps)
  if (steps.length < 2 || steps.length > 5) problems.push('执行步骤需要 2-5 个箭头连接的节点')
  return problems
}
