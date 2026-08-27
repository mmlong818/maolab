import { NextResponse } from 'next/server'

import {
  educationResourceFor,
  loadEducationResourceBundle,
  searchEducationResources,
  type EducationResourceItem,
  type EducationResourceKind,
} from '../../../lib/education-resources/catalog.js'

export const runtime = 'nodejs'

const KINDS = new Set<EducationResourceKind>([
  'textbook-asset', 'history-map', 'standard-map', 'thematic-map',
  'biology-symbol', 'circuit-symbol', 'safety-symbol',
])

function publicItem(item: EducationResourceItem) {
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    subjects: item.subjects,
    categories: item.categories,
    tags: item.tags,
    assetUrl: item.assetUrl,
    mediaType: item.mediaType,
    sourceUrl: item.sourceUrl,
    sourceAttribution: item.sourceAttribution,
    license: item.license,
    auditNumber: item.auditNumber,
    temporalCoverage: item.temporalCoverage,
    spatialResolution: item.spatialResolution,
    textbookTitle: item.textbookTitle,
    publisher: item.publisher,
    pdfPage: item.pdfPage,
    knowledgePointIds: item.knowledgePointIds,
    chapterNodeIds: item.chapterNodeIds,
    revealPolicy: item.revealPolicy,
  }
}

export async function GET(request: Request) {
  try {
    const bundle = await loadEducationResourceBundle()
    const url = new URL(request.url)
    const id = url.searchParams.get('id')?.trim().slice(0, 200)
    if (id) {
      const item = educationResourceFor(bundle, id)
      return item
        ? NextResponse.json({ item: publicItem(item) })
        : NextResponse.json({ error: '教育资源不存在。' }, { status: 404 })
    }

    const requestedKind = url.searchParams.get('kind') as EducationResourceKind | null
    const kind = requestedKind && KINDS.has(requestedKind) ? requestedKind : undefined
    const requestedLimit = Number(url.searchParams.get('limit') ?? 50)
    const subject = url.searchParams.get('subject')?.slice(0, 30) || undefined
    const knowledgePointId = url.searchParams.get('knowledgePointId')?.slice(0, 100) || undefined
    const chapterNodeId = url.searchParams.get('chapterNodeId')?.slice(0, 100) || undefined
    const items = searchEducationResources(bundle, {
      query: url.searchParams.get('q')?.slice(0, 160) ?? '',
      ...(subject ? { subject } : {}),
      ...(kind ? { kind } : {}),
      ...(knowledgePointId ? { knowledgePointId } : {}),
      ...(chapterNodeId ? { chapterNodeId } : {}),
      limit: Number.isFinite(requestedLimit) ? requestedLimit : 50,
    })

    return NextResponse.json({
      bundle: {
        generatedAt: bundle.summary.generatedAt,
        resourceFiles: bundle.summary.resourceFiles,
        totalBytes: bundle.summary.totalBytes,
        catalogItems: bundle.items.length,
        counts: bundle.counts,
        inventoryAlgorithm: bundle.summary.inventoryAlgorithm,
      },
      count: items.length,
      items: items.map(publicItem),
    })
  } catch (error) {
    console.error('[education-resources]', error)
    return NextResponse.json({ error: '教育资源库未配置或校验失败。' }, { status: 503 })
  }
}
