/**
 * textbook-body-source — 教材正文(tch_material)本体源
 *
 * national_lesson 源给的是章节树 + 课时资源(教学设计/课件),没有教材正文。
 * 教材正文在 tch_material 源:每本教材 custom_properties.preview = { Slide1..SlideN }
 * 是整本逐页 JPG 页图(公网可达)。本模块把 tch_material 拉成
 * "匹配键 -> 最新版本教材本体" 的索引,供 KP 抽取按 national_lesson 树匹配到正文。
 *
 * 匹配键: stage|subject|version|grade|volume  (与 national_lesson 索引同口径)
 * 多版本去重: 同键取 online_time 最新的一本 (教材按最新版本选)
 */

const TCH_VERSION_URL =
  'https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json'

const STAGE_NAMES = new Set(['小学', '初中', '高中'])

interface RawTag {
  tag_name?: string
  tag_dimension_id?: string
}

interface RawTchEntry {
  id: string
  global_title?: { 'zh-CN'?: string }
  title?: string
  status?: string
  online_time?: string
  update_time?: string
  create_time?: string
  tag_list?: RawTag[]
  custom_properties?: { preview?: Record<string, string> }
}

interface DataVersion {
  module_version: number
  urls: string | string[]
}

/** 单本教材本体: 整本逐页页图 + 元信息 */
export interface TextbookBodySource {
  /** 匹配键 stage|subject|version|grade|volume */
  matchKey: string
  /** tch_material 资源 id */
  textbookId: string
  title: string
  /** 上线时间, 用于同键多版本择新 */
  onlineAt: string
  /**
   * preview 给出的逐页 JPG URL(已按页序排序)。
   * 注意: preview 通常被截断到前 ~49 页,不是全本。
   * 取全本请用 imageBase 经 resolveBodyPages 探测真实页数。
   */
  pages: string[]
  /** 逐页页图基址(去掉 /{n}.jpg),供 resolveBodyPages 枚举全本 */
  imageBase: string
}

interface TchTags {
  stage?: string
  subject?: string
  version?: string
  grade?: string
  volume?: string
}

function extractTchTags(raw: RawTchEntry): TchTags {
  const out: TchTags = {}
  for (const t of raw.tag_list ?? []) {
    const name = t.tag_name ?? ''
    const dim = t.tag_dimension_id ?? ''
    if (dim === 'zxxxd' && STAGE_NAMES.has(name)) out.stage = name
    else if (STAGE_NAMES.has(name) && !out.stage) out.stage = name
    if (dim === 'zxxbb') out.version = name
    if (dim === 'zxxcc') out.volume = name
    if (dim === 'zxxnj') out.grade = name
    if (dim === 'zxxxk') out.subject = name
  }
  return out
}

function parseSlideNo(key: string): number {
  const m = /Slide(\d+)/i.exec(key)
  return m ? parseInt(m[1]!, 10) : -1
}

function sortedPages(preview: Record<string, string>): string[] {
  return Object.entries(preview)
    .map(([k, url]) => ({ no: parseSlideNo(k), url }))
    .filter(p => p.no > 0 && typeof p.url === 'string' && p.url.startsWith('http'))
    .sort((a, b) => a.no - b.no)
    .map(p => p.url)
}

/** 从任一页图 URL 去掉 /{n}.jpg 推导逐页基址 */
function deriveImageBase(pageUrl: string): string {
  return pageUrl.replace(/\/\d+\.(jpg|jpeg|png)$/i, '')
}

/** 同键多版本择新: online_time > update_time > create_time */
function entryTime(raw: RawTchEntry): string {
  return raw.online_time ?? raw.update_time ?? raw.create_time ?? ''
}

function buildMatchKey(t: TchTags): string | null {
  if (!t.stage || !t.subject || !t.version || !t.grade || !t.volume) return null
  return `${t.stage}|${t.subject}|${t.version}|${t.grade}|${t.volume}`
}

/**
 * 拉取 tch_material 全量, 归一成 "匹配键 -> 最新版本教材本体" 索引。
 * 只收有页图的条目; 同匹配键保留 online_time 最新者。
 */
export async function syncTextbookBodyIndex(
  opts: { fetchFn?: typeof fetch; onProgress?: (done: number, total: number) => void } = {},
): Promise<Record<string, TextbookBodySource>> {
  const fetchFn = opts.fetchFn ?? fetch
  const verRes = await fetchFn(TCH_VERSION_URL)
  if (!verRes.ok) throw new Error(`tch_material data_version HTTP ${verRes.status}`)
  const ver = (await verRes.json()) as DataVersion
  const urls: string[] = Array.isArray(ver.urls)
    ? ver.urls.filter(Boolean)
    : ver.urls.split(',').map(s => s.trim()).filter(Boolean)

  const byKey = new Map<string, TextbookBodySource>()
  let done = 0
  for (const url of urls) {
    const res = await fetchFn(url)
    if (!res.ok) {
      console.warn(`[textbook-body] skip ${url}: HTTP ${res.status}`)
      done++
      opts.onProgress?.(done, urls.length)
      continue
    }
    const part = (await res.json()) as RawTchEntry[]
    for (const raw of part) {
      if (raw.status && raw.status !== 'ONLINE') continue
      const pages = sortedPages(raw.custom_properties?.preview ?? {})
      if (pages.length === 0) continue
      const key = buildMatchKey(extractTchTags(raw))
      if (!key) continue
      const candidate: TextbookBodySource = {
        matchKey: key,
        textbookId: raw.id,
        title: raw.global_title?.['zh-CN'] ?? raw.title ?? '',
        onlineAt: entryTime(raw),
        pages,
        imageBase: deriveImageBase(pages[0]!),
      }
      const prev = byKey.get(key)
      if (!prev || candidate.onlineAt > prev.onlineAt) byKey.set(key, candidate)
    }
    done++
    opts.onProgress?.(done, urls.length)
  }
  return Object.fromEntries(byKey)
}
