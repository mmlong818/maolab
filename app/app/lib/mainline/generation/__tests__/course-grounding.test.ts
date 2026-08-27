import { describe, expect, it } from 'vitest'
import type { EducationResourceBundle, EducationResourceItem } from '../../../education-resources/catalog.js'
import { resolveCourseGroundings, type KpGroundingSourceRow } from '../course-grounding.js'

function resource(overrides: Partial<EducationResourceItem> = {}): EducationResourceItem {
  return {
    id: 'asset-zhang-qian',
    kind: 'textbook-asset',
    title: '张骞出使西域路线图',
    subjects: ['历史'],
    categories: ['教材插图'],
    tags: ['张骞', '西域'],
    catalogPath: 'textbook-assets/catalog.json',
    filePath: 'textbook-assets/zhang-qian.jpg',
    assetUrl: '/api/v2/education-resources/file/textbook-assets%2Fzhang-qian.jpg',
    mediaType: 'image/jpeg',
    sourceUrl: 'https://example.test/textbook',
    sourceAttribution: '人民教育出版社教材插图',
    knowledgePointIds: ['kp-zhang-qian'],
    chapterNodeIds: ['chapter-western-regions'],
    revealPolicy: 'explanation-only',
    ...overrides,
  }
}

function bundle(items: readonly EducationResourceItem[]): EducationResourceBundle {
  return {
    root: 'E:/fixtures/k12',
    summary: {
      generatedAt: '2026-08-21',
      sourceProject: 'fixture',
      resourceFiles: items.length,
      totalBytes: 100,
      textbookCatalogCount: items.length,
      textbookImageFiles: items.length,
      historyTextbookResources: items.length,
      geographyTextbookResources: 0,
      inventoryAlgorithm: 'sha256',
    },
    items,
    counts: {
      'textbook-asset': items.length,
      'history-map': 0,
      'standard-map': 0,
      'thematic-map': 0,
      'biology-symbol': 0,
      'circuit-symbol': 0,
      'safety-symbol': 0,
    },
  }
}

describe('resolveCourseGroundings', () => {
  it('优先采用非 AI 的真实摘录，并只保留知识点和标题都匹配的教材图候选', async () => {
    const rows: KpGroundingSourceRow[] = [
      {
        knowledgePointId: 'kp-zhang-qian',
        source: 'llm:qwen',
        evidenceSnippet: 'AI 概括：张骞出使西域。',
        confidence: 0.8,
      },
      {
        knowledgePointId: 'kp-zhang-qian',
        source: 'pep-cn',
        externalId: 'leaf-42',
        evidenceSnippet: '张骞两次出使西域，促进了汉朝与西域的了解与往来。',
        confidence: 1,
      },
    ]
    const unrelated = resource({
      id: 'asset-unrelated',
      title: '秦始皇统一六国',
      tags: ['秦始皇'],
    })
    const result = await resolveCourseGroundings(
      [{ id: 'kp-zhang-qian', canonicalName: '张骞出使西域' }],
      rows,
      { loadBundle: async () => bundle([resource(), unrelated]) },
    )

    expect(result.byKp['kp-zhang-qian']).toMatchObject({
      excerpt: '张骞两次出使西域，促进了汉朝与西域的了解与往来。',
      provenance: {
        source: 'pep-cn',
        externalId: 'leaf-42',
        evidenceStatus: 'authoritative-excerpt',
      },
    })
    expect(result.byKp['kp-zhang-qian']?.candidateResources?.map(item => item.id)).toEqual(['asset-zhang-qian'])
    expect(result.byKp['kp-zhang-qian']?.candidateResources?.[0]?.revealPolicy).toBe('explanation-only')
    expect(result.coverage).toMatchObject({
      authoritativeExcerptKps: 1,
      matchedResourceKps: 1,
      matchedResources: 1,
      resourceCatalogAvailable: true,
    })
  })

  it('没有原文时只记录目录定位；资源目录故障时仍返回可建课的来源', async () => {
    const result = await resolveCourseGroundings(
      [{ id: 'kp-only-title', canonicalName: '只有目录标题的知识点' }],
      [{
        knowledgePointId: 'kp-only-title',
        source: 'pep-cn',
        externalId: 'leaf-no-text',
        evidenceSnippet: null,
      }],
      { loadBundle: async () => { throw new Error('resource disk offline') } },
    )

    expect(result.byKp['kp-only-title']).toMatchObject({
      citation: expect.stringContaining('仅用于教材定位'),
      provenance: {
        source: 'pep-cn',
        externalId: 'leaf-no-text',
        evidenceStatus: 'curriculum-metadata',
      },
    })
    expect(result.byKp['kp-only-title']?.excerpt).toBeUndefined()
    expect(result.byKp['kp-only-title']?.candidateResources).toBeUndefined()
    expect(result.coverage).toMatchObject({
      metadataOnlyKps: 1,
      resourceCatalogAvailable: false,
    })
  })

  it('未知来源即使带摘录也保持未核验，不自动升级为 ground truth', async () => {
    const result = await resolveCourseGroundings(
      [{ id: 'kp-web', canonicalName: '网络资料知识点' }],
      [{
        knowledgePointId: 'kp-web',
        source: 'web-import',
        evidenceSnippet: '这是一段尚未核验来源权威性的摘录。',
      }],
      { loadBundle: async () => bundle([]) },
    )

    expect(result.byKp['kp-web']?.provenance?.evidenceStatus).toBe('unverified-excerpt')
    expect(result.coverage.unverifiedExcerptKps).toBe(1)
    expect(result.coverage.authoritativeExcerptKps).toBe(0)
  })
})
