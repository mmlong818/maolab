import { misconceptionSourcesOf, type LessonScene } from './domain.js'

/** 错误说法至少要保留多少误区原文的字符双元组，才算仍由教研误区锚定。 */
export const AI_VERIFY_OVERLAP_THRESHOLD = 0.3

export interface AiVerifyPair {
  index: number
  source: string
  claim: string
  reveal: string
}

function highestIndexedSlot(contentSlots: Record<string, string>, prefix: 'aiClaim' | 'reveal'): number {
  let highest = 0
  for (const key of Object.keys(contentSlots)) {
    const match = key.match(new RegExp(`^${prefix}(\\d+)$`))
    if (match) highest = Math.max(highest, Number(match[1]))
  }
  return highest
}

/** 字符双元组集合（去标点空白）；短于 2 字时退化为整串，避免空集合。 */
function bigrams(text: string): Set<string> {
  const clean = text.replace(/[\s，。、,.!?;:「」“”‘’()（）【】\-—…]/g, '')
  const set = new Set<string>()
  for (let index = 0; index < clean.length - 1; index += 1) set.add(clean.slice(index, index + 2))
  if (set.size === 0 && clean.length > 0) set.add(clean)
  return set
}

/**
 * 衡量候选文本还能找到多少误区原文，不因候选文本更长而稀释命中率。
 * 生成兜底与质量闸门共用它，避免“生成认为合格、闸门却阻断”的双重口径。
 */
export function aiVerifyTextOverlapRatio(source: string, candidate: string): number {
  const sourceGrams = bigrams(source)
  if (sourceGrams.size === 0) return 0
  const candidateGrams = bigrams(candidate)
  let hits = 0
  for (const gram of sourceGrams) if (candidateGrams.has(gram)) hits += 1
  return hits / sourceGrams.size
}

function directClaim(source: string): string {
  const punctuation = /[。！？!?]$/.test(source) ? '' : '。'
  return `${source}${punctuation}`
}

function directMisconception(source: string): string {
  const punctuation = /[。！？!?]$/.test(source) ? '' : '。'
  return `学生容易误以为：${source}${punctuation}`
}

/**
 * 辨析页允许模型把教研误区改写成学生口吻，但不允许替换成另一种错误。模型输出
 * 偏离时在落库前回到来源原文；纠偏依据仍保留模型输出并交给事实核查。
 */
export function normalizeGroundedContrastClaim(
  scene: Pick<LessonScene, 'misconceptionSource' | 'misconceptionSources'>,
  contentSlots: Record<string, string>,
): Record<string, string> {
  const source = misconceptionSourcesOf(scene).map(item => item.trim()).find(Boolean)
  if (!source) return contentSlots
  if (aiVerifyTextOverlapRatio(source, contentSlots.misconception ?? '') >= AI_VERIFY_OVERLAP_THRESHOLD) {
    return contentSlots
  }
  return { ...contentSlots, misconception: directMisconception(source) }
}

function mergedDirectClaim(sources: readonly string[]): string {
  const items = sources.map((source, index) => `${index + 1}. ${source.replace(/[。！？!?]$/, '')}`)
  return `${items.join('；')}。`
}

/**
 * 模型可把误区改写成自然口吻，但不能改变错误内容。若改写偏离教研原文，落库前
 * 自动回退为直接锚定说法；揭底内容仍由模型生成并接受后续事实核查。
 */
export function normalizeAiVerifyClaims(
  scene: Pick<LessonScene, 'misconceptionSource' | 'misconceptionSources'>,
  contentSlots: Record<string, string>,
): Record<string, string> {
  const sources = misconceptionSourcesOf(scene).map(item => item.trim()).filter(Boolean)
  if (sources.length === 0) return contentSlots

  const normalized = { ...contentSlots }
  if (sources.length === 1) {
    const source = sources[0]!
    if (aiVerifyTextOverlapRatio(source, normalized.aiClaim ?? '') < AI_VERIFY_OVERLAP_THRESHOLD) {
      normalized.aiClaim = directClaim(source)
    }
    return normalized
  }

  sources.forEach((source, index) => {
    const key = `aiClaim${index + 1}`
    if (aiVerifyTextOverlapRatio(source, normalized[key] ?? '') < AI_VERIFY_OVERLAP_THRESHOLD) {
      normalized[key] = directClaim(source)
    }
  })

  const mergedClaim = normalized.aiClaim ?? ''
  if (!sources.every(source => aiVerifyTextOverlapRatio(source, mergedClaim) >= AI_VERIFY_OVERLAP_THRESHOLD)) {
    normalized.aiClaim = mergedDirectClaim(sources)
  }
  return normalized
}

/**
 * AI 找茬的唯一逐条内容视图。多误区幕优先读取 aiClaimN/revealN；粗槽只作为
 * 旧课兼容回退，质量闸门会阻断缺少细分槽的新课，避免多个条目重复同一段文字。
 */
export function aiVerifyPairs(scene: Pick<LessonScene, 'contentSlots' | 'misconceptionSource' | 'misconceptionSources'>): AiVerifyPair[] {
  const sources = misconceptionSourcesOf(scene).map(item => item.trim())
  const indexedCount = Math.max(
    highestIndexedSlot(scene.contentSlots, 'aiClaim'),
    highestIndexedSlot(scene.contentSlots, 'reveal'),
  )
  const count = Math.max(1, sources.length, indexedCount)
  const fallbackClaim = scene.contentSlots.aiClaim?.trim() ?? ''
  const fallbackReveal = scene.contentSlots.reveal?.trim() ?? ''

  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1
    return {
      index,
      source: sources[offset] ?? '',
      claim: (count === 1 ? fallbackClaim : scene.contentSlots[`aiClaim${index}`]?.trim()) || fallbackClaim,
      reveal: (count === 1 ? fallbackReveal : scene.contentSlots[`reveal${index}`]?.trim()) || fallbackReveal,
    }
  })
}
