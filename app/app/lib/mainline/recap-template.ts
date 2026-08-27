import type { KnowledgeType } from '@maolab/shared-types'
import type { InfoShape, LessonScene } from './domain.js'

export type RecapTemplateId =
  | 'learning-ladder'
  | 'belief-revision'
  | 'claim-evidence'
  | 'concept-network'

export interface RecapKnowledgeInput {
  canonicalName: string
  knowledgeType?: KnowledgeType
  misconceptions?: readonly string[]
}

export interface RecapTemplateDefinition {
  id: RecapTemplateId
  infoShape: InfoShape
  label: string
  mission: string
  constraints: string
  visualFocus: string
  narrationAnchor: string
  successSignal: string
}

export type RecapTransferConfidence = 'low' | 'medium' | 'high'
export type RecapTransferReviewDecision = 'kept' | 'revised'

export type RecapTransferAttempt =
  | {
      mode: 'typed'
      confidence: RecapTransferConfidence
      response: string
      reviewDecision: RecapTransferReviewDecision
      reviewNote: string
    }
  | {
      mode: 'paper-or-oral'
      confidence: RecapTransferConfidence
      paperOrOralComplete: true
      paperReviewComplete: true
    }

export const RECAP_TRANSFER_RESPONSE_MAX_LENGTH = 600
export const RECAP_TRANSFER_REVIEW_MAX_LENGTH = 400
export const RECAP_TRANSFER_SUCCESS_CRITERIA = [
  '完成题目要求的判断、计算或作品',
  '指出题面改变的条件、对象、材料或数据',
  '用本课规则、证据或关键步骤说明依据',
] as const

const TRANSFER_PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i
const TRANSFER_ACTION_PATTERN = /判断|解释|说明|计算|画出|设计|比较|改写|排序|标注|选择|写出|推断|预测|论证|归类|找出|提出/
const TRANSFER_CHANGE_PATTERN = /如果|假如|改为|换成|变成|只改变|增加|减少|新增|替换|去掉|另一|另一个|不同|新材料|新数据|新对象|新条件|新场景|新情境/
const GENERIC_TRANSFER_PATTERN = /^(?:请)?(?:再)?(?:举|写|说|找|设计|想)(?:出)?一个(?:新的?|不同的?)?(?:例子|情境|场景)(?:并说明|来说明|验证|检验)?[。！!]?$/
const ANSWER_LEAK_PATTERN = /(?:答案|结论|结果|正确选项)(?:是(?!否|什么)|为(?!何))|(?:一定|必然|肯定).{0,12}(?:变大|变小|增加|减少|成立|不成立|相等|正确|错误)|(?:所以|因此|由此可知).{0,24}(?:应|是|为|等于)|应选[ A-DＡ-Ｄ]|结果为\s*[-+]?\d/
const TRANSFER_REASONING_PATTERN = /因为|依据|理由|证据|条件|步骤|关系|根据|由此|先.+再|如果|假如|计算|推导|比较/

