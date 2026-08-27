#!/usr/bin/env tsx
/**
 * CLI 入口：在 textbook-trees 上运行 annotation pipeline
 *
 * 用法：
 *   pnpm textbook:annotate --annotator=knowledge-type --tree=<id> --dry-run
 *   pnpm textbook:annotate --annotator=knowledge-type --tree=<id1>,<id2> --concurrency=5
 *   pnpm textbook:annotate --annotator=knowledge-type --tree=<id> --sample=10
 *   pnpm textbook:annotate --annotator=knowledge-type --all --concurrency=5
 *   pnpm textbook:annotate --annotator=knowledge-type --tree=<id> --force      # 重打已标的
 *
 * 多 annotator（未来）：
 *   pnpm textbook:annotate --annotator=knowledge-type,difficulty --tree=<id>
 *
 * 环境变量：
 *   ANTHROPIC_API_KEY / OPENAI_API_KEY / DEEPSEEK_API_KEY
 *   LABEL_LLM_MODEL              覆盖 annotator 默认模型
 *   LABEL_BASE_URL               OpenAI 兼容代理
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import {
  createClaudeCliCaller,
  createKnowledgePointExtractionAnnotator,
  createKnowledgeTypeAnnotator,
  loadCheckpoint,
  runPipeline,
  saveCheckpoint,
  type Annotator,
  type LLMCaller,
  type PipelineStats,
  type TextbookFullInfo,
} from '../src/index.js'

const TREES_DIR = 'data/textbook-trees'
const REPORT_DIR = 'data/textbook-trees/.label-reports'

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {}
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq < 0) out[a.slice(2)] = true
    else out[a.slice(2, eq)] = a.slice(eq + 1)
  }
  return out
}

/** annotator 名 → 构造函数（注册中心，未来加新 annotator 在此注册） */
const ANNOTATOR_REGISTRY: Record<string, (model?: string) => Annotator<unknown>> = {
  'knowledge-type': (model) => createKnowledgeTypeAnnotator(model ? { model } : {}) as Annotator<unknown>,
  'knowledge-point-extraction': (model) =>
    createKnowledgePointExtractionAnnotator(model ? { model } : {}) as Annotator<unknown>,
  // 'difficulty': (model) => createDifficultyAnnotator(...) as Annotator<unknown>,  // 未来
}

