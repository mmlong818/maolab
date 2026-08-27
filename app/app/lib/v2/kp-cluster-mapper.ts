/**
 * Knowledge Ontology v1.1 — 懒回填 helper（D1.5）
 *
 * 给定 objectiveId / atomSourceLeafId，反查 (kpId, clusterId)。
 *
 * 优先级：
 *   1. in-memory LRU cache（cap=1000）
 *   2. SELECT cluster_id FROM knowledge_points WHERE id = objectiveId
 *      （假设 objectiveId 已经是 KP id —— PR3 由 adaptive controller 显式写时常见）
 *   3. SELECT kp_id FROM chapter_node_knowledge_points WHERE chapter_node_id = atomSourceLeafId
 *      取第一个，再查它的 cluster_id
 *   4. 都查不到 → 返 {null, null}，per-session warn 一次
 *
 * 边界：本模块**不**自动写回 DB；写回由调用方（student-response-store）异步触发。
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BetterSqliteDb = any

export interface KpClusterMapping {
  knowledgePointId: string | null
  knowledgePointClusterId: string | null
}

const MAX_CACHE = 1000
const cache = new Map<string, KpClusterMapping>()
let warnedThisSession = false

function cacheKey(opts: { objectiveId?: string; atomSourceLeafId?: string }): string {
  return `${opts.objectiveId ?? ''}::${opts.atomSourceLeafId ?? ''}`
}

function cacheGet(key: string): KpClusterMapping | undefined {
  const v = cache.get(key)
  if (v !== undefined) {
    // LRU touch
    cache.delete(key)
    cache.set(key, v)
  }
  return v
}

function cacheSet(key: string, value: KpClusterMapping): void {
  if (cache.size >= MAX_CACHE) {
    const first = cache.keys().next().value
    if (first !== undefined) cache.delete(first)
  }
  cache.set(key, value)
}

/** 测试用：清空 cache + 重置 warn 标记。 */
export function __resetKpClusterCacheForTest(): void {
  cache.clear()
  warnedThisSession = false
}

/**
 * 反查 (kpId, clusterId)。失败兜底 {null, null}。
 */
export function resolveKpCluster(
  db: BetterSqliteDb,
  opts: { objectiveId?: string; atomSourceLeafId?: string }
): KpClusterMapping {
  const key = cacheKey(opts)
  const hit = cacheGet(key)
  if (hit !== undefined) return hit

  let mapping: KpClusterMapping = { knowledgePointId: null, knowledgePointClusterId: null }

  try {
    // 路径 2: objectiveId 当作 KP id 试查
    if (opts.objectiveId) {
      const row = db
        .prepare(`SELECT id, cluster_id FROM knowledge_points WHERE id = ? LIMIT 1`)
        .get(opts.objectiveId) as { id: string; cluster_id: string } | undefined
      if (row) {
        mapping = { knowledgePointId: row.id, knowledgePointClusterId: row.cluster_id }
      }
    }

    // 路径 3: 通过 chapter_node 反查
    if (!mapping.knowledgePointId && opts.atomSourceLeafId) {
      const row = db
        .prepare(
          `SELECT kp.id AS kp_id, kp.cluster_id AS cluster_id
           FROM chapter_node_knowledge_points cnkp
           JOIN knowledge_points kp ON kp.id = cnkp.knowledge_point_id
           WHERE cnkp.chapter_node_id = ?
           ORDER BY cnkp.position ASC
           LIMIT 1`
        )
        .get(opts.atomSourceLeafId) as { kp_id: string; cluster_id: string } | undefined
      if (row) {
        mapping = { knowledgePointId: row.kp_id, knowledgePointClusterId: row.cluster_id }
      }
    }
  } catch (e) {
    // KP 表可能尚未建（理论上 student-response-store 启动会建；测试隔离 db 也要建）
    // 静默兜底，不抛
    if (!warnedThisSession) {
      // eslint-disable-next-line no-console
      console.warn('[kp-cluster-mapper] resolve failed (KP tables missing?):', (e as Error).message)
      warnedThisSession = true
    }
  }

  if (!mapping.knowledgePointId && !mapping.knowledgePointClusterId) {
    if (!warnedThisSession) {
      // eslint-disable-next-line no-console
      console.warn(
        `[kp-cluster-mapper] no mapping for objectiveId=${opts.objectiveId ?? ''} atomSourceLeafId=${opts.atomSourceLeafId ?? ''}`
      )
      warnedThisSession = true
    }
  }

  cacheSet(key, mapping)
  return mapping
}
