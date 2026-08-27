import { existsSync } from 'node:fs'
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'

export const DEFAULT_EDUCATION_RESOURCE_BUNDLE = 'maolab-k12-2026-08-21'

export type EducationResourceKind =
  | 'textbook-asset'
  | 'history-map'
  | 'standard-map'
  | 'thematic-map'
  | 'biology-symbol'
  | 'circuit-symbol'
  | 'safety-symbol'

export interface EducationResourceItem {
  id: string
  kind: EducationResourceKind
  title: string
  subjects: string[]
  categories: string[]
  tags: string[]
  catalogPath: string
  filePath: string
  assetUrl: string
  mediaType: string
  sourceUrl?: string
  sourceAttribution?: string
  license?: string
  auditNumber?: string
  temporalCoverage?: string
  spatialResolution?: string
  textbookTitle?: string
  publisher?: string
  pdfPage?: number
  knowledgePointIds: string[]
  chapterNodeIds: string[]
  revealPolicy?: string
}

export interface EducationResourceSummary {
  generatedAt: string
  sourceProject: string
  resourceFiles: number
  totalBytes: number
  textbookCatalogCount: number
  textbookImageFiles: number
  historyTextbookResources: number
  geographyTextbookResources: number
  inventoryAlgorithm: string
}

export interface EducationResourceBundle {
  root: string
  summary: EducationResourceSummary
  items: readonly EducationResourceItem[]
  counts: Readonly<Record<EducationResourceKind, number>>
}

export interface EducationResourceSearchOptions {
  query?: string
  subject?: string
  kind?: EducationResourceKind
  knowledgePointId?: string
  chapterNodeId?: string
  limit?: number
}

type JsonObject = Record<string, unknown>
interface InventoryEntry { path: string; bytes: number; sha256: string }

const MANIFESTS: ReadonlyArray<{ path: string; kind: EducationResourceKind }> = [
  { path: 'maps/authorized-history-maps/manifest.json', kind: 'history-map' },
  { path: 'maps/mnr-standard-maps/manifest.json', kind: 'standard-map' },
  { path: 'maps/thematic-display/manifest.json', kind: 'thematic-map' },
  { path: 'symbols/bioicons-open-commercial/manifest.json', kind: 'biology-symbol' },
  { path: 'symbols/librepcb-base/manifest.json', kind: 'circuit-symbol' },
  { path: 'symbols/osha-ghs/manifest.json', kind: 'safety-symbol' },
]

const CATALOG_PATH_MAPPINGS: ReadonlyArray<readonly [string, string]> = [
  ['/textbook-assets/', 'textbook-assets/'],
  ['/vendor/authorized-history-maps/', 'maps/authorized-history-maps/'],
  ['/vendor/mnr-standard-maps/', 'maps/mnr-standard-maps/'],
  ['/vendor/licensed-thematic-maps/', 'maps/thematic-display/'],
  ['/vendor/bioicons/open-commercial/', 'symbols/bioicons-open-commercial/'],
  ['/vendor/librepcb-base/', 'symbols/librepcb-base/'],
  ['/vendor/osha-ghs/', 'symbols/osha-ghs/'],
]

const ALLOWED_FILE_ROOTS = ['textbook-assets', 'maps', 'symbols'] as const
const cache = new Map<string, Promise<EducationResourceBundle>>()

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap(item => stringValue(item) ? [stringValue(item)!] : [])
    : stringValue(value) ? [stringValue(value)!] : []
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function requiredString(record: JsonObject, key: string, source: string): string {
  const value = stringValue(record[key])
  if (!value) throw new Error(`${source} 缺少 ${key}`)
  return value
}

function mediaTypeFor(path: string, declared?: unknown): string {
  const explicit = stringValue(declared)
  if (explicit) return explicit
  switch (extname(path).toLowerCase()) {
    case '.png': return 'image/png'
    case '.jpg':
    case '.jpeg': return 'image/jpeg'
    case '.svg': return 'image/svg+xml'
    case '.json': return 'application/json'
    case '.geojson': return 'application/geo+json'
    case '.pdf': return 'application/pdf'
    case '.txt': return 'text/plain; charset=utf-8'
    default: return 'application/octet-stream'
  }
}

export function catalogPathToBundlePath(catalogPath: string): string | null {
  const normalized = catalogPath.replaceAll('\\', '/')
  for (const [prefix, replacement] of CATALOG_PATH_MAPPINGS) {
    if (!normalized.startsWith(prefix)) continue
    const suffix = normalized.slice(prefix.length)
    if (!suffix || suffix.split('/').some(part => !part || part === '.' || part === '..')) return null
    return `${replacement}${suffix}`
  }
  return null
}

export function educationResourceAssetUrl(filePath: string): string {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/')
  return `/api/v2/education-resources/file/${encoded}`
}

