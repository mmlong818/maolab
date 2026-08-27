/**
 * kp-metadata · Prep Brief 专用只读 KP 元数据查询(server-only)
 *
 * v5 M1「Prep Brief v0」用:按 kpId 批量查教材索引期标注的认知类型/误概念/学习目标,
 * 供教研简报组装(prep-brief.ts)。annotations JSON 解析规则与
 * app/api/v2/mainline/from-kps/route.ts 的 parseKpDimensions 镜像——两处独立维护是
 * 已知技术债(该路由的解析函数未导出,不在本次改动范围内合并)。
 *
 * ⚠️ 依赖 DB,禁止从 `@/lib/mainline` barrel(index.ts)导出——同 store.ts / mastery-store.ts。
 */

import { openSqliteRaw } from '@maolab/db'
import type { KnowledgeType } from '@maolab/shared-types'

const KP_KNOWLEDGE_TYPES = ['factual', 'conceptual', 'procedural', 'metacognitive'] as const

export interface KpMetadata {
  id: string
  canonicalName: string
  /** 教材索引期标注的认知类型;未标注时缺省(由调用方兜底)。 */
  knowledgeType?: KnowledgeType
  /** 教材索引期标注的常见误解。 */
  misconceptions?: string[]
  /** 教材索引期标注的学习目标。 */
  learningObjectives?: string[]
}

interface KpRow {
  id: string
  canonical_name: string
  annotations: string | null
}

let _db: ReturnType<typeof openSqliteRaw> | null = null
function getDb() {
  if (_db) return _db
  const url = process.env.DATABASE_URL ?? 'file:./data/maolab.db'
  _db = openSqliteRaw(url.replace(/^file:/, ''))
  return _db
}

/** annotations JSON 每维是 Annotation<T> 容器({ value, source, ... });只取 value,坏数据一律忽略。 */
function parseDimensions(raw: string | null): Pick<KpMetadata, 'knowledgeType' | 'misconceptions' | 'learningObjectives'> {
  if (!raw) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!parsed || typeof parsed !== 'object') return {}
  const dims = parsed as Record<string, { value?: unknown } | undefined>
  const out: ReturnType<typeof parseDimensions> = {}

  const kt = dims.knowledgeType?.value
  if (typeof kt === 'string' && (KP_KNOWLEDGE_TYPES as readonly string[]).includes(kt)) {
    out.knowledgeType = kt as KnowledgeType
  }

  const mis = dims.misconceptions?.value
  if (Array.isArray(mis)) {
    const items = mis.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    if (items.length > 0) out.misconceptions = items
  }

  const objectives = dims.learningObjectives?.value
  if (Array.isArray(objectives)) {
    const items = objectives.filter((o): o is string => typeof o === 'string' && o.trim().length > 0)
    if (items.length > 0) out.learningObjectives = items
  }

  return out
}

/** 批量查 KP 元数据;库里找不到的 id 直接缺席(调用方按 undefined 当数据缺口处理)。 */
export async function fetchKpMetadata(ids: readonly string[]): Promise<Map<string, KpMetadata>> {
  const out = new Map<string, KpMetadata>()
  if (ids.length === 0) return out

  const db = getDb()
  const placeholders = ids.map(() => '?').join(',')
  const rows = db
    .prepare(`SELECT id, canonical_name, annotations FROM knowledge_points WHERE id IN (${placeholders})`)
    .all(...ids) as KpRow[]

  for (const row of rows) {
    out.set(row.id, {
      id: row.id,
      canonicalName: row.canonical_name,
      ...parseDimensions(row.annotations),
    })
  }
  return out
}
