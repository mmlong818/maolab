/**
 * 知识本体 v1.1 — KnowledgePoint / KnowledgePointCluster
 *
 * 设计要点（决策已拍板）：
 *   D1.1  cluster id 用 ULID + `clst_` 前缀（2026-05-26 起生效，旧 UUID 兼容读取）
 *   D1.2  多来源冲突按优先级表：manual > pep-cn > llm > external-kg
 *   D1.3  cluster 先建单成员，第二个体系入库时再 LLM 对齐
 *   D1.4  Pilot：KP + cluster 同步建（每个 KP 自动一个单成员 cluster）
 *   D1.5  学情懒回填
 *
 * 边界：本模块只定义类型 + zod schema + helper，不做 DB / 运行时副作用。
 */
import { ulid } from 'ulid'
import { z } from 'zod'

import type { KnowledgeType } from './knowledge-type-rules.js'

/**
 * 结构性复用 textbook-index 的 Annotation<T> / ChapterAnnotations / KnowledgeType。
 *
 * 为什么不 import：textbook-index 已依赖 @maolab/shared-types，反向 import 会形成循环。
 * 这里以**结构性等价**重新声明（与 packages/textbook-index/src/tree-types.ts 保持同步）。
 * TODO(v1.2): 把这三个类型从 textbook-index 提升到 shared-types，textbook-index 改为 re-export。
 */
export interface Annotation<T> {
  value: T
  source: 'llm' | 'human' | 'human-verified'
  confidence?: number
  labeledAt: number
  annotatorName: string
  annotatorVersion: string
  model?: string
  reasoning?: string
}

export interface ChapterAnnotations {
  knowledgeType?: Annotation<KnowledgeType>
  difficulty?: Annotation<number>
  prerequisites?: Annotation<string[]>
  examWeight?: Annotation<number>
  estimatedMinutes?: Annotation<number>
  crossSubjectLinks?: Annotation<string[]>
}

// ============================================================
// SourceRef — provenance 来源记录
// ============================================================

/**
 * 多来源冲突时的优先级（D1.2）。
 * 数组靠前 = 优先级更高。
 */
export const SOURCE_PRIORITY = ['manual', 'pep-cn', 'llm', 'external-kg'] as const
export type SourceKind = (typeof SOURCE_PRIORITY)[number]

/** 一条 provenance 记录 —— 描述某条字段/某个 KP 的某次来源 */
export interface SourceRef {
  /** 来源类型 */
  kind: SourceKind
  /** 同 kind 下的具体体系版本，如 'pep-2019' / 'mext-h28' */
  systemId?: string
  /** 教材树 id（来自 textbook-index） */
  textbookId?: string
  /** 教材叶子节点 id */
  leafNodeId?: string
  /** 人工 curator id（kind=manual 时） */
  curatorId?: string
  /** LLM 模型字符串（kind=llm 时） */
  llmModel?: string
  /** 外部知识图谱 URI（kind=external-kg 时） */
  externalKgUri?: string
  /** ms timestamp */
  capturedAt: number
  /** [0,1] */
  confidence?: number
  notes?: string
}

/**
 * 按优先级表返回胜出 source。
 * 同优先级取数组先到的；数组空返回 null。
 */
export function pickWinningSource(sources: readonly SourceRef[]): SourceRef | null {
  if (sources.length === 0) return null
  let winner: SourceRef = sources[0]!
  let winnerRank = SOURCE_PRIORITY.indexOf(winner.kind)
  for (let i = 1; i < sources.length; i++) {
    const s = sources[i]!
    const rank = SOURCE_PRIORITY.indexOf(s.kind)
    if (rank < winnerRank) {
      winner = s
      winnerRank = rank
    }
  }
  return winner
}

// ============================================================
// KnowledgePoint / KnowledgePointCluster
// ============================================================

/**
 * 知识点 —— 某一课程体系下的规范化"原子知识"。
 *
 * 多体系对齐（PEP / MEXT / NGSS …）通过 clusterId 聚合。
 * dimensions 复用 v1 的 ChapterAnnotations（6 维 annotator）。
 */