function toCatalogItem(record: JsonObject, kind: EducationResourceKind, source: string): EducationResourceItem {
  const catalogPath = stringValue(record.assetUrl)
    ?? stringValue(record.assetPath)
    ?? stringValue(record.displayPath)
  if (!catalogPath) throw new Error(`${source} 缺少可显示资源路径`)
  const filePath = catalogPathToBundlePath(catalogPath)
  if (!filePath) throw new Error(`${source} 的资源路径不在允许目录内: ${catalogPath}`)

  return {
    id: requiredString(record, 'id', source),
    kind,
    title: requiredString(record, 'title', source),
    subjects: stringList(record.subjects ?? record.subject),
    categories: stringList(record.categories),
    tags: [...stringList(record.tags), ...stringList(record.searchTerms)],
    catalogPath,
    filePath,
    assetUrl: educationResourceAssetUrl(filePath),
    mediaType: mediaTypeFor(filePath, record.mediaType),
    ...(stringValue(record.sourceUrl ?? record.sourceDetailUrl) ? { sourceUrl: stringValue(record.sourceUrl ?? record.sourceDetailUrl)! } : {}),
    ...(stringValue(record.sourceAttribution ?? record.citation) ? { sourceAttribution: stringValue(record.sourceAttribution ?? record.citation)! } : {}),
    ...(stringValue(record.license) ? { license: stringValue(record.license)! } : {}),
    ...(stringValue(record.auditNumber) ? { auditNumber: stringValue(record.auditNumber)! } : {}),
    ...(stringValue(record.temporalCoverage ?? record.temporalNote) ? { temporalCoverage: stringValue(record.temporalCoverage ?? record.temporalNote)! } : {}),
    ...(stringValue(record.spatialResolution) ? { spatialResolution: stringValue(record.spatialResolution)! } : {}),
    ...(stringValue(record.textbookTitle) ? { textbookTitle: stringValue(record.textbookTitle)! } : {}),
    ...(stringValue(record.publisher) ? { publisher: stringValue(record.publisher)! } : {}),
    ...(numberValue(record.pdfPage) !== undefined ? { pdfPage: numberValue(record.pdfPage)! } : {}),
    knowledgePointIds: stringList(record.knowledgePointIds),
    chapterNodeIds: stringList(record.chapterNodeIds),
    ...(stringValue(record.revealPolicy) ? { revealPolicy: stringValue(record.revealPolicy)! } : {}),
  }
}

async function readJson(path: string): Promise<JsonObject> {
  return JSON.parse(await readFile(path, 'utf8')) as JsonObject
}

async function readInventory(path: string): Promise<InventoryEntry[]> {
  const document = JSON.parse(await readFile(path, 'utf8')) as unknown
  if (!Array.isArray(document)) throw new Error('inventory.json 必须是数组')
  return document.map((entry, index) => {
    if (!entry || typeof entry !== 'object') throw new Error(`inventory.json 第 ${index + 1} 项无效`)
    const record = entry as JsonObject
    const inventoryPath = requiredString(record, 'path', `inventory.json 第 ${index + 1} 项`).replaceAll('\\', '/')
    const bytes = numberValue(record.bytes)
    const sha256 = stringValue(record.sha256)
    if (bytes === undefined || !sha256) throw new Error(`inventory.json 第 ${index + 1} 项缺少大小或摘要`)
    return { path: inventoryPath, bytes, sha256 }
  })
}

function recordsFrom(document: JsonObject, source: string): JsonObject[] {
  const records = document.resources ?? document.assets
  if (!Array.isArray(records)) throw new Error(`${source} 缺少 resources/assets 数组`)
  return records as JsonObject[]
}

function resolveConfiguredRoot(cwd = process.cwd(), configured = process.env.MAOLAB_EDUCATION_RESOURCES_ROOT): string {
  const candidates = [
    configured,
    resolve(cwd, '../../../education-resources', DEFAULT_EDUCATION_RESOURCE_BUNDLE),
    resolve(cwd, '../../education-resources', DEFAULT_EDUCATION_RESOURCE_BUNDLE),
    resolve(cwd, '../education-resources', DEFAULT_EDUCATION_RESOURCE_BUNDLE),
  ].flatMap(value => stringValue(value) ? [resolve(value!)] : [])

  const found = candidates.find(candidate => existsSync(resolve(candidate, 'summary.json')))
  if (!found) {
    throw new Error('未找到教育资源库。请设置 MAOLAB_EDUCATION_RESOURCES_ROOT。')
  }
  return found
}

export function findEducationResourceRoot(): string {
  return resolveConfiguredRoot()
}

