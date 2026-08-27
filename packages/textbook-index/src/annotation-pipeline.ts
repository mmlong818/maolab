/**
 * 章节标注通用 Pipeline
 *
 * 角色分工：
 *   Annotator<T>           可插拔的标注器接口；每种标注（knowledge-type / difficulty / ...）实现一个
 *   AnnotationContext      运行时上下文：学科、学段、章节路径、关联国家课等
 *   runPipeline            主调度器：扫树 → 抽叶子 → 按 annotator × leaf 调度 → 写回 → checkpoint
 *
 * 复用能力（一次编写、所有 annotator 共享）：
 *   - 学科/学段推断
 *   - 叶子节点抽取
 *   - 国家课反查
 *   - 并发限制
 *   - 失败重试
 *   - .bak 备份
 *   - checkpoint（按 annotator 名+版本+chapter id）
 *   - 抽样（sampleN）/ dry-run / skipExisting
 */

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import type {
  Annotation,
  ChapterAnnotations,
  ChapterNode,
  NationalLesson,
  TextbookFullInfo,
} from './tree-types.js'

// =============================================================================
// 学科 / 学段（共享，不属于具体 annotator）
// =============================================================================

const SUBJECT_PATTERNS: Array<[RegExp, string]> = [
  [/语文/, '语文'],
  [/数学/, '数学'],
  [/英语/, '英语'],
  [/物理/, '物理'],
  [/化学/, '化学'],
  [/生物/, '生物'],
  [/历史/, '历史'],
  [/地理/, '地理'],
  [/(道德与法治|思想政治|政治)/, '思政'],
  [/科学/, '科学'],
  [/音乐/, '音乐'],
  [/美术/, '美术'],
  [/体育/, '体育'],
  [/信息/, '信息技术'],
  [/劳动/, '劳动'],
  [/日语/, '日语'],
  [/俄语/, '俄语'],
  [/艺术/, '艺术'],
]

const STAGE_PATTERNS: Array<[RegExp, string]> = [
  [/小学|一年级|二年级|三年级|四年级|五年级|六年级/, '小学'],
  [/初中|七年级|八年级|九年级/, '初中'],
  [/高中|高一|高二|高三|必修|选修|选择性必修/, '高中'],
]

export function inferSubject(textbookTitle: string): string {
  for (const [re, name] of SUBJECT_PATTERNS) if (re.test(textbookTitle)) return name
  return '通用'
}

export function inferStage(textbookTitle: string): string {
  for (const [re, name] of STAGE_PATTERNS) if (re.test(textbookTitle)) return name
  return '未知学段'
}

// =============================================================================
// 叶子抽取 + 国家课反查
// =============================================================================

export interface LeafWithPath {
  node: ChapterNode
  ancestorTitles: string[]
}

export function collectLeaves(roots: ChapterNode[]): LeafWithPath[] {
  const out: LeafWithPath[] = []
  function walk(nodes: ChapterNode[], ancestors: string[]): void {
    for (const n of nodes) {
      const kids = n.child_nodes ?? []
      if (kids.length === 0) out.push({ node: n, ancestorTitles: ancestors })
      else walk(kids, [...ancestors, n.title])
    }
  }
  walk(roots, [])
  return out
}

export function indexLessonsByChapterId(lessons: NationalLesson[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const l of lessons) {
    for (const cid of l.chapter_ids ?? []) {
      const arr = m.get(cid) ?? []
      arr.push(l.title)
      m.set(cid, arr)
    }
  }
  return m
}

// =============================================================================
// 通用 LLM 调用类型（annotator 自行选择 prompt）
// =============================================================================

export type LLMCaller = (args: {
  prompt: string
  system: string
  model: string
  apiKey: string
  baseURL?: string
}) => Promise<string>