export interface KnowledgePoint {
  /** ULID（过渡期 UUID） */
  id: string
  /** ULID → KnowledgePointCluster.id */
  clusterId: string
  /** 本体系下的规范名（如 "勾股定理"） */
  canonicalName: string
  /** 英文 canonical（跨体系对齐用） */
  canonicalNameEn?: string
  /** 别名（"毕达哥拉斯定理" 等） */
  aliases: string[]
  /** 学科 */
  subject: string
  /** 学段（"junior-high" / "高一"…） */
  gradeBand?: string
  /** 'pep-2019' / 'mext-h28' / 'us-ngss' … */
  curriculumSystem: string
  /** hash(canonicalNameEn + subject + gradeBand) 用于幂等 */
  canonicalHash: string
  provenance: { sourceRefs: SourceRef[] }
  /** v1 六维标注（复用 textbook-index 的 ChapterAnnotations） */
  dimensions?: ChapterAnnotations
  createdAt: number
  updatedAt: number
  verified?: boolean
  verifierIds?: string[]
  /** LLM 抽取置信度 [0,1]，与 SourceRef.confidence 同源 */
  confidence?: number
}

/**
 * 跨体系聚合簇 —— 把不同课程体系下表达同一知识的 KP 聚到一个 cluster。
 * D1.3：先建单成员，第二个体系入库时再 LLM 对齐。
 */
export interface KnowledgePointCluster {
  /** ULID */
  id: string
  /** 唯一索引（hashed lower） */
  canonicalNameEn: string
  /** { zh: '勾股定理', ja: 'ピタゴラスの定理', ... } */
  canonicalNamesByLocale?: Record<string, string>
  subject: string
  /** 反向索引（dev 便利；DB 上不一定持久化） */
  memberKpIds: string[]
  createdAt: number
  updatedAt: number
}

// ============================================================
// Zod schemas
// ============================================================

export const SourceKindSchema = z.enum(SOURCE_PRIORITY)

export const SourceRefSchema = z.object({
  kind: SourceKindSchema,
  systemId: z.string().optional(),
  textbookId: z.string().optional(),
  leafNodeId: z.string().optional(),
  curatorId: z.string().optional(),
  llmModel: z.string().optional(),
  externalKgUri: z.string().optional(),
  capturedAt: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  notes: z.string().optional()
})

/**
 * Annotation<T> 的轻量 zod 形（避免反向依赖 textbook-index 的运行时 zod）。
 * 校验时只检查必备字段，T 用 z.unknown() 占位 —— 真实校验交给上游 annotator。
 */
const AnnotationLooseSchema = z.object({
  value: z.unknown(),
  source: z.enum(['llm', 'human', 'human-verified']),
  confidence: z.number().min(0).max(1).optional(),
  labeledAt: z.number().int().nonnegative(),
  annotatorName: z.string(),
  annotatorVersion: z.string(),
  model: z.string().optional(),
  reasoning: z.string().optional()
})

const ChapterAnnotationsSchema = z
  .object({
    knowledgeType: AnnotationLooseSchema.optional(),
    difficulty: AnnotationLooseSchema.optional(),
    prerequisites: AnnotationLooseSchema.optional(),
    examWeight: AnnotationLooseSchema.optional(),
    estimatedMinutes: AnnotationLooseSchema.optional(),
    crossSubjectLinks: AnnotationLooseSchema.optional()
  })
  .passthrough()

export const KnowledgePointSchema = z.object({
  id: z.string().min(1),
  clusterId: z.string().min(1),
  canonicalName: z.string().min(1),
  canonicalNameEn: z.string().optional(),
  aliases: z.array(z.string()),
  subject: z.string().min(1),
  gradeBand: z.string().optional(),
  curriculumSystem: z.string().min(1),
  canonicalHash: z.string().min(1),
  provenance: z.object({
    sourceRefs: z.array(SourceRefSchema)
  }),
  dimensions: ChapterAnnotationsSchema.optional(),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  verified: z.boolean().optional(),
  verifierIds: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional()
})