function pickEnvKey(model: string): { apiKey: string; baseURL?: string } {
  const colon = model.indexOf(':')
  const provider = colon > 0 ? model.slice(0, colon) : 'openai'
  const baseURL = process.env.LABEL_BASE_URL
  const out: { apiKey: string; baseURL?: string } = { apiKey: '' }
  if (baseURL !== undefined) out.baseURL = baseURL
  if (provider === 'anthropic') {
    const k = process.env.ANTHROPIC_API_KEY
    if (!k) throw new Error('ANTHROPIC_API_KEY 未设置')
    out.apiKey = k
    return out
  }
  if (provider === 'deepseek') {
    const k = process.env.DEEPSEEK_API_KEY
    if (!k) throw new Error('DEEPSEEK_API_KEY 未设置')
    out.apiKey = k
    return out
  }
  const k = process.env.OPENAI_API_KEY
  if (!k) throw new Error('OPENAI_API_KEY 未设置')
  out.apiKey = k
  if (out.baseURL === undefined && process.env.OPENAI_BASE_URL) out.baseURL = process.env.OPENAI_BASE_URL
  return out
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const dryRun = Boolean(args['dry-run'])
  const force = Boolean(args.force)
  const concurrency = args.concurrency ? Number(args.concurrency) : 5
  const sampleN = args.sample ? Number(args.sample) : undefined
  const provider = (typeof args.provider === 'string' ? args.provider : 'claude-cli') as
    'claude-cli' | 'anthropic-sdk' | 'openai-sdk'
  if (!['claude-cli', 'anthropic-sdk', 'openai-sdk'].includes(provider)) {
    console.error(`未知 provider: ${provider}. 可用: claude-cli | anthropic-sdk | openai-sdk`)
    process.exit(2)
  }

  // claude-cli 默认模型 haiku；其他保留 annotator 默认或显式 --model 覆盖
  let modelOverride = (args.model as string) || process.env.LABEL_LLM_MODEL
  if (provider === 'claude-cli' && !modelOverride) {
    modelOverride = 'claude-cli:haiku'
  } else if (provider === 'claude-cli' && modelOverride && !modelOverride.startsWith('claude-cli:')) {
    modelOverride = `claude-cli:${modelOverride}`
  }

  const annotatorNames = typeof args.annotator === 'string'
    ? args.annotator.split(',').map((s) => s.trim())
    : ['knowledge-type']

  const annotators: Annotator<unknown>[] = []
  for (const n of annotatorNames) {
    const factory = ANNOTATOR_REGISTRY[n]
    if (!factory) {
      console.error(`未知 annotator: ${n}. 可用: ${Object.keys(ANNOTATOR_REGISTRY).join(', ')}`)
      process.exit(2)
    }
    annotators.push(factory(modelOverride as string | undefined))
  }

  let treeIds: string[] = []
  if (args.all === true) {
    const entries = await readdir(TREES_DIR)
    treeIds = entries
      .filter((f) => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.'))
      .map((f) => f.replace(/\.json$/, ''))
  } else if (typeof args.tree === 'string') {
    treeIds = args.tree.split(',').map((s) => s.trim())
  } else {
    console.error('必须指定 --tree=<id>[,<id>,...] 或 --all')
    process.exit(2)
  }

  // claude-cli 走订阅，无需 API key；其他 provider 从 env 取
  let apiKey = ''
  let baseURL: string | undefined
  let llmCall: LLMCaller | undefined
  if (!dryRun) {
    if (provider === 'claude-cli') {
      llmCall = createClaudeCliCaller({ debug: Boolean(args.debug) })
    } else {
      const realModel = annotators[0]!.model
      const env = pickEnvKey(realModel)
      apiKey = env.apiKey
      baseURL = env.baseURL
    }
  }

  console.log(`[pipeline] provider: ${provider}`)
  console.log(`[pipeline] annotators: ${annotators.map((a) => `${a.name}@${a.version} (${a.model})`).join(', ')}`)
  console.log(`[pipeline] trees: ${treeIds.length} · concurrency: ${concurrency} · sample: ${sampleN ?? '全部'} · dry-run: ${dryRun} · force: ${force}`)

  // 加载所有 tree
  const trees: TextbookFullInfo[] = []
  const treePaths: string[] = []
  for (const id of treeIds) {
    const path = `${TREES_DIR}/${id}.json`
    try {
      const buf = await readFile(path, 'utf-8')
      trees.push(JSON.parse(buf) as TextbookFullInfo)
      treePaths.push(path)
    } catch (e) {
      console.error(`[pipeline] 跳过 ${id}: ${String(e)}`)
    }
  }

  const t0 = Date.now()
  let lastLog = 0
  const pipelineOpts: Parameters<typeof runPipeline>[0] = {
    trees,
    treePaths,
    annotators,
    apiKey,
    concurrency,
    dryRun,
    force,
    onProgress: ({ annotator, treeIndex, done, total }) => {
      const now = Date.now()
      if (now - lastLog > 1500 || done === total) {
        const treeId = treeIds[treeIndex]?.slice(0, 8) ?? '?'
        console.log(`  [${annotator}] tree=${treeId} ${done}/${total}`)
        lastLog = now
      }
    },
  }
  if (baseURL !== undefined) pipelineOpts.baseURL = baseURL
  if (sampleN !== undefined) pipelineOpts.sampleN = sampleN
  if (llmCall) pipelineOpts.llmCall = llmCall
  const stats: PipelineStats = await runPipeline(pipelineOpts)
  const elapsedMs = Date.now() - t0

  // checkpoint 更新（按 annotator+version 维度）
  if (!dryRun) {
    const cp = await loadCheckpoint()
    for (const a of annotators) {
      const key = `${a.name}@${a.version}`
      cp.byAnnotator[key] ??= {}
      for (const id of treeIds) {
        if ((stats.perAnnotator[a.name]?.failed ?? 0) === 0) {
          cp.byAnnotator[key]![id] = ['__complete__']
        }
      }
    }
    await saveCheckpoint(cp)
  }

  // 报告
  await mkdir(REPORT_DIR, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const reportPath = `${REPORT_DIR}/report-${ts}.json`
  await writeFile(
    reportPath,
    JSON.stringify({
      annotators: annotators.map((a) => ({ name: a.name, version: a.version, model: a.model })),
      treeIds,
      concurrency, dryRun, sampleN, force,
      elapsedMs,
      stats,
    }, null, 2),
    'utf-8',
  )
  console.log(`\n[pipeline] 报告: ${reportPath}`)
  console.log(`[pipeline] 总叶子: ${stats.totalLeaves} · 耗时: ${(elapsedMs / 1000).toFixed(1)}s`)
  for (const [name, s] of Object.entries(stats.perAnnotator)) {
    const promptTokens = Math.round(s.promptCharsTotal / 1.7)
    const completionTokens = Math.round(s.completionCharsTotal / 1.7)
    console.log(`\n[${name}]`)
    console.log(`  done=${s.succeeded}/${s.toRun} · skipped(已标)=${s.alreadyDone} · failed=${s.failed}`)
    console.log(`  avgConf=${s.avgConfidence.toFixed(2)} · lowConf(<0.5)=${s.lowConfidenceCount}`)
    console.log(`  tokens: in=${promptTokens.toLocaleString()} · out=${completionTokens.toLocaleString()}`)
    console.log(`  分布: ${JSON.stringify(s.valueDistribution)}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
