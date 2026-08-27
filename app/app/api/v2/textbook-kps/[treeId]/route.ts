/**
 * GET /api/v2/textbook-kps/[treeId]
 *
 * 输出该教材的章节-叶子-KP 三层树, 供"多 KP 建课"入口使用.
 *
 * 数据源:
 *   - 章节树/标题  ← packages/textbook-index/data/textbook-trees/{treeId}.json (TextbookFullInfo)
 *   - KP 关联    ← knowledge_points + chapter_node_knowledge_points (sqlite)
 *
 * 没有 KP 的叶子也输出, kps 为 []. 章节顺序按教材原始顺序 (flattenChapters DFS).
 */
import { type NextRequest, NextResponse } from 'next/server'
import path from 'node:path'
import { loadFullInfo, flattenChapters } from '@maolab/textbook-index'
import { openSqliteRaw } from '@maolab/db'

const TREES_DIR = path.resolve(process.cwd(), '../packages/textbook-index/data/textbook-trees')

interface KpRow {
  id: string
  canonical_name: string
  subject: string
  chapter_node_id: string
  position: number
}

let _db: ReturnType<typeof openSqliteRaw> | null = null
function getDb() {
  if (_db) return _db
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  _db = openSqliteRaw(url.replace(/^file:/, ''))
  return _db
}

interface KpOut {
  kpId: string
  canonicalName: string
  subject: string
}
interface LeafOut {
  leafId: string
  leafTitle: string
  kps: KpOut[]
}
interface ChapterOut {
  chapterId: string
  chapterTitle: string
  leaves: LeafOut[]
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ treeId: string }> }) {
  const { treeId } = await ctx.params
  const info = await loadFullInfo(treeId, TREES_DIR)
  if (!info) {
    return NextResponse.json({ error: 'textbook not found in trees cache' }, { status: 404 })
  }

  // 一次查出本教材所有叶子的 KP 关联
  const flat = flattenChapters(info.chapterTree)
  const allNodeIds = flat.map(n => n.id)
  const kpsByNode = new Map<string, KpOut[]>()
  if (allNodeIds.length > 0) {
    const db = getDb()
    const placeholders = allNodeIds.map(() => '?').join(',')
    const rows = db
      .prepare(
        `SELECT kp.id, kp.canonical_name, kp.subject,
                cnkp.chapter_node_id, cnkp.position
           FROM chapter_node_knowledge_points cnkp
           JOIN knowledge_points kp ON kp.id = cnkp.knowledge_point_id
          WHERE cnkp.chapter_node_id IN (${placeholders})
          ORDER BY cnkp.chapter_node_id, cnkp.position`,
      )
      .all(...allNodeIds) as KpRow[]
    for (const r of rows) {
      const arr = kpsByNode.get(r.chapter_node_id) ?? []
      arr.push({ kpId: r.id, canonicalName: r.canonical_name, subject: r.subject })
      kpsByNode.set(r.chapter_node_id, arr)
    }
  }

  // 把 flat 列表按"最近的非叶子父节点"组装成 chapters -> leaves
  // 教材结构通常深度 2 (单元 -> 课) 或 3+ (单元 -> 章 -> 节). 这里把所有叶子节点列出来,
  // 用它在 flat 里的前一个 depth 较低节点作为 chapter. 如果整个教材没有非叶子,
  // 退化为一个虚拟 chapter "全部".
  const chapters: ChapterOut[] = []
  let currentChapter: ChapterOut | null = null
  for (const node of flat) {
    if (!node.isLeaf) {
      // 仅当深度 = 0 (顶层单元) 时开新 chapter; 中间层视作章节标题的一部分忽略, 叶子归到上一个 chapter
      if (node.depth === 0) {
        currentChapter = {
          chapterId: node.id,
          chapterTitle: node.title,
          leaves: [],
        }
        chapters.push(currentChapter)
      }
      continue
    }
    // leaf
    if (!currentChapter) {
      currentChapter = { chapterId: 'root', chapterTitle: '全部', leaves: [] }
      chapters.push(currentChapter)
    }
    currentChapter.leaves.push({
      leafId: node.id,
      leafTitle: node.title,
      kps: kpsByNode.get(node.id) ?? [],
    })
  }

  // 丢弃没有任何叶子的 chapter (比如顶层节点直接挂下一级单元的情况)
  const nonEmpty = chapters.filter(c => c.leaves.length > 0)

  return NextResponse.json({
    treeId: info.textbookId,
    treeName: info.textbookTitle,
    chapters: nonEmpty,
  })
}