export const KnowledgePointClusterSchema = z.object({
  id: z.string().min(1),
  canonicalNameEn: z.string().min(1),
  canonicalNamesByLocale: z.record(z.string(), z.string()).optional(),
  subject: z.string().min(1),
  memberKpIds: z.array(z.string()),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative()
})

// ============================================================
// Helpers
// ============================================================

/**
 * 取 SHA-256 hex 前 16 字符。
 * gradeBand 缺省时用空字符串，确保稳定。
 */
export function computeCanonicalHash(opts: {
  canonicalNameEn: string
  subject: string
  gradeBand?: string
}): string {
  const key = `${opts.canonicalNameEn.toLowerCase()}|${opts.subject.toLowerCase()}|${(opts.gradeBand ?? '').toLowerCase()}`
  // 顶层 import 'node:crypto' 会被 webpack 拖进 client bundle 报 UnhandledSchemeError；
  // 改成内部 require/eval-import，client tree-shake 时看不到静态 node: import。
  // computeCanonicalHash 只在 server / Node 端调用，client 不会真走到这一行。
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHash } = (eval('require'))('node:crypto') as typeof import('node:crypto')
  return createHash('sha256').update(key).digest('hex').slice(0, 16)
}

/**
 * 生成 KP id。
 * TODO(v1.2): 切到 ULID + `kp_` 前缀。当前仍是 UUID，不阻塞 cluster 切换。
 */
export function newKpId(): string {
  // crypto.randomUUID() 返回 36 字符（含 '-'）的 v4 UUID
  return globalThis.crypto.randomUUID()
}

/** Cluster id 新格式: `clst_` + 26 字符 ULID = 31 字符总长. */
export const CLUSTER_ID_PREFIX = 'clst_'

/**
 * 生成 cluster id (2026-05-26+).
 *
 * 格式: `clst_${ulid}` (31 chars).
 * ULID 比 UUID v4 优势:
 *   - 26 字符 base32 比 36 字符带 '-' 紧凑
 *   - 前 10 字符是毫秒时间戳, 按生成顺序排序
 *   - URL safe, 大小写不敏感
 * 前缀让 cluster id 与 KP id (仍 UUID) / 其他 id 字符串一眼可分.
 */
export function newClusterId(): string {
  return `${CLUSTER_ID_PREFIX}${ulid()}`
}

/**
 * 检查字符串是否是合法 cluster id.
 *
 * 灰度兼容: 新格式 (clst_ULID) 和旧格式 (v4 UUID) 都接受.
 * 严格断言走 assertClusterId().
 */
export function isValidClusterId(id: unknown): id is string {
  if (typeof id !== 'string') return false
  // 新格式: clst_ + 26 字符 ULID
  if (id.startsWith(CLUSTER_ID_PREFIX)) {
    return /^clst_[0-9A-HJKMNP-TV-Z]{26}$/.test(id)
  }
  // 旧格式: v4 UUID
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

/**
 * 严格断言 cluster id 格式 (灰度开关下生效).
 *
 * 通过环境变量 MAOLAB_STRICT_CLUSTER_ID=1 启用严格模式 — 只接受新格式 (`clst_` 前缀).
 * 默认非严格: 同 isValidClusterId, 旧 UUID 也接受.
 *
 * 设计意图: 灰度期允许新旧共存读取, 严格模式开启后阻断"代码绕过 newClusterId
 * 自己拼字符串"的反例, 不影响读取存量数据.
 */
export function assertClusterId(id: unknown): asserts id is string {
  if (typeof id !== 'string') {
    throw new Error(`assertClusterId: expected string, got ${typeof id}`)
  }
  const strict = globalThis.process?.env?.MAOLAB_STRICT_CLUSTER_ID === '1'
  if (strict) {
    if (!id.startsWith(CLUSTER_ID_PREFIX) || !/^clst_[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) {
      throw new Error(
        `assertClusterId (strict): expected '${CLUSTER_ID_PREFIX}...' ULID format, got: ${id}`,
      )
    }
    return
  }
  if (!isValidClusterId(id)) {
    throw new Error(`assertClusterId: not a valid cluster id (neither new nor legacy UUID): ${id}`)
  }
}