const RECAP_TEMPLATES: Readonly<Record<RecapTemplateId, RecapTemplateDefinition>> = {
  'learning-ladder': {
    id: 'learning-ladder',
    infoShape: 'progressive',
    label: '迁移阶梯',
    mission: '按“理解对象→掌握方法→独立应用”的依赖关系收束本课，突出每一步如何支持下一步。',
    constraints: 'contentSlots 只能把 path / takeaway / transferTask 作为核心槽。path 用“→”连接 3-5 个短节点，每个节点不超过 12 字；节点必须有先后依赖，不能只是把知识点并排列出。transferTask 必须给出一个只改变单一条件的具体新题，不能让学生自行发明情境。',
    visualFocus: '从理解到独立应用的迁移阶梯',
    narrationAnchor: '迁移阶梯',
    successSignal: '学生能解释迁移阶梯中的关键一步，并把方法应用到一个新情境。',
  },
  'belief-revision': {
    id: 'belief-revision',
    infoShape: 'contrast',
    label: '想法修正',
    mission: '把学生课前可能持有的起始想法与本课形成的新解释一一对照，并明确促成修正的证据。',
    constraints: 'contentSlots 核心槽必须是 startingIdea / revisedIdea / revisionEvidence / takeaway / transferTask。startingIdea 是课前判断或已处理过的典型误区；revisedIdea 是修正后的解释；revisionEvidence 只引用本课已经出现的证据；不得引入新事实。transferTask 必须给出一个只改变单一条件的具体新判断，不能让学生自行发明情境。',
    visualFocus: '从起始想法到证据修正',
    narrationAnchor: '想法修正',
    successSignal: '学生能指出自己的一处想法变化，并引用本课证据说明为什么要修正。',
  },
  'claim-evidence': {
    id: 'claim-evidence',
    infoShape: 'hierarchy',
    label: '结论与依据',
    mission: '先给出全课总论断，再用三个已经学过的要点支撑它，形成可解释而不是可照读的总结。',
    constraints: 'contentSlots 核心槽必须是 shapeSummary / shapeItem1 / shapeItem2 / shapeItem3 / takeaway / transferTask。shapeSummary 是总论断；三个 shapeItem 是彼此不同、已经在前页出现过的依据；takeaway 是可迁移的一句话收获。transferTask 必须给出一个只改变单一条件的具体新任务，不能让学生自行发明例子。',
    visualFocus: '结论与三条依据',
    narrationAnchor: '结论与依据',
    successSignal: '学生能用至少两条本课依据解释总论断，并举出一个新例子。',
  },
  'concept-network': {
    id: 'concept-network',
    infoShape: 'radial',
    label: '概念网络',
    mission: '以本课主题为中心，把多个知识点组织成有联系的分支，并用一句话说清它们共同解决的问题。',
    constraints: 'contentSlots 核心槽必须含 shapeCenter、3-5 个连续编号的 shapeItemN、takeaway、transferTask。shapeCenter 是共同主题；每个 shapeItemN 对应一个知识点或一组紧密相关知识点，并写清它与中心的关系；不得把互不相关的句子伪装成网络。transferTask 必须给出一个只改变单一条件的具体新任务，不能让学生自行发明情境。',
    visualFocus: '本课概念网络',
    narrationAnchor: '概念网络',
    successSignal: '学生能从中心主题出发解释至少三个分支之间的联系，并迁移到一个新情境。',
  },
}

const TEMPLATE_BY_SHAPE: Readonly<Partial<Record<InfoShape, RecapTemplateDefinition>>> = {
  progressive: RECAP_TEMPLATES['learning-ladder'],
  contrast: RECAP_TEMPLATES['belief-revision'],
  hierarchy: RECAP_TEMPLATES['claim-evidence'],
  radial: RECAP_TEMPLATES['concept-network'],
}

export function selectRecapTemplate(kps: readonly RecapKnowledgeInput[]): RecapTemplateDefinition {
  if (kps.length >= 3) return RECAP_TEMPLATES['concept-network']
  if (kps.length === 2) return RECAP_TEMPLATES['claim-evidence']

  const kp = kps[0]
  const knowledgeType = kp?.knowledgeType ?? 'conceptual'
  if (knowledgeType === 'procedural' || knowledgeType === 'metacognitive') {
    return RECAP_TEMPLATES['learning-ladder']
  }
  if (knowledgeType === 'conceptual' && (kp?.misconceptions?.length ?? 0) > 0) {
    return RECAP_TEMPLATES['belief-revision']
  }
  return RECAP_TEMPLATES['claim-evidence']
}

export function recapTemplateForScene(scene: Pick<LessonScene, 'sceneType' | 'infoShape'>): RecapTemplateDefinition | null {
  if (scene.sceneType !== 'recap' || !scene.infoShape) return null
  return TEMPLATE_BY_SHAPE[scene.infoShape] ?? null
}

