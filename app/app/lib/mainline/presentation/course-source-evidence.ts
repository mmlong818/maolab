import type { SourceAssetRef, SourceEvidenceStatus, SourceMaterialRef } from '../domain.js'

export type SourceEvidenceTone = 'verified' | 'locator' | 'review' | 'legacy'

export interface SourceResourceView extends SourceAssetRef {
  usageLabel: string
  usageNote: string
}

export interface SourceEvidenceView {
  key: string
  kpId?: string
  title: string
  statusLabel: string
  statusNote: string
  tone: SourceEvidenceTone
  excerpt?: string
  citation?: string
  resources: SourceResourceView[]
}

export interface CourseSourceEvidenceView {
  items: SourceEvidenceView[]
  verifiedCount: number
  locatorCount: number
  reviewCount: number
  resourceCount: number
}

interface EvidencePresentation {
  statusLabel: string
  statusNote: string
  tone: SourceEvidenceTone
}

const PRESENTATION_BY_STATUS: Record<SourceEvidenceStatus, EvidencePresentation> = {
  'authoritative-excerpt': {
    statusLabel: '已核验原文',
    statusNote: '可作为讲解与事实核查的依据。',
    tone: 'verified',
  },
  'curriculum-metadata': {
    statusLabel: '教材目录定位',
    statusNote: '已找到课程目录节点，但没有教材原文。',
    tone: 'locator',
  },
  'ai-extracted': {
    statusLabel: 'AI 提取待复核',
    statusNote: '只能作为查找线索，核对原文后再用于讲解。',
    tone: 'review',
  },
  'unverified-excerpt': {
    statusLabel: '摘录待复核',
    statusNote: '已有文字摘录，但来源尚未完成核验。',
    tone: 'review',
  },
}

const SOURCE_PLACEHOLDER_PATTERN = /待\s*(?:LLM\s*)?填充|待补(?:充|录入)|TODO|TBD/i

function trimmed(value: string | undefined): string | undefined {
  const result = value?.trim()
  return result ? result : undefined
}

function legacyPresentation(source: SourceMaterialRef): EvidencePresentation {
  const excerpt = trimmed(source.excerpt)
  if (excerpt && SOURCE_PLACEHOLDER_PATTERN.test(excerpt)) {
    return {
      statusLabel: '来源内容未补齐',
      statusNote: '旧课保存的是待补占位文字，不是教材原文。',
      tone: 'legacy',
    }
  }
  if (excerpt) {
    return {
      statusLabel: '旧课摘录待复核',
      statusNote: '旧课程没有保存可信级别，使用前需核对原始教材。',
      tone: 'legacy',
    }
  }
  if (trimmed(source.citation)) {
    return {
      statusLabel: '来源定位待复核',
      statusNote: '已记录来源位置，但旧课程没有保存可信级别。',
      tone: 'legacy',
    }
  }
  return {
    statusLabel: '仅有知识点名称',
    statusNote: '尚无可核查的教材原文或来源位置。',
    tone: 'legacy',
  }
}

function resourceView(resource: SourceAssetRef): SourceResourceView {
  const explanationOnly = resource.revealPolicy === 'explanation-only'
  return {
    ...resource,
    usageLabel: explanationOnly ? '讲解阶段使用' : '备课候选',
    usageNote: explanationOnly
      ? '不要在观察或提问前展示，避免提前给出答案。'
      : '教师确认内容与时机后，再决定是否加入课程页面。',
  }
}

function isLocalEducationResource(resource: SourceAssetRef): boolean {
  return resource.assetUrl.startsWith('/api/v2/education-resources/file/')
}

export function sourceEvidenceView(source: SourceMaterialRef, index = 0): SourceEvidenceView {
  const presentation = source.provenance
    ? PRESENTATION_BY_STATUS[source.provenance.evidenceStatus]
    : legacyPresentation(source)
  const seenResourceIds = new Set<string>()
  const resources = (source.candidateResources ?? [])
    .filter(resource => {
      if (!isLocalEducationResource(resource)) return false
      if (seenResourceIds.has(resource.id)) return false
      seenResourceIds.add(resource.id)
      return true
    })
    .map(resourceView)
  const rawExcerpt = trimmed(source.excerpt)
  const excerpt = rawExcerpt && !SOURCE_PLACEHOLDER_PATTERN.test(rawExcerpt) ? rawExcerpt : undefined
  const citation = trimmed(source.citation)

  return {
    key: `${source.kpId ?? source.kind}-${index}-${source.title}`,
    ...(source.kpId ? { kpId: source.kpId } : {}),
    title: source.title,
    ...presentation,
    ...(excerpt ? { excerpt } : {}),
    ...(citation ? { citation } : {}),
    resources,
  }
}

export function courseSourceEvidenceView(sources: readonly SourceMaterialRef[]): CourseSourceEvidenceView {
  const items = sources.map(sourceEvidenceView)
  return {
    items,
    verifiedCount: items.filter(item => item.tone === 'verified').length,
    locatorCount: items.filter(item => item.tone === 'locator').length,
    reviewCount: items.filter(item => item.tone === 'review' || item.tone === 'legacy').length,
    resourceCount: items.reduce((total, item) => total + item.resources.length, 0),
  }
}
