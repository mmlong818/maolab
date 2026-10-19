/**
 * KP → 来源教材（年级/册次/章节路径）映射，供 export-kp-dataset*.ts 共用
 *
 * knowledge_points 表只有学段（grade_band），年级要经过：
 *   chapter_node_knowledge_points → textbook-trees/<textbookId>.json → textbook-index.json
 * 一个 KP 可能挂在多本教材（新旧版本并存），所以是数组。
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { openSqliteRaw } from '@maolab/db'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = resolve(__dirname, '..', 'data')

export interface KpTextbookSource {
  textbook_id: string
  textbook_title: string
  grade: string
  volume: string
  chapter_path: string[]
}

type ChapterNode = { id: string; title: string; child_nodes?: ChapterNode[] }
type NodeRef = { textbookId: string; path: string[] }

function indexTreeNodes(): Map<string, NodeRef> {
  const nodes = new Map<string, NodeRef>()
  const treesDir = resolve(DATA_DIR, 'textbook-trees')
  const walk = (list: ChapterNode[], textbookId: string, ancestors: string[]): void => {
    for (const n of list) {
      const path = [...ancestors, n.title]
      nodes.set(n.id, { textbookId, path })
      walk(n.child_nodes ?? [], textbookId, path)
    }
  }
  for (const f of readdirSync(treesDir).filter(f => f.endsWith('.json'))) {
    const tree = JSON.parse(readFileSync(resolve(treesDir, f), 'utf-8'))
    if (Array.isArray(tree) || !tree.chapterTree) continue
    walk(tree.chapterTree, tree.textbookId, [])
  }
  return nodes
}

export function loadKpTextbookSources(db: ReturnType<typeof openSqliteRaw>): Map<string, KpTextbookSource[]> {
  const indexPath = resolve(DATA_DIR, 'textbook-index.json')
  if (!existsSync(indexPath)) throw new Error(`缺少教材索引: ${indexPath}`)
  const entries = new Map<string, { title: string; grade: string; volume: string }>(
    JSON.parse(readFileSync(indexPath, 'utf-8')).entries.map((e: any) => [e.id, e]),
  )
  const nodes = indexTreeNodes()

  const links = db.prepare(`
    SELECT cn.knowledge_point_id AS kp_id, cn.chapter_node_id AS node_id
    FROM chapter_node_knowledge_points cn
    JOIN knowledge_points k ON k.id = cn.knowledge_point_id
    WHERE k.curriculum_system = 'pep-cn'
  `).all() as { kp_id: string; node_id: string }[]

  const out = new Map<string, KpTextbookSource[]>()
  const unresolved: string[] = []
  for (const { kp_id, node_id } of links) {
    const node = nodes.get(node_id)
    const tb = node && entries.get(node.textbookId)
    if (!node || !tb) { unresolved.push(node_id); continue }
    const list = out.get(kp_id) ?? []
    list.push({
      textbook_id: node.textbookId,
      textbook_title: tb.title,
      grade: tb.grade ?? '',
      volume: tb.volume ?? '',
      chapter_path: node.path,
    })
    out.set(kp_id, list)
  }
  if (unresolved.length > 0) {
    throw new Error(`${unresolved.length} 条章节关联无法解析到教材，例: ${unresolved.slice(0, 3).join(', ')}`)
  }
  for (const list of out.values()) {
    list.sort((a, b) => a.textbook_title.localeCompare(b.textbook_title, 'zh') ||
      a.chapter_path.join('/').localeCompare(b.chapter_path.join('/'), 'zh'))
  }
  return out
}

/** 给 KP 行追加 grades（去重非空年级）与 textbooks（来源教材明细） */
export function withTextbooks<T extends { id: string }>(kp: T, sources: Map<string, KpTextbookSource[]>) {
  const textbooks = sources.get(kp.id) ?? []
  const grades = [...new Set(textbooks.map(t => t.grade).filter(Boolean))]
  return { ...kp, grades, textbooks }
}
