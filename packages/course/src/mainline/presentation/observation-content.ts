import type { LessonScene } from '../domain.js'

const PANEL_FIELDS = [
  { titleKey: 'panelATitle', detailKey: 'panelA', fallbackTitle: '观察一' },
  { titleKey: 'panelBTitle', detailKey: 'panelB', fallbackTitle: '观察二' },
  { titleKey: 'panelCTitle', detailKey: 'panelC', fallbackTitle: '观察三' },
] as const

export interface ObservationPanel {
  id: 'panelA' | 'panelB' | 'panelC'
  title: string
  detail: string
}

function cleanPanelMarker(value: string): string {
  return value.trim().replace(/^[A-CＡ-Ｃ]\s*(?:层|项)?\s*[·.、:：-]?\s*/u, '').trim()
}

function shortPrefix(value: string): string | undefined {
  const normalized = cleanPanelMarker(value)
  const delimiter = normalized.search(/[：:]/u)
  if (delimiter <= 0 || delimiter > 16) return undefined
  const prefix = normalized.slice(0, delimiter).trim()
  return prefix.length >= 2 ? prefix : undefined
}

function firstClause(value: string): string | undefined {
  const normalized = cleanPanelMarker(value)
  const clause = normalized.split(/[，,；;。]/u, 1)[0]?.trim()
  if (!clause) return undefined
  return clause.length <= 20 ? clause : `${clause.slice(0, 18)}…`
}

function deriveTitle(detail: string, boardText: string[], index: number, fallbackTitle: string): string {
  const fromDetail = shortPrefix(detail)
  if (fromDetail) return fromDetail

  // 只有恰好三条板书时才允许把对应项借作旧数据的标题候选；
  // 板书数量不同意味着它承担的是另一套教师总结，不能重新定义画面结构。
  if (boardText.length === PANEL_FIELDS.length) {
    const boardItem = boardText[index] ?? ''
    const normalizedBoardItem = cleanPanelMarker(boardItem)
    const conciseBoardTitle = normalizedBoardItem.length <= 16 && !normalizedBoardItem.includes('\\(')
      ? normalizedBoardItem
      : undefined
    return shortPrefix(boardItem) ?? conciseBoardTitle ?? firstClause(detail) ?? fallbackTitle
  }

  return firstClause(detail) ?? fallbackTitle
}

function detailForDisplay(detail: string, title: string): string {
  const normalized = cleanPanelMarker(detail)
  for (const delimiter of ['：', ':']) {
    const prefix = `${title}${delimiter}`
    if (normalized.startsWith(prefix)) return normalized.slice(prefix.length).trim()
  }
  return normalized
}

/**
 * 为观察页补齐三层画面标题。板书仍是独立的教师总结，不会被覆写。
 * 新生成内容和旧课程迁移共用这套确定性规则。
 */
export function ensureObservationPanelTitles(
  contentSlots: Record<string, string>,
  boardText: string[] = [],
): Record<string, string> {
  const next = { ...contentSlots }
  PANEL_FIELDS.forEach(({ titleKey, detailKey, fallbackTitle }, index) => {
    const detail = next[detailKey]?.trim() ?? ''
    if (!detail || next[titleKey]?.trim()) return
    next[titleKey] = deriveTitle(detail, boardText, index, fallbackTitle)
  })
  return next
}

/** 观察页唯一的画面内容入口：固定三层标题 + 说明，不读取教师板书作为画面卡片。 */
export function observationPanels(scene: LessonScene): ObservationPanel[] {
  const slots = ensureObservationPanelTitles(scene.contentSlots, scene.boardText)
  return PANEL_FIELDS.flatMap(({ titleKey, detailKey, fallbackTitle }) => {
    const detail = slots[detailKey]?.trim()
    if (!detail) return []
    const title = slots[titleKey]?.trim() || fallbackTitle
    return [{
      id: detailKey,
      title,
      detail: detailForDisplay(detail, title),
    }]
  })
}