async function defaultLLMCall(args: {
  prompt: string
  system: string
  model: string
  apiKey: string
  baseURL?: string
}): Promise<string> {
  const { generateText } = await import('ai')
  const { providerId, modelId } = parseModel(args.model)
  let langModel: unknown
  if (providerId === 'anthropic') {
    const { createAnthropic } = await import('@ai-sdk/anthropic')
    const p = createAnthropic({ apiKey: args.apiKey, ...(args.baseURL ? { baseURL: args.baseURL } : {}) })
    langModel = p(modelId)
  } else {
    const { createOpenAI } = await import('@ai-sdk/openai')
    const p = createOpenAI({ apiKey: args.apiKey, ...(args.baseURL ? { baseURL: args.baseURL } : {}) })
    langModel = p(modelId)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await generateText({ model: langModel as any, system: args.system, prompt: args.prompt, temperature: 0.1 })
  return result.text
}

function parseModel(model: string): { providerId: string; modelId: string } {
  const idx = model.indexOf(':')
  if (idx <= 0) return { providerId: 'openai', modelId: model }
  return { providerId: model.slice(0, idx), modelId: model.slice(idx + 1) }
}

// =============================================================================
// AnnotationContext
// =============================================================================

/** 章节级元分析产出（chapter-plan-extract.ts 输出），由 batch-kp-extract 加载并注入 ctx */
export interface UnitPlanForKp {
  unitTitle: string
  unitTheme: string
  kpTypeCatalog: string[]
  subjectFocus: string
  difficultyAnchor: [number, number]
  /** 本 leaf 在 plan 里的预期重点 */
  leafExpectedFocus?: string
  /** 本 leaf 在 plan 里的难度估值 */
  leafDifficultyEstimate?: number
}

export interface AnnotationContext {
  chapterId: string
  chapterTitle: string
  subject: string
  stage: string
  ancestorTitles: string[]
  linkedLessonTitles: string[]
  /** 整棵教材的标题，供 annotator 参考 */
  textbookTitle: string
  /**
   * 该叶子对应的教材正文（来自 textbook-body-segment 切分结果）。
   * 有值时 KP 抽取据正文拆解；缺失时回退到标题+国家课资源，confidence 须降低。
   */
  chapterBodyText?: string
  /**
   * 本 leaf 所属单元的元分析 plan（chapter-plan-extract 产物）。
   * 有值时 KP 抽取按"plan + 正文"双锚定；缺失时回退到仅正文（confidence 须降低）。
   */
  unitPlan?: UnitPlanForKp
}

// =============================================================================
// Annotator 接口
// =============================================================================

export type AnnotationKey = keyof ChapterAnnotations

export interface AnnotationRunStats {
  promptChars: number
  completionChars: number
}

export interface Annotator<T> {
  /** 写到 annotations 容器里的字段名 */
  key: AnnotationKey
  /** 标识名，用于日志/checkpoint */
  name: string
  /** 语义化版本——升级 prompt / 规则要 bump 才会重打 */
  version: string
  /** 该 annotator 用到的模型字符串（如 anthropic:claude-haiku-4-5-20251001） */
  model: string
  /** 决定要不要跑（默认：annotations[key] 缺失 或 version 不一致 时跑） */
  shouldRun?(node: ChapterNode): boolean
  /** 真正的标注实现 */
  annotate(ctx: AnnotationContext, deps: {
    apiKey: string
    baseURL?: string
    llmCall: LLMCaller
    model: string
  }): Promise<{ annotation: Annotation<T>; stats: AnnotationRunStats }>
}

// =============================================================================
// Pipeline
// =============================================================================

export interface PipelineStats {
  totalLeaves: number
  perAnnotator: Record<string, {
    alreadyDone: number
    toRun: number
    succeeded: number
    failed: number
    promptCharsTotal: number
    completionCharsTotal: number
    valueDistribution: Record<string, number>  // 仅对枚举类 annotator 有意义
    avgConfidence: number
    lowConfidenceCount: number
  }>
}

export interface PipelineOptions {
  trees: TextbookFullInfo[]
  /** 已加载的 tree 列表与其路径平行 */
  treePaths: string[]
  annotators: Annotator<unknown>[]
  apiKey: string
  baseURL?: string
  concurrency?: number
  dryRun?: boolean
  /** 仅跑前 N 个叶子（per tree） */
  sampleN?: number
  /** 强制重跑：忽略已有版本一致的 annotation */
  force?: boolean
  /** 最大重试次数 */
  maxRetries?: number
  llmCall?: LLMCaller
  onProgress?: (info: { annotator: string; treeIndex: number; done: number; total: number }) => void
}

function pLimit(concurrency: number) {
  const queue: Array<() => void> = []
  let active = 0
  const next = () => {
    active--
    const fn = queue.shift()
    if (fn) fn()
  }
  return function run<T>(task: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const start = () => {
        active++
        task().then(
          (v) => { resolve(v); next() },
          (e) => { reject(e); next() },
        )
      }
      if (active < concurrency) start()
      else queue.push(start)
    })
  }
}

