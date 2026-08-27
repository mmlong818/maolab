#!/usr/bin/env tsx
/**
 * KP 抽取 annotator v0.1.1 — 全量 dry-run（pilot：单本教材所有叶子）
 *
 * 严格边界：
 *   - 不写 DB / 不写回 tree JSON / 不 commit / 不接 DB
 *   - 失败不重试（第一遍数据信息量最大）
 *
 * 用法：
 *   pnpm tsx packages/textbook-index/scripts/dryrun-kp-extraction-full.ts \
 *     --tree=12eed579-1883-4b7c-b543-3bac585a4f16 \
 *     [--concurrency=3] [--model=claude-cli:haiku]
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import {
  collectLeaves,
  createClaudeCliCaller,
  createKnowledgePointExtractionAnnotator,
  inferStage,
  inferSubject,
  indexLessonsByChapterId,
  type AnnotationContext,
  type TextbookFullInfo,
} from '../src/index.js'

const TREES_DIR = 'data/textbook-trees'

interface CliArgs {
  tree: string
  model: string
  concurrency: number
  reportPath: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: Record<string, string> = {}
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq < 0) out[a.slice(2)] = 'true'
    else out[a.slice(2, eq)] = a.slice(eq + 1)
  }
  if (!out.tree) {
    console.error('用法: --tree=<id> [--concurrency=3] [--model=claude-cli:haiku] [--report=<path>]')
    process.exit(2)
  }
  return {
    tree: out.tree,
    model: out.model ?? 'claude-cli:haiku',
    concurrency: Math.max(1, parseInt(out.concurrency ?? '3', 10) || 3),
    reportPath: out.report ?? 'docs/pilot-reports/pilot-physics-grade10-vol1.md',
  }
}

interface LeafResult {
  leafId: string
  title: string
  path: string
  promptChars?: number
  completionChars?: number
  elapsedMs: number
  zodPassed: boolean
  errorMsg?: string
  rawSnippet?: string
  leafConfidence?: number
  leafReasoning?: string
  kps: Array<{
    canonicalName: string
    canonicalNameEn: string
    confidence: number
    knowledgeType: string
    difficulty: number
    aliases: string[]
    objectives: string[]
  }>
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0
  const s = [...nums].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 1 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}
function mean(nums: number[]): number {
  if (nums.length === 0) return 0
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const path = `${TREES_DIR}/${args.tree}.json`
  const tree = JSON.parse(await readFile(path, 'utf-8')) as TextbookFullInfo

  const subject = inferSubject(tree.textbookTitle)
  const stage = inferStage(tree.textbookTitle)
  const allLeaves = collectLeaves(tree.chapterTree)
  const lessonsIdx = indexLessonsByChapterId(tree.nationalLessons ?? [])

  console.log(`[dryrun-kp-full] tree: ${tree.textbookTitle}`)
  console.log(`[dryrun-kp-full] subject=${subject} stage=${stage}`)
  console.log(`[dryrun-kp-full] total leaves: ${allLeaves.length}`)
  console.log(`[dryrun-kp-full] concurrency: ${args.concurrency}`)
  console.log(`[dryrun-kp-full] model: ${args.model}`)
  console.log('')

  const annotator = createKnowledgePointExtractionAnnotator({ model: args.model })
  const llmCall = createClaudeCliCaller({ debug: false, timeoutMs: 180_000 })

  const results: LeafResult[] = new Array(allLeaves.length)
  const startAll = Date.now()
  let nextIdx = 0
  let completed = 0

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const i = nextIdx++
      if (i >= allLeaves.length) return
      const leaf = allLeaves[i]!
      const ctx: AnnotationContext = {
        chapterId: leaf.node.id,
        chapterTitle: leaf.node.title,
        subject,
        stage,
        ancestorTitles: leaf.ancestorTitles,
        linkedLessonTitles: lessonsIdx.get(leaf.node.id) ?? [],
        textbookTitle: tree.textbookTitle,
      }
      const t0 = Date.now()
      const rec: LeafResult = {
        leafId: leaf.node.id,
        title: leaf.node.title,
        path: leaf.ancestorTitles.join(' › '),
        elapsedMs: 0,
        zodPassed: false,
        kps: [],
      }
      try {
        const { annotation, stats } = await annotator.annotate(ctx, {
          apiKey: '',
          llmCall,
          model: annotator.model,
        })
        rec.elapsedMs = Date.now() - t0
        rec.zodPassed = true
        if (stats.promptChars !== undefined) rec.promptChars = stats.promptChars
        if (stats.completionChars !== undefined) rec.completionChars = stats.completionChars
        if (annotation.confidence !== undefined) rec.leafConfidence = annotation.confidence
        if (annotation.reasoning !== undefined) rec.leafReasoning = annotation.reasoning
        const kps = annotation.value as Array<{
          canonicalName: string
          canonicalNameEn: string
          confidence: number
          aliases: string[]
          dimensions: {
            knowledgeType: { value: string }
            difficulty: { value: number }
            learningObjectives: { value: string[] }
          }
        }>
        rec.kps = kps.map((k) => ({
          canonicalName: k.canonicalName,
          canonicalNameEn: k.canonicalNameEn,
          confidence: k.confidence,
          knowledgeType: k.dimensions.knowledgeType.value,
          difficulty: k.dimensions.difficulty.value,
          aliases: k.aliases,
          objectives: k.dimensions.learningObjectives.value,
        }))
      } catch (err) {
        rec.elapsedMs = Date.now() - t0
        rec.zodPassed = false
        rec.errorMsg = err instanceof Error ? err.message : String(err)
        const raw = (globalThis as { __lastKpRaw?: string }).__lastKpRaw
        if (raw) rec.rawSnippet = raw.slice(0, 500)
      }
      results[i] = rec
      completed++
      const tag = rec.zodPassed ? 'OK ' : 'FAIL'
      console.log(
        `[${tag}] (${completed}/${allLeaves.length}) w${workerId} ` +
          `${(rec.elapsedMs / 1000).toFixed(1)}s · kps=${rec.kps.length} · ${leaf.node.title}`,
      )
    }
  }

  await Promise.all(
    Array.from({ length: args.concurrency }, (_, k) => worker(k + 1)),
  )

  const totalMs = Date.now() - startAll
  await writeReport(args, tree, allLeaves.length, results, totalMs)
}

async function writeReport(
  args: CliArgs,
  tree: TextbookFullInfo,
  totalLeaves: number,
  results: LeafResult[],
  totalMs: number,
): Promise<void> {
  const passed = results.filter((r) => r.zodPassed)
  const failed = results.filter((r) => !r.zodPassed)
  const passRate = (passed.length / totalLeaves) * 100

  // KP 切分分布
  const histKpCount = { '0': 0, '1': 0, '2': 0, '3': 0, '4+': 0 }
  for (const r of passed) {
    const n = r.kps.length
    if (n === 0) histKpCount['0']++
    else if (n === 1) histKpCount['1']++
    else if (n === 2) histKpCount['2']++
    else if (n === 3) histKpCount['3']++
    else histKpCount['4+']++
  }
  const kpCounts = passed.map((r) => r.kps.length)
  const avgKpPerLeaf = mean(kpCounts)
  const medianKpPerLeaf = median(kpCounts)

  // confidence
  const allKps = passed.flatMap((r) => r.kps)
  const confs = allKps.map((k) => k.confidence)
  const confMean = mean(confs)
  const confMedian = median(confs)
  const lowestLeafConf = [...passed]
    .filter((r) => typeof r.leafConfidence === 'number')
    .sort((a, b) => (a.leafConfidence! - b.leafConfidence!))
    .slice(0, 5)

  // knowledgeType
  const ktDist: Record<string, number> = { factual: 0, conceptual: 0, procedural: 0, metacognitive: 0 }
  for (const k of allKps) ktDist[k.knowledgeType] = (ktDist[k.knowledgeType] ?? 0) + 1
  const ktTotal = allKps.length || 1

  // difficulty
  const diffBuckets = { '0.0-0.2': 0, '0.2-0.4': 0, '0.4-0.6': 0, '0.6-0.8': 0, '0.8-1.0': 0 }
  for (const k of allKps) {
    const d = k.difficulty
    if (d < 0.2) diffBuckets['0.0-0.2']++
    else if (d < 0.4) diffBuckets['0.2-0.4']++
    else if (d < 0.6) diffBuckets['0.4-0.6']++
    else if (d < 0.8) diffBuckets['0.6-0.8']++
    else diffBuckets['0.8-1.0']++
  }

  // 可疑切分启发
  const suspects: Array<{ leafId: string; title: string; reason: string; kpCount: number }> = []
  for (const r of passed) {
    const titleLen = r.title.length
    if (r.kps.length === 0) {
      suspects.push({ leafId: r.leafId, title: r.title, reason: '切分为 0 KP', kpCount: 0 })
    }
    if (r.kps.length >= 4) {
      suspects.push({ leafId: r.leafId, title: r.title, reason: `切分为 ${r.kps.length} KP（偏多）`, kpCount: r.kps.length })
    }
    // 复合叶子（标题含空格或顿号或"和"）但只切了 1 KP
    const looksComposite = /[ 　、和与]/.test(r.title.replace(/^\d+\.?/, '').trim())
    if (looksComposite && r.kps.length === 1) {
      suspects.push({ leafId: r.leafId, title: r.title, reason: '标题看起来是复合叶子但只切了 1 KP', kpCount: 1 })
    }
    // 极短叶子但 leafConfidence > 0.4
    if (titleLen < 8 && (r.leafConfidence ?? 0) > 0.4) {
      suspects.push({
        leafId: r.leafId, title: r.title, reason: `极短标题但 leafConfidence=${r.leafConfidence?.toFixed(2)}`, kpCount: r.kps.length,
      })
    }
  }

  // canonicalNameEn 抽样
  const sampleEn: Array<{ zh: string; en: string }> = []
  const shuffled = [...allKps].sort(() => Math.random() - 0.5)
  for (const k of shuffled.slice(0, 10)) sampleEn.push({ zh: k.canonicalName, en: k.canonicalNameEn })

  const avgPerLeafMs = totalMs / totalLeaves

  // ---- 构建 markdown ----
  const lines: string[] = []
  lines.push(`# Pilot Report — KP 抽取 v0.1.1 全量 dry-run`)
  lines.push(``)
  lines.push(`- **教材**: ${tree.textbookTitle}`)
  lines.push(`- **tree id**: \`${args.tree}\``)
  lines.push(`- **annotator**: KnowledgePointExtractionAnnotator v0.1.1`)
  lines.push(`- **model**: ${args.model}`)
  lines.push(`- **concurrency**: ${args.concurrency}`)
  lines.push(`- **生成时间**: ${new Date().toISOString()}`)
  lines.push(``)

  lines.push(`## 1. 教材与叶子规模`)
  lines.push(``)
  lines.push(`- 实际叶子数: **${totalLeaves}**`)
  lines.push(``)

  lines.push(`## 2. zod 通过率`)
  lines.push(``)
  lines.push(`- 通过 / 总数 = **${passed.length} / ${totalLeaves} = ${passRate.toFixed(1)}%**`)
  lines.push(`- 失败: ${failed.length}`)
  lines.push(``)

  lines.push(`## 3. KP 切分分布（直方图，仅通过的叶子）`)
  lines.push(``)
  lines.push(`| KP 数 | 叶子数 |`)
  lines.push(`|---|---|`)
  for (const [k, v] of Object.entries(histKpCount)) lines.push(`| ${k} | ${v} |`)
  lines.push(``)
  lines.push(`- 平均每叶子 KP 数: **${avgKpPerLeaf.toFixed(2)}**`)
  lines.push(`- 中位数: **${medianKpPerLeaf}**`)
  lines.push(`- 通过的叶子总 KP 数: **${allKps.length}**`)
  lines.push(``)

  lines.push(`## 4. confidence 分布`)
  lines.push(``)
  lines.push(`- KP 级 confidence 均值: **${confMean.toFixed(3)}** · 中位数: **${confMedian.toFixed(3)}**`)
  lines.push(``)
  lines.push(`**最低 leafConfidence 的 5 个叶子：**`)
  lines.push(``)
  lines.push(`| leafId | title | leafConfidence |`)
  lines.push(`|---|---|---|`)
  for (const r of lowestLeafConf) {
    lines.push(`| \`${r.leafId.slice(0, 8)}\` | ${r.title} | ${r.leafConfidence!.toFixed(2)} |`)
  }
  lines.push(``)

  lines.push(`## 5. knowledgeType 分布`)
  lines.push(``)
  lines.push(`| type | count | pct |`)
  lines.push(`|---|---|---|`)
  for (const [k, v] of Object.entries(ktDist)) {
    lines.push(`| ${k} | ${v} | ${((v / ktTotal) * 100).toFixed(1)}% |`)
  }
  lines.push(``)

  lines.push(`## 6. difficulty 分布`)
  lines.push(``)
  lines.push(`| range | count |`)
  lines.push(`|---|---|`)
  for (const [k, v] of Object.entries(diffBuckets)) lines.push(`| ${k} | ${v} |`)
  lines.push(``)

  lines.push(`## 7. zod 失败案例`)
  lines.push(``)
  if (failed.length === 0) {
    lines.push(`无 ✓`)
  } else {
    for (const r of failed) {
      lines.push(`### ${r.title} (\`${r.leafId.slice(0, 8)}\`)`)
      lines.push(``)
      lines.push(`- path: ${r.path}`)
      lines.push(`- 错误: \`${(r.errorMsg ?? '').slice(0, 600)}\``)
      if (r.rawSnippet) {
        lines.push(``)
        lines.push(`\`\`\`text`)
        lines.push(r.rawSnippet)
        lines.push(`\`\`\``)
      }
      lines.push(``)
    }
  }

  lines.push(`## 8. 可疑切分案例（启发式）`)
  lines.push(``)
  if (suspects.length === 0) lines.push(`无明显可疑案例。`)
  else {
    lines.push(`| leafId | title | kpCount | reason |`)
    lines.push(`|---|---|---|---|`)
    for (const s of suspects) {
      lines.push(`| \`${s.leafId.slice(0, 8)}\` | ${s.title} | ${s.kpCount} | ${s.reason} |`)
    }
  }
  lines.push(``)

  lines.push(`## 9. canonicalNameEn 抽样（随机 10 个）`)
  lines.push(``)
  lines.push(`| canonicalName (zh) | canonicalNameEn |`)
  lines.push(`|---|---|`)
  for (const s of sampleEn) lines.push(`| ${s.zh} | ${s.en} |`)
  lines.push(``)

  lines.push(`## 10. 耗时`)
  lines.push(``)
  lines.push(`- 总耗时: **${(totalMs / 1000).toFixed(1)}s** (${(totalMs / 60000).toFixed(2)} min)`)
  lines.push(`- 平均每叶子: **${(avgPerLeafMs / 1000).toFixed(1)}s**`)
  lines.push(``)

  // 准入判断
  const goPassRate = passRate >= 95
  const seriousSuspectCount = suspects.filter((s) => s.reason.startsWith('切分为 0 KP') || s.reason.includes('偏多')).length
  const goSuspect = seriousSuspectCount <= 3

  lines.push(`## 11. 进入 PR2 实施的准入判断`)
  lines.push(``)
  lines.push(`- zod 通过率 ≥ 95%: **${goPassRate ? 'YES' : 'NO'}** (实际 ${passRate.toFixed(1)}%)`)
  lines.push(`- 严重切分错误 ≤ 3: **${goSuspect ? 'YES' : 'NO'}** (实际 ${seriousSuspectCount})`)
  lines.push(``)
  let decision: string
  if (goPassRate && goSuspect) decision = '**GO** — 进入 PR2 实施'
  else if (passRate >= 80) decision = '**调 prompt 再 dry-run** — schema 没崩，但质量需提升'
  else decision = '**NO-GO** — schema/prompt 需重大修正'
  lines.push(`### 决策: ${decision}`)
  lines.push(``)

  lines.push(`## 附录 A — 全叶子结果一览`)
  lines.push(``)
  lines.push(`| # | leafId | title | zod | kpCount | leafConf | elapsed(s) |`)
  lines.push(`|---|---|---|---|---|---|---|`)
  results.forEach((r, i) => {
    lines.push(
      `| ${i + 1} | \`${r.leafId.slice(0, 8)}\` | ${r.title} | ${r.zodPassed ? 'OK' : 'FAIL'} | ${r.kps.length} | ${r.leafConfidence?.toFixed(2) ?? '-'} | ${(r.elapsedMs / 1000).toFixed(1)} |`,
    )
  })
  lines.push(``)

  const reportFull = lines.join('\n')
  await mkdir(dirname(args.reportPath), { recursive: true })
  await writeFile(args.reportPath, reportFull, 'utf-8')
  console.log(`\n[dryrun-kp-full] report written: ${args.reportPath}`)
  console.log(`[dryrun-kp-full] DONE · passed=${passed.length}/${totalLeaves} · failed=${failed.length} · totalMs=${totalMs}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
