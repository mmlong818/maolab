import type { K12Stage, TextbookEntry, TextbookIndex } from './types.js'

const DATA_VERSION_URLS = {
  tch_material:
    'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json',
  /** national_lesson 体系: 章节树 + 国家课资源(教学设计/课件/视频)可拉 */
  national_lesson:
    'https://s-file-2.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/version/data_version.json',
} as const

export type SyncSource = keyof typeof DATA_VERSION_URLS

/** 国家平台返回的原始 entry 局部结构 (只声明用到的) */
interface RawEntry {
  id: string
  global_title?: { 'zh-CN'?: string }
  title?: string
  tag_list?: Array<{ tag_name?: string; tag_dimension_id?: string }>
  provider_list?: Array<{ name?: string }>
  custom_properties?: { preview?: Record<string, string> }
  online_time?: string
  status?: string
}

interface DataVersion {
  module_version: number
  urls: string  // 逗号分隔的多个 part_*.json URL
}

/**
 * 版本白名单。收人教社与统编本,不收地方版(北师大/苏教/沪教/鄂教/湘教)。
 *
 * `人教A版` 是 2026-07-28 补的,补它的原因值得留一笔:**高中数学此前整个学段
 * 零入库**,而其余 12 个科目都有高中。查下来不是抽取环节的问题——上游本来就有
 * (tch_material 38 条、national_lesson 41 条),但高中数学的版本标签是
 * `人教A版`,不是 `人教版`,被这个白名单一刀切掉了。一个为了挡地方版而设的
 * 过滤器,顺手把一整个学段的主科挡在了门外,而且**没有任何日志**。
 *
 * 只收 A 版不收 B 版(其标签为 `人教版（B版）（主编：高存明）`):A 版是多数省份
 * 主用本,两版讲同一批知识点,一起入库会在 KP 索引里造出成对的重复概念。
 * 若日后要支持 B 版,应先想清楚同一概念的双来源如何归并到一个 cluster。
 */
const ALLOWED_VERSIONS = new Set(['统编版', '人教版', '人教A版'])
const STAGE_TAGS: Record<string, K12Stage> = { 小学: '小学', 初中: '初中', 高中: '高中' }

interface ExtractedTags {
  isTeachingMaterial: boolean
  stage: K12Stage | undefined
  subject: string | undefined
  version: string | undefined
  grade: string | undefined
  volume: string | undefined
}

function extractTags(raw: RawEntry): ExtractedTags {
  const out: ExtractedTags = {
    isTeachingMaterial: false,
    stage: undefined,
    subject: undefined,
    version: undefined,
    grade: undefined,
    volume: undefined,
  }
  for (const t of raw.tag_list ?? []) {
    const name = t.tag_name ?? ''
    const dim = t.tag_dimension_id ?? ''
    if (name === '教材' && dim === 'tagView') out.isTeachingMaterial = true
    if (dim === 'zxxxd' && name in STAGE_TAGS) out.stage = STAGE_TAGS[name]
    else if (name in STAGE_TAGS && !out.stage) out.stage = STAGE_TAGS[name]
    if (dim === 'zxxbb') out.version = name
    if (dim === 'zxxcc') out.volume = name
    if (dim === 'zxxnj') out.grade = name
    if (dim === 'zxxxk') out.subject = name
  }
  return out
}

/** 被版本白名单挡掉的教材,按「版本 · 学段/学科」计数,供 sync 打印。见 ALLOWED_VERSIONS 注释。 */
export type VersionRejections = Map<string, number>

function normalizeEntry(
  raw: RawEntry,
  now: number,
  source: SyncSource,
  rejected?: VersionRejections,
): TextbookEntry | null {
  if (raw.status && raw.status !== 'ONLINE') return null
  const tags = extractTags(raw)
  // tch_material 体系才严格要求 isTeachingMaterial; national_lesson 直接是教材层级,无此 tag
  if (source === 'tch_material' && !tags.isTeachingMaterial) return null
  if (!tags.stage || !tags.subject || !tags.version) return null
  if (!ALLOWED_VERSIONS.has(tags.version)) {
    // 记下来而不是静默丢弃:高中数学正是这样丢了整整一个学段而无人察觉
    if (rejected) {
      const key = `${tags.version} · ${tags.stage}/${tags.subject}`
      rejected.set(key, (rejected.get(key) ?? 0) + 1)
    }
    return null
  }
  const publisher = raw.provider_list?.[0]?.name ?? ''
  // tch_material 严格只收人教社; national_lesson 不带 publisher,放过
  if (source === 'tch_material' && publisher !== '人民教育出版社') return null
  const title = raw.global_title?.['zh-CN'] ?? raw.title ?? ''
  if (!title) return null
  const entry: TextbookEntry = {
    id: raw.id,
    title,
    stage: tags.stage,
    subject: tags.subject,
    version: tags.version,
    grade: tags.grade ?? '',
    volume: tags.volume ?? '',
    publisher: publisher || tags.version, // national_lesson 无 publisher,退化为 version 标识
    previewUrls: raw.custom_properties?.preview ?? {},
    syncedAt: now,
  }
  if (raw.online_time) entry.onlineAt = raw.online_time
  return entry
}

/** syncIndex 的返回:索引本体 + 本次被版本白名单挡掉了什么(**不落盘**,只给人看)。 */
export type SyncResult = TextbookIndex & { rejectedVersions: VersionRejections }

export async function syncIndex(
  opts: { source?: SyncSource; fetchFn?: typeof fetch } = {},
): Promise<SyncResult> {
  const source: SyncSource = opts.source ?? 'national_lesson'
  const fetchFn = opts.fetchFn ?? fetch
  const verRes = await fetchFn(DATA_VERSION_URLS[source])
  if (!verRes.ok) throw new Error(`data_version.json HTTP ${verRes.status}`)
  const verRaw = (await verRes.json()) as DataVersion
  // urls 可能是 string (逗号分隔) 也可能是 string[] (national_lesson)
  const urlsRaw: string | string[] = verRaw.urls as unknown as string | string[]
  const urls: string[] = Array.isArray(urlsRaw)
    ? urlsRaw.filter(Boolean)
    : urlsRaw.split(',').map(s => s.trim()).filter(Boolean)

  const now = Date.now()
  const entries: TextbookEntry[] = []
  const rejectedVersions: VersionRejections = new Map()
  for (const url of urls) {
    const res = await fetchFn(url)
    if (!res.ok) {
      console.warn(`[textbook-index] skip ${url}: HTTP ${res.status}`)
      continue
    }
    const part = (await res.json()) as RawEntry[]
    for (const raw of part) {
      const e = normalizeEntry(raw, now, source, rejectedVersions)
      if (e) entries.push(e)
    }
  }
  // 去重 (同 id 取最新 onlineAt)
  const byId = new Map<string, TextbookEntry>()
  for (const e of entries) {
    const prev = byId.get(e.id)
    if (!prev || (e.onlineAt ?? '') > (prev.onlineAt ?? '')) byId.set(e.id, e)
  }
  return {
    moduleVersion: verRaw.module_version,
    syncedAt: now,
    entries: Array.from(byId.values()).sort((a, b) =>
      `${a.stage}|${a.subject}|${a.grade}|${a.volume}`.localeCompare(
        `${b.stage}|${b.subject}|${b.grade}|${b.volume}`,
      ),
    ),
    rejectedVersions,
  }
}
