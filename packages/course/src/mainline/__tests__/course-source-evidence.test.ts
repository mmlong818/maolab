import { describe, expect, it } from 'vitest'
import type { SourceMaterialRef } from '../domain.js'
import { courseSourceEvidenceView, sourceEvidenceView } from '../presentation/course-source-evidence.js'

function source(overrides: Partial<SourceMaterialRef> = {}): SourceMaterialRef {
  return {
    kind: 'textbook',
    title: '张骞出使西域',
    kpId: 'kp-zhang-qian',
    ...overrides,
  }
}

describe('course source evidence view', () => {
  it('does not present unverified or legacy excerpts as verified evidence', () => {
    expect(sourceEvidenceView(source({
      excerpt: '教材原文',
      provenance: { source: 'pep-cn', evidenceStatus: 'authoritative-excerpt' },
    })).statusLabel).toBe('已核验原文')

    expect(sourceEvidenceView(source({
      excerpt: '模型提取文字',
      provenance: { source: 'llm:qwen', evidenceStatus: 'ai-extracted' },
    }))).toMatchObject({ statusLabel: 'AI 提取待复核', tone: 'review' })

    expect(sourceEvidenceView(source({ excerpt: '旧课程摘录' }))).toMatchObject({
      statusLabel: '旧课摘录待复核',
      tone: 'legacy',
    })
  })

  it('hides historical placeholder text instead of displaying it as a source excerpt', () => {
    const item = sourceEvidenceView(source({
      excerpt: '教材知识点：张骞出使西域（待 LLM 填充教材原文或定义引用）。',
    }))

    expect(item).toMatchObject({
      statusLabel: '来源内容未补齐',
      statusNote: '旧课保存的是待补占位文字，不是教材原文。',
      tone: 'legacy',
    })
    expect(item).not.toHaveProperty('excerpt')
  })

  it('distinguishes a curriculum locator from a source excerpt', () => {
    const item = sourceEvidenceView(source({
      citation: '课程目录来源 pep-cn，节点 leaf-12',
      provenance: { source: 'pep-cn', externalId: 'leaf-12', evidenceStatus: 'curriculum-metadata' },
    }))
    expect(item).toMatchObject({
      statusLabel: '教材目录定位',
      statusNote: '已找到课程目录节点，但没有教材原文。',
      tone: 'locator',
    })
    expect(item).not.toHaveProperty('excerpt')
  })

  it('deduplicates resource candidates and exposes their safe teaching timing', () => {
    const item = sourceEvidenceView(source({
      candidateResources: [
        {
          id: 'asset-1', kind: 'textbook-asset', title: '教材图', mediaType: 'image/jpeg',
          assetUrl: '/api/v2/education-resources/file/asset-1', revealPolicy: 'explanation-only',
        },
        {
          id: 'asset-1', kind: 'textbook-asset', title: '重复教材图', mediaType: 'image/jpeg',
          assetUrl: '/api/v2/education-resources/file/asset-1',
        },
      ],
    }))

    expect(item.resources).toHaveLength(1)
    expect(item.resources[0]).toMatchObject({
      usageLabel: '讲解阶段使用',
      usageNote: '不要在观察或提问前展示，避免提前给出答案。',
    })
  })

  it('does not render candidate URLs outside the restricted education-resource endpoint', () => {
    const item = sourceEvidenceView(source({
      candidateResources: [{
        id: 'external', kind: 'textbook-asset', title: '外部图片', mediaType: 'image/jpeg',
        assetUrl: 'https://example.test/untrusted.jpg',
      }],
    }))

    expect(item.resources).toEqual([])
  })

  it('summarizes verified, locator, review, and resource coverage', () => {
    const result = courseSourceEvidenceView([
      source({ provenance: { source: 'pep-cn', evidenceStatus: 'authoritative-excerpt' }, excerpt: '原文' }),
      source({ kpId: 'kp-2', provenance: { source: 'pep-cn', evidenceStatus: 'curriculum-metadata' } }),
      source({ kpId: 'kp-3', excerpt: '旧课摘录' }),
      source({
        kpId: 'kp-4',
        provenance: { source: 'other', evidenceStatus: 'unverified-excerpt' },
        candidateResources: [{
          id: 'asset-2', kind: 'textbook-asset', title: '教材图', mediaType: 'image/png',
          assetUrl: '/api/v2/education-resources/file/asset-2',
        }],
      }),
    ])

    expect(result).toMatchObject({
      verifiedCount: 1,
      locatorCount: 1,
      reviewCount: 2,
      resourceCount: 1,
    })
  })
})
