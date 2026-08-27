import {
  loadEducationResourceBundle,
  searchEducationResources,
  type EducationResourceBundle,
  type EducationResourceItem,
} from '../../education-resources/catalog.js'
import type {
  SourceAssetRef,
  SourceEvidenceStatus,
  SourceMaterialGrounding,
  SourceProvenance,
} from '../domain.js'

export interface KpGroundingInput {
  id: string
  canonicalName: string
}

export interface KpGroundingSourceRow {
  knowledgePointId: string
  source: string
  externalId?: string | null
  evidenceSnippet?: string | null
  confidence?: number | null
}

export interface CourseGroundingCoverage {
  authoritativeExcerptKps: number
  aiExtractedKps: number
  unverifiedExcerptKps: number
  metadataOnlyKps: number
  unprovenancedKps: number
  matchedResourceKps: number
  matchedResources: number
  resourceCatalogAvailable: boolean
}

export interface CourseGroundingResult {
  byKp: Readonly<Record<string, SourceMaterialGrounding>>
  coverage: CourseGroundingCoverage
}

interface ResolveCourseGroundingsOptions {
  loadBundle?: () => Promise<EducationResourceBundle>
}

function evidenceStatus(row: KpGroundingSourceRow): SourceEvidenceStatus {
  const hasExcerpt = Boolean(row.evidenceSnippet?.trim())
  if (!hasExcerpt) return 'curriculum-metadata'
  const source = row.source.trim()
  if (/^llm(?:$|[-_:])/i.test(source)) return 'ai-extracted'
  if (/^(?:pep|textbook|smartedu|manual-verified|curated-verified)(?:$|[-_:])/i.test(source)) return 'authoritative-excerpt'
  return 'unverified-excerpt'
}

function sourcePriority(row: KpGroundingSourceRow): number {
  const status = evidenceStatus(row)
  if (status === 'authoritative-excerpt') return 0
  if (status === 'unverified-excerpt') return 1
  if (status === 'ai-extracted') return 2
  if (/^pep(?:$|[-_:])/i.test(row.source.trim())) return 3
  return 4
}

function selectedSource(rows: readonly KpGroundingSourceRow[]): KpGroundingSourceRow | undefined {
  return [...rows].sort((left, right) => sourcePriority(left) - sourcePriority(right))[0]
}

function provenanceOf(row: KpGroundingSourceRow): SourceProvenance {
  return {
    source: row.source,
    ...(row.externalId ? { externalId: row.externalId } : {}),
    ...(typeof row.confidence === 'number' ? { confidence: row.confidence } : {}),
    evidenceStatus: evidenceStatus(row),
  }
}

function sourceCitation(row: KpGroundingSourceRow, status: SourceEvidenceStatus): string {
  const location = row.externalId ? `，节点 ${row.externalId}` : ''
  if (status === 'authoritative-excerpt') return `权威来源 ${row.source}${location}`
  if (status === 'ai-extracted') return `AI 提取线索 ${row.source}${location}（待人工复核）`
  if (status === 'unverified-excerpt') return `未核验摘录 ${row.source}${location}（待人工复核）`
  return `课程目录来源 ${row.source}${location}（仅用于教材定位）`
}

function assetCitation(item: EducationResourceItem): string | undefined {
  if (item.sourceAttribution?.trim()) return item.sourceAttribution.trim()
  const parts = [item.publisher, item.textbookTitle, item.pdfPage ? `第 ${item.pdfPage} 页` : undefined]
    .filter((part): part is string => Boolean(part))
  return parts.length > 0 ? parts.join('，') : undefined
}

function assetRef(item: EducationResourceItem): SourceAssetRef {
  const citation = assetCitation(item)
  return {
    id: item.id,
    kind: 'textbook-asset',
    title: item.title,
    assetUrl: item.assetUrl,
    mediaType: item.mediaType,
    ...(item.sourceUrl ? { sourceUrl: item.sourceUrl } : {}),
    ...(citation ? { citation } : {}),
    ...(item.revealPolicy ? { revealPolicy: item.revealPolicy } : {}),
  }
}

/**
 * 把数据库里的课程来源和外部教育资源变成可追溯、可降级的建课输入。
 * 资源目录不可用时只舍弃配图候选，不影响课程骨架和数据库来源定位。
 */
export async function resolveCourseGroundings(
  kps: readonly KpGroundingInput[],
  sourceRows: readonly KpGroundingSourceRow[],
  options: ResolveCourseGroundingsOptions = {},
): Promise<CourseGroundingResult> {
  let bundle: EducationResourceBundle | undefined
  try {
    bundle = await (options.loadBundle ?? loadEducationResourceBundle)()
  } catch {
    bundle = undefined
  }

  const rowsByKp = new Map<string, KpGroundingSourceRow[]>()
  for (const row of sourceRows) {
    const bucket = rowsByKp.get(row.knowledgePointId) ?? []
    bucket.push(row)
    rowsByKp.set(row.knowledgePointId, bucket)
  }

  const byKp: Record<string, SourceMaterialGrounding> = {}
  const coverage: CourseGroundingCoverage = {
    authoritativeExcerptKps: 0,
    aiExtractedKps: 0,
    unverifiedExcerptKps: 0,
    metadataOnlyKps: 0,
    unprovenancedKps: 0,
    matchedResourceKps: 0,
    matchedResources: 0,
    resourceCatalogAvailable: Boolean(bundle),
  }

  for (const kp of kps) {
    const row = selectedSource(rowsByKp.get(kp.id) ?? [])
    const provenance = row ? provenanceOf(row) : undefined
    const excerpt = row?.evidenceSnippet?.trim()
    const resources = bundle
      ? searchEducationResources(bundle, {
          knowledgePointId: kp.id,
          query: kp.canonicalName,
          kind: 'textbook-asset',
          limit: 3,
        }).map(assetRef)
      : []

    if (provenance?.evidenceStatus === 'authoritative-excerpt') coverage.authoritativeExcerptKps += 1
    else if (provenance?.evidenceStatus === 'ai-extracted') coverage.aiExtractedKps += 1
    else if (provenance?.evidenceStatus === 'unverified-excerpt') coverage.unverifiedExcerptKps += 1
    else if (provenance?.evidenceStatus === 'curriculum-metadata') coverage.metadataOnlyKps += 1
    else coverage.unprovenancedKps += 1
    if (resources.length > 0) coverage.matchedResourceKps += 1
    coverage.matchedResources += resources.length

    byKp[kp.id] = {
      ...(excerpt ? { excerpt } : {}),
      ...(row && provenance ? { citation: sourceCitation(row, provenance.evidenceStatus), provenance } : {}),
      ...(resources.length > 0 ? { candidateResources: resources } : {}),
    }
  }

  return { byKp, coverage }
}