async function backupOnce(filePath: string): Promise<void> {
  const bak = filePath + '.bak'
  try { await access(bak); return } catch { /* not exist */ }
  const buf = await readFile(filePath, 'utf-8')
  await writeFile(bak, buf, 'utf-8')
}

function defaultShouldRun(annotator: Annotator<unknown>, node: ChapterNode): boolean {
  // v1.1: ChapterAnnotations 增加了非 Annotation<T> 字段 (knowledgePointIds: string[])，
  // 此处仅关心 annotator 写入的标注槽位（形如 { annotatorVersion, ... }）。
  const existing = node.annotations?.[annotator.key]
  if (!existing || Array.isArray(existing) || typeof existing !== 'object') return true
  return existing.annotatorVersion !== annotator.version
}

async function runWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
): Promise<T> {
  let lastErr: unknown
  for (let i = 1; i <= maxRetries; i++) {
    try { return await fn() } catch (e) {
      lastErr = e
      await new Promise((r) => setTimeout(r, 200 * Math.pow(3, i - 1)))
    }
  }
  throw lastErr
}

/**
 * 主入口：在内存中给所有 tree 的叶子节点跑所有 annotator，然后把每棵树写回原路径。
 * 调用方负责加载 tree 和决定写回时机。
 */
export async function runPipeline(opts: PipelineOptions): Promise<PipelineStats> {
  const {
    trees, treePaths, annotators,
    concurrency = 5, dryRun = false, force = false, sampleN, maxRetries = 3,
    onProgress,
  } = opts
  const llmCall = opts.llmCall ?? defaultLLMCall

  if (trees.length !== treePaths.length) {
    throw new Error('trees 与 treePaths 长度不一致')
  }

  const stats: PipelineStats = { totalLeaves: 0, perAnnotator: {} }
  for (const a of annotators) {
    stats.perAnnotator[a.name] = {
      alreadyDone: 0, toRun: 0, succeeded: 0, failed: 0,
      promptCharsTotal: 0, completionCharsTotal: 0,
      valueDistribution: {}, avgConfidence: 0, lowConfidenceCount: 0,
    }
  }
  const confSums: Record<string, number> = {}
  for (const a of annotators) confSums[a.name] = 0

  // 串行处理每棵树（每棵树内部并发处理叶子 × annotator）
  for (let ti = 0; ti < trees.length; ti++) {
    const tree = trees[ti]!
    const path = treePaths[ti]!
    const subject = inferSubject(tree.textbookTitle)
    const stage = inferStage(tree.textbookTitle)
    const leaves = collectLeaves(tree.chapterTree)
    const lessonsIdx = indexLessonsByChapterId(tree.nationalLessons ?? [])
    stats.totalLeaves += leaves.length

    if (!dryRun) await backupOnce(path)

    // 构造任务列表
    type Task = { annotator: Annotator<unknown>; leaf: LeafWithPath; ctx: AnnotationContext }
    const tasks: Task[] = []
    const sliced = typeof sampleN === 'number' ? leaves.slice(0, sampleN) : leaves
    for (const annotator of annotators) {
      for (const leaf of sliced) {
        const shouldRun = annotator.shouldRun
          ? annotator.shouldRun(leaf.node)
          : defaultShouldRun(annotator, leaf.node)
        if (!shouldRun && !force) {
          stats.perAnnotator[annotator.name]!.alreadyDone++
          continue
        }
        const ctx: AnnotationContext = {
          chapterId: leaf.node.id,
          chapterTitle: leaf.node.title,
          subject, stage,
          ancestorTitles: leaf.ancestorTitles,
          linkedLessonTitles: lessonsIdx.get(leaf.node.id) ?? [],
          textbookTitle: tree.textbookTitle,
        }
        tasks.push({ annotator, leaf, ctx })
        stats.perAnnotator[annotator.name]!.toRun++
      }
    }

    if (dryRun) {
      // 仅打印前 2 条任务摘要
      for (let i = 0; i < Math.min(2, tasks.length); i++) {
        const t = tasks[i]!
        console.log(`--- DRY-RUN ${t.annotator.name} on "${t.ctx.chapterTitle}" ---`)
      }
      continue
    }

    const limit = pLimit(concurrency)
    let lastReport = 0
    let progressDone = 0

    await Promise.all(tasks.map((t) => limit(async () => {
      try {
        const deps: { apiKey: string; baseURL?: string; llmCall: LLMCaller; model: string } = {
          apiKey: opts.apiKey,
          llmCall,
          model: t.annotator.model,
        }
        if (opts.baseURL !== undefined) deps.baseURL = opts.baseURL
        const { annotation, stats: rs } = await runWithRetry(
          () => t.annotator.annotate(t.ctx, deps),
          maxRetries,
        )
        // 写回 node
        if (!t.leaf.node.annotations) t.leaf.node.annotations = {}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(t.leaf.node.annotations as any)[t.annotator.key] = annotation
        const ps = stats.perAnnotator[t.annotator.name]!
        ps.succeeded++
        ps.promptCharsTotal += rs.promptChars
        ps.completionCharsTotal += rs.completionChars
        const valueKey = String(annotation.value)
        ps.valueDistribution[valueKey] = (ps.valueDistribution[valueKey] ?? 0) + 1
        if (typeof annotation.confidence === 'number') {
          confSums[t.annotator.name] = (confSums[t.annotator.name] ?? 0) + annotation.confidence
          if (annotation.confidence < 0.5) ps.lowConfidenceCount++
        }
        progressDone++
        const now = Date.now()
        if (onProgress && (now - lastReport > 1500 || progressDone === tasks.length)) {
          onProgress({ annotator: t.annotator.name, treeIndex: ti, done: progressDone, total: tasks.length })
          lastReport = now
        }
      } catch (err) {
        stats.perAnnotator[t.annotator.name]!.failed++
        console.error(`[pipeline] FAILED ${t.annotator.name} on "${t.ctx.chapterTitle}":`, err)
      }
    })))

    // 写回当前树
    if (tasks.length > 0) await writeFile(path, JSON.stringify(tree), 'utf-8')
  }

  // 计算平均置信度
  for (const a of annotators) {
    const ps = stats.perAnnotator[a.name]!
    ps.avgConfidence = ps.succeeded > 0 ? (confSums[a.name] ?? 0) / ps.succeeded : 0
  }
  return stats
}

// =============================================================================
// Checkpoint （annotator 名+版本 × chapter id 维度）
// =============================================================================

const CHECKPOINT_PATH = 'data/textbook-trees/.label-checkpoint.json'

export interface PipelineCheckpoint {
  /** "annotatorName@version" → tree id → "__complete__" or chapter id list */
  byAnnotator: Record<string, Record<string, string[]>>
  updatedAt: number
}

export async function loadCheckpoint(path = CHECKPOINT_PATH): Promise<PipelineCheckpoint> {
  try {
    return JSON.parse(await readFile(path, 'utf-8')) as PipelineCheckpoint
  } catch {
    return { byAnnotator: {}, updatedAt: Date.now() }
  }
}

export async function saveCheckpoint(cp: PipelineCheckpoint, path = CHECKPOINT_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  cp.updatedAt = Date.now()
  await writeFile(path, JSON.stringify(cp, null, 2), 'utf-8')
}