function itemCountFor(kps: readonly RecapKnowledgeInput[]): number {
  return Math.min(5, Math.max(3, kps.length))
}

export function recapSeedContentSlots(
  template: RecapTemplateDefinition,
  kps: readonly RecapKnowledgeInput[],
  topic: string,
): Record<string, string> {
  const names = kps.map(kp => kp.canonicalName)
  if (template.id === 'learning-ladder') {
    return {
      path: `理解${names[0] ?? topic} → 跟随示范 → 独立应用`,
      takeaway: '待 LLM 填充:本课可迁移的一句话结论',
      transferTask: '待 LLM 填充:只改变一个条件的具体迁移题',
    }
  }
  if (template.id === 'belief-revision') {
    return {
      startingIdea: kps[0]?.misconceptions?.[0] ?? '待 LLM 填充:课前判断或典型误区',
      revisedIdea: '待 LLM 填充:修正后的解释',
      revisionEvidence: '待 LLM 填充:促成修正的本课证据',
      takeaway: '待 LLM 填充:本课可迁移的一句话结论',
      transferTask: '待 LLM 填充:只改变一个条件的具体迁移题',
    }
  }
  if (template.id === 'claim-evidence') {
    return {
      shapeSummary: '待 LLM 填充:本课总论断',
      shapeItem1: names[0] ? `待 LLM 填充:${names[0]} 的关键依据` : '待 LLM 填充:关键依据一',
      shapeItem2: names[1] ? `待 LLM 填充:${names[1]} 的关键依据` : '待 LLM 填充:关键依据二',
      shapeItem3: names.length > 1 ? '待 LLM 填充:两个知识点的共同落点' : '待 LLM 填充:关键依据三',
      takeaway: '待 LLM 填充:本课可迁移的一句话结论',
      transferTask: '待 LLM 填充:只改变一个条件的具体迁移题',
    }
  }

  const slots: Record<string, string> = { shapeCenter: topic }
  const count = itemCountFor(kps)
  for (let index = 0; index < count; index += 1) {
    const name = names[index]
    slots[`shapeItem${index + 1}`] = name
      ? `待 LLM 填充:${name} 与中心主题的关系`
      : index === count - 1 && names.length > count
        ? `待 LLM 填充:其余 ${names.length - count + 1} 个知识点与中心的联系`
        : `待 LLM 填充:分支 ${index + 1} 与中心主题的关系`
  }
  slots.takeaway = '待 LLM 填充:多个知识点共同形成的一句话结论'
  slots.transferTask = '待 LLM 填充:只改变一个条件的具体迁移题'
  return slots
}

function shapeItemKeys(slots: Record<string, string>): string[] {
  return Object.keys(slots)
    .filter(key => /^shapeItem\d+$/.test(key))
    .sort((left, right) => Number(left.slice(9)) - Number(right.slice(9)))
}

export function recapCoreSlotKeys(scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>): string[] {
  const template = recapTemplateForScene(scene)
  if (!template || template.id === 'learning-ladder') return ['path', 'takeaway', 'transferTask']
  if (template.id === 'belief-revision') return ['startingIdea', 'revisedIdea', 'revisionEvidence', 'takeaway', 'transferTask']
  const items = shapeItemKeys(scene.contentSlots)
  return [template.id === 'concept-network' ? 'shapeCenter' : 'shapeSummary', ...items, 'takeaway', 'transferTask']
}

export function recapTemplatePrompt(scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>): RecapTemplateDefinition | null {
  return recapTemplateForScene(scene)
}

const PLACEHOLDER_PATTERN = /^待\s*(?:LLM\s*)?填充[:：]?/i

function useful(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed && !PLACEHOLDER_PATTERN.test(trimmed) ? trimmed : undefined
}

