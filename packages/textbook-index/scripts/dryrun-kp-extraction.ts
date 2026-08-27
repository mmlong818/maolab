#!/usr/bin/env tsx
/**
 * KP 抽取 annotator v0.1.0 — 小样本 dry-run 验证
 *
 * 目标：在不写 DB、不写回 tree JSON 的前提下，调 LLM 3 次，验证
 *   - claude-cli provider 可用
 *   - LLM 输出能通过 KPExtractionOutputSchema 校验
 *   - v1.1 schema 能否容纳复合 / 单一 / 极短 三种叶子形态
 *
 * 用法：
 *   pnpm tsx packages/textbook-index/scripts/dryrun-kp-extraction.ts \
 *     --tree=12eed579-1883-4b7c-b543-3bac585a4f16 \
 *     --leaves=e9c61aab-fc16-3804-8aac-9d30a5717689,5f07e265-f85b-353c-ad40-179e10928b32,8731fa65-7b89-3135-a168-f0a16165190b
 */

import { readFile } from 'node:fs/promises'
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
  leaves: string[]
  model: string
}

function parseArgs(argv: string[]): CliArgs {
  const out: Record<string, string> = {}
  for (const a of argv) {
    if (!a.startsWith('--')) continue
    const eq = a.indexOf('=')
    if (eq < 0) out[a.slice(2)] = 'true'
    else out[a.slice(2, eq)] = a.slice(eq + 1)
  }
  const tree = out.tree
  const leavesRaw = out.leaves
  if (!tree || !leavesRaw) {
    console.error('用法: --tree=<id> --leaves=<id1>,<id2>,<id3> [--model=claude-cli:haiku]')
    process.exit(2)
  }
  return {
    tree,
    leaves: leavesRaw.split(',').map((s) => s.trim()).filter(Boolean),
    model: out.model ?? 'claude-cli:haiku',
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  const path = `${TREES_DIR}/${args.tree}.json`
  const tree = JSON.parse(await readFile(path, 'utf-8')) as TextbookFullInfo

  const subject = inferSubject(tree.textbookTitle)
  const stage = inferStage(tree.textbookTitle)
  const allLeaves = collectLeaves(tree.chapterTree)
  const lessonsIdx = indexLessonsByChapterId(tree.nationalLessons ?? [])

  const targets = args.leaves.map((id) => {
    const found = allLeaves.find((l) => l.node.id === id)
    if (!found) {
      throw new Error(`叶子 ${id} 不在该 tree 中（共 ${allLeaves.length} 个叶子）`)
    }
    return found
  })

  console.log(`[dryrun-kp] tree: ${tree.textbookTitle}`)
  console.log(`[dryrun-kp] subject=${subject} stage=${stage}`)
  console.log(`[dryrun-kp] targets: ${targets.length} 个叶子`)
  console.log(`[dryrun-kp] model: ${args.model}`)
  console.log('')

  const annotator = createKnowledgePointExtractionAnnotator({ model: args.model })
  const llmCall = createClaudeCliCaller({ debug: false, timeoutMs: 180_000 })

  let passed = 0
  let failed = 0

  for (let i = 0; i < targets.length; i++) {
    const leaf = targets[i]!
    const ctx: AnnotationContext = {
      chapterId: leaf.node.id,
      chapterTitle: leaf.node.title,
      subject,
      stage,
      ancestorTitles: leaf.ancestorTitles,
      linkedLessonTitles: lessonsIdx.get(leaf.node.id) ?? [],
      textbookTitle: tree.textbookTitle,
    }

    console.log(`\n===== [${i + 1}/${targets.length}] ${leaf.node.id} · "${leaf.node.title}" =====`)
    console.log(`  path: ${leaf.ancestorTitles.join(' › ')}`)
    console.log(`  linked lessons: ${ctx.linkedLessonTitles.length}`)

    const t0 = Date.now()
    try {
      const { annotation, stats } = await annotator.annotate(ctx, {
        apiKey: '',
        llmCall,
        model: annotator.model,
      })
      const elapsedMs = Date.now() - t0
      passed++
      console.log(`  ✓ PARSED in ${(elapsedMs / 1000).toFixed(1)}s · prompt=${stats.promptChars} chars · completion=${stats.completionChars} chars`)
      console.log(`  leafConfidence: ${annotation.confidence?.toFixed(2)}`)
      console.log(`  leafReasoning: ${annotation.reasoning}`)
      const kps = annotation.value as Array<{
        canonicalName: string
        canonicalNameEn: string
        confidence: number
        subject: string
        curriculumSystem: string
        gradeBand?: string
        aliases: string[]
        dimensions: {
          knowledgeType: { value: string }
          difficulty: { value: number }
          learningObjectives: { value: string[] }
        }
      }>
      console.log(`  KP count: ${kps.length}`)
      kps.forEach((kp, idx) => {
        console.log(`    [${idx + 1}] ${kp.canonicalName} (${kp.canonicalNameEn})`)
        console.log(`        confidence=${kp.confidence.toFixed(2)} · kt=${kp.dimensions.knowledgeType.value} · diff=${kp.dimensions.difficulty.value.toFixed(2)}`)
        console.log(`        ctx: subject=${kp.subject} system=${kp.curriculumSystem} gradeBand=${kp.gradeBand ?? '-'}`)
        console.log(`        aliases=${JSON.stringify(kp.aliases)}`)
        console.log(`        objectives: ${kp.dimensions.learningObjectives.value.join(' / ')}`)
      })
    } catch (err) {
      failed++
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  ✗ FAILED: ${msg.slice(0, 800)}`)
      const raw = (globalThis as { __lastKpRaw?: string }).__lastKpRaw
      if (raw) {
        console.log(`  --- raw response (first 800 chars) ---`)
        console.log(raw.slice(0, 800))
        console.log(`  --- end raw ---`)
      }
    }
  }

  console.log(`\n[dryrun-kp] DONE · passed=${passed}/${targets.length} · failed=${failed}`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
