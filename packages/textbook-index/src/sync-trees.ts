import type { ChapterNode, NationalLesson, TextbookFullInfo, SubResource } from './tree-types.js'
import type { TextbookEntry } from './types.js'

const TREE_URL = (id: string) =>
  `https://s-file-1.ykt.cbern.com.cn/zxx/ndrv2/national_lesson/trees/${id}.json`
const RES_PARTS_URL = (id: string) =>
  `https://s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/${id}/resources/parts.json`

async function fetchJson<T>(url: string, fetchFn = fetch): Promise<T | null> {
  const res = await fetchFn(url)
  if (!res.ok) return null
  return (await res.json()) as T
}

async function fetchTree(id: string, fetchFn = fetch): Promise<ChapterNode[]> {
  const j = await fetchJson<ChapterNode[]>(TREE_URL(id), fetchFn)
  return j ?? []
}

async function fetchResources(id: string, fetchFn = fetch): Promise<NationalLesson[]> {
  const partUrls = await fetchJson<string[]>(RES_PARTS_URL(id), fetchFn)
  if (!partUrls || partUrls.length === 0) return []
  const all: NationalLesson[] = []
  for (const url of partUrls) {
    const part = await fetchJson<NationalLesson[]>(url, fetchFn)
    if (!part) continue
    for (const r of part) {
      if (r.resource_type_code === 'national_lesson') all.push(r)
    }
  }
  return all
}

/** 拉取单本教材的完整树 + 资源 */
export async function fetchTextbookFull(
  textbook: TextbookEntry,
  fetchFn = fetch,
): Promise<TextbookFullInfo> {
  const [chapterTree, nationalLessons] = await Promise.all([
    fetchTree(textbook.id, fetchFn),
    fetchResources(textbook.id, fetchFn),
  ])
  return {
    textbookId: textbook.id,
    textbookTitle: textbook.title,
    syncedAt: Date.now(),
    chapterTree,
    nationalLessons,
  }
}

/** 并发拉取多本教材 */
export async function fetchAllTextbooks(
  textbooks: TextbookEntry[],
  opts: {
    concurrency?: number
    onProgress?: (done: number, total: number, current: string) => void
    fetchFn?: typeof fetch
  } = {},
): Promise<TextbookFullInfo[]> {
  const concurrency = opts.concurrency ?? 8
  const fetchFn = opts.fetchFn ?? fetch
  const results: TextbookFullInfo[] = []
  let done = 0
  const queue = [...textbooks]
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const tb = queue.shift()!
      try {
        const info = await fetchTextbookFull(tb, fetchFn)
        results.push(info)
      } catch (err) {
        console.warn(`[trees] ${tb.id} (${tb.title.slice(0, 30)}) failed:`, err)
      } finally {
        done++
        opts.onProgress?.(done, textbooks.length, tb.title.slice(0, 40))
      }
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 把嵌套树拍平为 "章 -> 节" 列表 (用于 UI 单元下拉)
 *
 * isLeaf = true 表示该节点没有子节点,可作为最小教学单元
 */
export function flattenChapters(
  tree: ChapterNode[],
): Array<{ id: string; title: string; depth: number; nodePath: string; isLeaf: boolean }> {
  const out: Array<{ id: string; title: string; depth: number; nodePath: string; isLeaf: boolean }> = []
  function walk(nodes: ChapterNode[], depth: number, parentPath: string) {
    for (const n of nodes) {
      const nodePath = parentPath ? `${parentPath}/${n.id}` : n.id
      const kids = n.child_nodes ?? []
      out.push({ id: n.id, title: n.title, depth, nodePath, isLeaf: kids.length === 0 })
      if (kids.length > 0) {
        walk(kids, depth + 1, nodePath)
      }
    }
  }
  walk(tree, 0, '')
  return out
}

/** 按 chapterId 索引 nationalLessons */
export function indexLessonsByChapter(
  lessons: NationalLesson[],
): Map<string, NationalLesson[]> {
  const map = new Map<string, NationalLesson[]>()
  for (const l of lessons) {
    for (const cid of l.chapter_ids ?? []) {
      const arr = map.get(cid) ?? []
      arr.push(l)
      map.set(cid, arr)
    }
  }
  return map
}

/** 从 nationalLesson.relations 提取特定子资源类型 */
export function pickSubResource(
  lesson: NationalLesson,
  type: SubResource['resource_type_code'],
): SubResource | undefined {
  return lesson.relations?.national_course_resource?.find(r => r.resource_type_code === type)
}

/**
 * 获取指定章节的所有国家课
 *
 * chapter_paths 是父路径(如 "ch1/sec1.2"),所以子节点匹配父节点时也算
 * 即用户选 "第 8 章" → 返回 8.1 / 8.2 / 8.3 所有课
 * 用户选 "8.2 二力平衡" → 只返回 8.2 的课
 */
export function getLessonsForChapter(
  allLessons: NationalLesson[],
  chapterId: string,
): NationalLesson[] {
  return allLessons.filter(l => {
    // 直接关联
    if ((l.chapter_ids ?? []).includes(chapterId)) return true
    // 或路径包含
    return (l.chapter_paths ?? []).some(p => p.split('/').includes(chapterId))
  })
}
