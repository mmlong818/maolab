import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import {
  catalogPathToBundlePath,
  educationResourceAssetUrl,
  loadEducationResourceBundle,
  resolveEducationResourceFile,
  searchEducationResources,
} from '../catalog.js'

async function fixtureBundle(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'maolab-education-resources-'))
  const files: Record<string, unknown> = {
    'summary.json': {
      generatedAt: '2026-08-21T00:00:00+08:00', sourceProject: 'fixture', resourceFiles: 3,
      totalBytes: 7, textbookCatalogCount: 1, textbookImageFiles: 1,
      historyTextbookResources: 1, geographyTextbookResources: 0, inventoryAlgorithm: 'SHA-256',
    },
    'inventory.json': [
      { path: 'textbook-assets/qin.png', bytes: 3, sha256: 'fixture-textbook' },
      { path: 'maps/authorized-history-maps/qin.png', bytes: 3, sha256: 'fixture-map' },
      { path: 'symbols/librepcb-base/assets/resistor.svg', bytes: 6, sha256: 'fixture-symbol' },
    ],
    'catalogs/textbook-assets/catalog.json': { resources: [{
      id: 'textbook.qin', title: '秦朝形势图', subject: '历史', assetUrl: '/textbook-assets/qin.png',
      searchTerms: ['秦始皇', '郡县制'], knowledgePointIds: ['kp-qin'], chapterNodeIds: ['chapter-qin'],
      textbookTitle: '中国历史七年级上册', publisher: '人民教育出版社', pdfPage: 61,
      revealPolicy: 'explanation-only', sourceAttribution: '教材第61页', sourceDetailUrl: 'https://example.test/qin',
    }] },
    'maps/authorized-history-maps/manifest.json': { assets: [{
      id: 'map.qin', title: '秦朝疆域教材图', subjects: ['历史'], displayPath: '/vendor/authorized-history-maps/qin.png',
      tags: ['秦朝'], mediaType: 'image/png', citation: '教材来源',
    }] },
    'maps/mnr-standard-maps/manifest.json': { assets: [] },
    'maps/thematic-display/manifest.json': { assets: [] },
    'symbols/bioicons-open-commercial/manifest.json': { assets: [] },
    'symbols/librepcb-base/manifest.json': { assets: [{
      id: 'symbol.resistor', title: '电阻', subjects: ['物理'], assetPath: '/vendor/librepcb-base/assets/resistor.svg',
      tags: ['电路'], mediaType: 'image/svg+xml', license: 'CC0-1.0',
    }] },
    'symbols/osha-ghs/manifest.json': { assets: [] },
  }

  await Promise.all(Object.entries(files).map(async ([relativePath, document]) => {
    const path = join(root, relativePath)
    await mkdir(join(path, '..'), { recursive: true })
    await writeFile(path, JSON.stringify(document), 'utf8')
  }))
  await mkdir(join(root, 'textbook-assets'), { recursive: true })
  await mkdir(join(root, 'maps/authorized-history-maps'), { recursive: true })
  await mkdir(join(root, 'symbols/librepcb-base/assets'), { recursive: true })
  await writeFile(join(root, 'textbook-assets/qin.png'), 'png', 'utf8')
  await writeFile(join(root, 'maps/authorized-history-maps/qin.png'), 'png', 'utf8')
  await writeFile(join(root, 'symbols/librepcb-base/assets/resistor.svg'), '<svg/>', 'utf8')
  return root
}

describe('教育资源目录', () => {
  it('把原目录 URL 映射到只读资源库文件', () => {
    expect(catalogPathToBundlePath('/textbook-assets/a.png')).toBe('textbook-assets/a.png')
    expect(catalogPathToBundlePath('/vendor/mnr-standard-maps/a.jpg')).toBe('maps/mnr-standard-maps/a.jpg')
    expect(catalogPathToBundlePath('/vendor/librepcb-base/assets/a.svg')).toBe('symbols/librepcb-base/assets/a.svg')
    expect(catalogPathToBundlePath('/textbook-assets/../secret')).toBeNull()
    expect(educationResourceAssetUrl('textbook-assets/秦朝 图.png')).toBe('/api/v2/education-resources/file/textbook-assets/%E7%A7%A6%E6%9C%9D%20%E5%9B%BE.png')
  })

  it('装载教材、地图和符号，并按学科、知识点和关键词检索', async () => {
    const bundle = await loadEducationResourceBundle(await fixtureBundle())
    expect(bundle.items).toHaveLength(3)
    expect(bundle.counts).toMatchObject({ 'textbook-asset': 1, 'history-map': 1, 'circuit-symbol': 1 })
    expect(searchEducationResources(bundle, { query: '秦始皇', subject: '历史' }).map(item => item.id)).toContain('textbook.qin')
    expect(searchEducationResources(bundle, { knowledgePointId: 'kp-qin' })).toHaveLength(1)
    expect(searchEducationResources(bundle, { query: '电阻', kind: 'circuit-symbol' })[0]?.assetUrl).toContain('/api/v2/education-resources/file/')
  })

  it('文件访问只能停留在教材、地图和符号目录内', async () => {
    const root = await fixtureBundle()
    const resource = await resolveEducationResourceFile(root, 'textbook-assets/qin.png')
    expect(resource.size).toBe(3)
    await expect(resolveEducationResourceFile(root, 'textbook-assets/../summary.json')).rejects.toThrow('资源路径无效')
    await expect(resolveEducationResourceFile(root, 'summary.json')).rejects.toThrow('允许目录')
  })
})