function normalizedPath(value: string | undefined, boardText: readonly string[]): string {
  const direct = useful(value)
  const nodes = direct?.split('→').map(item => item.trim()).filter(Boolean) ?? []
  if (nodes.length >= 3) return nodes.slice(0, 5).join(' → ')
  const boardNodes = boardText.map(item => item.trim()).filter(Boolean).slice(0, 4)
  if (boardNodes.length >= 3) return boardNodes.join(' → ')
  return [...boardNodes, '迁移应用'].slice(0, 3).join(' → ')
}

/**
 * 模型只填文字，不能改收束结构。这里按编译期模板白名单重建核心槽；模型漏键或
 * 自造键时，以板书和骨架种子补足，保证单页重生成与整课填充都不会把结构改回去。
 */
export function normalizeRecapContentSlots(
  scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>,
  generated: Record<string, string>,
  boardText: readonly string[],
): Record<string, string> {
  const template = recapTemplateForScene(scene)
  if (!template) return generated

  const coreKeys = recapCoreSlotKeys(scene)
  const used = new Set<string>()
  const pool = Object.entries(generated)
    .filter(([key, value]) => key !== 'serialHook' && !coreKeys.includes(key) && Boolean(useful(value)))
    .map(([, value]) => value.trim())
  const boards = boardText.map(item => item.trim()).filter(Boolean)

  const take = (key: string, aliases: readonly string[], fallbackIndex: number): string => {
    const candidates = [generated[key], ...aliases.map(alias => generated[alias]), scene.contentSlots[key]]
    for (const candidate of candidates) {
      const value = useful(candidate)
      if (value && !used.has(value)) {
        used.add(value)
        return value
      }
    }
    const fallback = [...pool, ...boards].find(value => !used.has(value))
      ?? boards[fallbackIndex % Math.max(boards.length, 1)]
      ?? '回看本课证据并说明理由'
    used.add(fallback)
    return fallback
  }

  let normalized: Record<string, string>
  if (template.id === 'learning-ladder') {
    normalized = {
      path: normalizedPath(generated.path ?? scene.contentSlots.path, boardText),
      takeaway: take('takeaway', ['conclusion', 'shapeSummary'], 0),
      transferTask: take('transferTask', ['challenge', 'applicationTask', 'nearTransfer'], 1),
    }
  } else if (template.id === 'belief-revision') {
    normalized = {
      startingIdea: take('startingIdea', ['misconception', 'before'], 0),
      revisedIdea: take('revisedIdea', ['correction', 'after'], 1),
      revisionEvidence: take('revisionEvidence', ['evidence', 'basis'], 2),
      takeaway: take('takeaway', ['conclusion'], 0),
      transferTask: take('transferTask', ['challenge', 'applicationTask', 'nearTransfer'], 1),
    }
  } else {
    const itemKeys = coreKeys.filter(key => /^shapeItem\d+$/.test(key))
    normalized = {
      [template.id === 'concept-network' ? 'shapeCenter' : 'shapeSummary']:
        take(template.id === 'concept-network' ? 'shapeCenter' : 'shapeSummary', ['center', 'summary', 'conclusion'], 0),
    }
    itemKeys.forEach((key, index) => {
      normalized[key] = take(key, [`item${index + 1}`, `point${index + 1}`], index)
    })
    normalized.takeaway = take('takeaway', ['conclusion'], 0)
    normalized.transferTask = take('transferTask', ['challenge', 'applicationTask', 'nearTransfer'], 1)
  }

  const serialHook = useful(generated.serialHook)
  if (serialHook) normalized.serialHook = serialHook
  return normalized
}