export async function loadEducationResourceBundle(root = findEducationResourceRoot()): Promise<EducationResourceBundle> {
  const normalizedRoot = resolve(root)
  const cached = cache.get(normalizedRoot)
  if (cached) return cached

  const loading = (async () => {
    const [summaryDocument, textbookDocument, inventory, ...manifestDocuments] = await Promise.all([
      readJson(resolve(normalizedRoot, 'summary.json')),
      readJson(resolve(normalizedRoot, 'catalogs/textbook-assets/catalog.json')),
      readInventory(resolve(normalizedRoot, 'inventory.json')),
      ...MANIFESTS.map(manifest => readJson(resolve(normalizedRoot, manifest.path))),
    ])

    const textbookRecords = recordsFrom(textbookDocument, '教材资源目录')
    const items = textbookRecords.map((record, index) => toCatalogItem(record, 'textbook-asset', `教材资源目录第 ${index + 1} 项`))
    MANIFESTS.forEach((manifest, manifestIndex) => {
      recordsFrom(manifestDocuments[manifestIndex]!, manifest.path).forEach((record, index) => {
        items.push(toCatalogItem(record, manifest.kind, `${manifest.path} 第 ${index + 1} 项`))
      })
    })

    const ids = new Set<string>()
    for (const item of items) {
      if (ids.has(item.id)) throw new Error(`教育资源编号重复: ${item.id}`)
      ids.add(item.id)
    }

    const summary = summaryDocument as unknown as EducationResourceSummary
    if (summary.textbookCatalogCount !== textbookRecords.length) {
      throw new Error(`教材资源目录数量不一致: summary=${summary.textbookCatalogCount}, catalog=${textbookRecords.length}`)
    }
    if (summary.resourceFiles !== inventory.length) {
      throw new Error(`资源清单数量不一致: summary=${summary.resourceFiles}, inventory=${inventory.length}`)
    }
    const inventoryPaths = new Set(inventory.map(entry => entry.path))
    const missingFiles = items.filter(item => !inventoryPaths.has(item.filePath))
    if (missingFiles.length > 0) {
      throw new Error(`有 ${missingFiles.length} 项目录资源未进入校验清单，首项: ${missingFiles[0]!.filePath}`)
    }

    const counts = Object.fromEntries(
      (['textbook-asset', 'history-map', 'standard-map', 'thematic-map', 'biology-symbol', 'circuit-symbol', 'safety-symbol'] as const)
        .map(kind => [kind, items.filter(item => item.kind === kind).length]),
    ) as Record<EducationResourceKind, number>

    return { root: normalizedRoot, summary, items, counts }
  })()

  cache.set(normalizedRoot, loading)
  try {
    return await loading
  } catch (error) {
    cache.delete(normalizedRoot)
    throw error
  }
}

function normalizedSearchText(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase('zh-CN').replace(/[\s\p{P}\p{S}]+/gu, '')
}

function bigrams(value: string): string[] {
  if (value.length < 2) return value ? [value] : []
  return Array.from({ length: value.length - 1 }, (_, index) => value.slice(index, index + 2))
}

function relevance(item: EducationResourceItem, query: string): number {
  if (!query) return 1
  const title = normalizedSearchText(item.title)
  const haystack = normalizedSearchText([
    item.id,
    item.title,
    ...item.subjects,
    ...item.categories,
    ...item.tags,
    item.auditNumber ?? '',
    item.textbookTitle ?? '',
  ].join(' '))
  if (!haystack) return 0
  if (item.id === query) return 1_000
  if (title === query) return 600
  if (title.includes(query)) return 300
  if (haystack.includes(query)) return 180

  const queryBigrams = bigrams(query)
  const overlap = queryBigrams.filter(gram => haystack.includes(gram)).length
  return overlap >= Math.max(1, Math.ceil(queryBigrams.length * 0.5)) ? overlap * 4 : 0
}

export function searchEducationResources(
  bundle: EducationResourceBundle,
  options: EducationResourceSearchOptions = {},
): readonly EducationResourceItem[] {
  const query = normalizedSearchText(options.query ?? '')
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 50), 1), 200)

  return bundle.items
    .flatMap(item => {
      if (options.kind && item.kind !== options.kind) return []
      if (options.subject && !item.subjects.includes(options.subject)) return []
      if (options.knowledgePointId && !item.knowledgePointIds.includes(options.knowledgePointId)) return []
      if (options.chapterNodeId && !item.chapterNodeIds.includes(options.chapterNodeId)) return []
      const score = relevance(item, query)
      return score > 0 ? [{ item, score }] : []
    })
    .sort((left, right) => right.score - left.score || left.item.title.localeCompare(right.item.title, 'zh-CN'))
    .slice(0, limit)
    .map(result => result.item)
}

export function educationResourceFor(bundle: EducationResourceBundle, id: string): EducationResourceItem | undefined {
  return bundle.items.find(item => item.id === id)
}

export async function resolveEducationResourceFile(root: string, filePath: string): Promise<{ path: string; size: number }> {
  const normalized = filePath.replaceAll('\\', '/').replace(/^\/+/, '')
  const [topLevel] = normalized.split('/')
  if (!ALLOWED_FILE_ROOTS.includes(topLevel as (typeof ALLOWED_FILE_ROOTS)[number])) {
    throw new Error('资源路径不在允许目录内。')
  }
  if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('资源路径无效。')
  }

  const realRoot = await realpath(resolve(root))
  const candidate = resolve(realRoot, normalized)
  if (candidate === realRoot || !candidate.startsWith(`${realRoot}${sep}`)) {
    throw new Error('资源路径越界。')
  }
  const realFile = await realpath(candidate)
  if (!realFile.startsWith(`${realRoot}${sep}`)) throw new Error('资源链接越界。')
  const info = await stat(realFile)
  if (!info.isFile()) throw new Error('资源不是文件。')
  return { path: realFile, size: info.size }
}

export function clearEducationResourceCache(): void {
  cache.clear()
}