export function recapTemplateProblems(scene: Pick<LessonScene, 'sceneType' | 'infoShape' | 'contentSlots'>): string[] {
  const template = recapTemplateForScene(scene)
  if (!template) return []
  const missing = recapCoreSlotKeys(scene).filter(key => !scene.contentSlots[key]?.trim())
  const problems = missing.map(key => `缺少结构槽 ${key}`)
  const items = shapeItemKeys(scene.contentSlots)
  if ((template.infoShape === 'radial' || template.infoShape === 'hierarchy') && items.length < 3) {
    problems.push(`${template.label}至少需要 3 个支撑项`)
  }
  if (template.infoShape === 'progressive') {
    const nodes = (scene.contentSlots.path ?? '').split('→').map(item => item.trim()).filter(Boolean)
    if (nodes.length < 3 || nodes.length > 5) problems.push('迁移阶梯需要 3-5 个箭头连接的节点')
  }
  const structuralKeys = recapCoreSlotKeys(scene).filter(key => key !== 'transferTask')
  const structureHasBeenFilled = structuralKeys.every(key => Boolean(useful(scene.contentSlots[key])))
  if (structureHasBeenFilled) problems.push(...recapTransferTaskProblems(scene.contentSlots.transferTask))
  return problems
}

/**
 * 迁移题必须把“变化了什么”写在题面里，并要求学生留下可检查回答。仅写“举个
 * 新例子”会把最困难的情境设计工作推给学生，也无法让教师比较全班表现。
 */
export function recapTransferTaskProblems(value: string | undefined): string[] {
  const task = value?.trim() ?? ''
  if (!task || TRANSFER_PLACEHOLDER_PATTERN.test(task)) return ['缺少具体迁移题 transferTask']
  const problems: string[] = []
  if (task.length < 18) problems.push('迁移题过短，未提供可作答的新条件')
  if (task.length > 160) problems.push('迁移题超过 160 字，收束页认知负担过高')
  if (!TRANSFER_CHANGE_PATTERN.test(task)) problems.push('迁移题没有明确改变条件、对象、材料或数据')
  if (!TRANSFER_ACTION_PATTERN.test(task)) problems.push('迁移题没有要求判断、解释、计算、比较或产出作品')
  if (GENERIC_TRANSFER_PATTERN.test(task)) problems.push('迁移题仍把新例子或新情境留给学生自行发明')
  if (ANSWER_LEAK_PATTERN.test(task)) problems.push('迁移题题面提前写出了答案或结果')
  return problems
}

export function recapTransferStateKey(courseId: string, sceneId: string): string {
  return `${courseId}:${sceneId}:transfer`
}

export function normalizeRecapTransferResponse(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length <= RECAP_TRANSFER_RESPONSE_MAX_LENGTH ? normalized : undefined
}

export function normalizeRecapTransferReview(value: string | undefined): string | undefined {
  const normalized = value?.trim().replace(/\s+/g, ' ')
  return normalized && normalized.length <= RECAP_TRANSFER_REVIEW_MAX_LENGTH ? normalized : undefined
}

export function recapTransferResponseIsReady(value: string | undefined): boolean {
  const response = normalizeRecapTransferResponse(value)
  return Boolean(response && response.length >= 8 && TRANSFER_REASONING_PATTERN.test(response))
}

export function recapTransferAttemptIsComplete(attempt: RecapTransferAttempt | undefined): boolean {
  if (!attempt || !isRecapTransferConfidence(attempt.confidence)) return false
  if (attempt.mode === 'paper-or-oral') {
    return attempt.paperOrOralComplete === true && attempt.paperReviewComplete === true
  }
  if (!isRecapTransferReviewDecision(attempt.reviewDecision)) return false
  const review = normalizeRecapTransferReview(attempt.reviewNote)
  return recapTransferResponseIsReady(attempt.response)
    && Boolean(review && review.length >= 8 && TRANSFER_REASONING_PATTERN.test(review))
}

function isRecapTransferConfidence(value: unknown): value is RecapTransferConfidence {
  return value === 'low' || value === 'medium' || value === 'high'
}

function isRecapTransferReviewDecision(value: unknown): value is RecapTransferReviewDecision {
  return value === 'kept' || value === 'revised'
}
