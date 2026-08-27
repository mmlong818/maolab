#!/usr/bin/env tsx
/**
 * 不调 LLM，仅扫描所有树、构造 prompt 字符串，统计：
 *   - 全量叶子节点数
 *   - 平均 prompt 字符数
 *   - 估算 token / 成本（按多个模型梯度）
 */
import { readdir, readFile } from 'node:fs/promises'
import {
  buildKnowledgeTypePrompt,
  collectLeaves,
  inferStage,
  inferSubject,
  indexLessonsByChapterId,
  KNOWLEDGE_TYPE_SYSTEM_PROMPT,
  type AnnotationContext,
  type TextbookFullInfo,
} from '../src/index.js'

const buildLabelPrompt = buildKnowledgeTypePrompt
const LABEL_SYSTEM_PROMPT = KNOWLEDGE_TYPE_SYSTEM_PROMPT
type LabelContext = AnnotationContext

const TREES_DIR = 'data/textbook-trees'

// 价格：USD per million tokens（公开标价，截至 2026-05）
const PRICING = {
  'claude-haiku-4-5': { input: 1.0, output: 5.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'gpt-5.4-mini': { input: 0.15, output: 0.6 },
  'gpt-5.4': { input: 2.5, output: 10.0 },
  'deepseek-v4-flash': { input: 0.14, output: 0.28 },
}

async function main() {
  const files = (await readdir(TREES_DIR)).filter(
    (f) => f.endsWith('.json') && !f.startsWith('_') && !f.startsWith('.'),
  )

  let totalLeaves = 0
  let leavesWithLesson = 0
  let totalPromptChars = 0
  const sysChars = LABEL_SYSTEM_PROMPT.length
  // 经验：完成约 80 字符（一行 JSON）
  const avgCompletionChars = 80
  const stageCount: Record<string, number> = {}
  const subjectCount: Record<string, number> = {}

  for (const f of files) {
    const tree = JSON.parse(await readFile(`${TREES_DIR}/${f}`, 'utf-8')) as TextbookFullInfo
    const subject = inferSubject(tree.textbookTitle)
    const stage = inferStage(tree.textbookTitle)
    stageCount[stage] = (stageCount[stage] ?? 0) + 1
    subjectCount[subject] = (subjectCount[subject] ?? 0) + 1
    const leaves = collectLeaves(tree.chapterTree)
    const lessonsIdx = indexLessonsByChapterId(tree.nationalLessons ?? [])
    for (const leaf of leaves) {
      const ctx: LabelContext = {
        chapterId: leaf.node.id,
        chapterTitle: leaf.node.title,
        subject,
        stage,
        ancestorTitles: leaf.ancestorTitles,
        linkedLessonTitles: lessonsIdx.get(leaf.node.id) ?? [],
        textbookTitle: tree.textbookTitle,
      }
      const p = buildLabelPrompt(ctx)
      totalPromptChars += sysChars + p.length
      totalLeaves++
      if (ctx.linkedLessonTitles.length > 0) leavesWithLesson++
    }
  }

  // 中文为主：~1.5 chars/token 偏紧，混合按 1.7 取中间
  const charsPerToken = 1.7
  const inputTokens = Math.round(totalPromptChars / charsPerToken)
  const outputTokens = Math.round((totalLeaves * avgCompletionChars) / charsPerToken)

  console.log('=== 全量打标成本估算 ===')
  console.log(`Trees: ${files.length}`)
  console.log(`总叶子节点: ${totalLeaves.toLocaleString()}`)
  console.log(`其中有国家课关联: ${leavesWithLesson.toLocaleString()} (${((leavesWithLesson / totalLeaves) * 100).toFixed(1)}%)`)
  console.log(`平均 prompt 字符: ${(totalPromptChars / totalLeaves).toFixed(0)} (含 system ${sysChars})`)
  console.log(`估算 input tokens: ${inputTokens.toLocaleString()}`)
  console.log(`估算 output tokens: ${outputTokens.toLocaleString()}`)
  console.log()
  console.log('按学段分布:', stageCount)
  console.log('按学科分布:', subjectCount)
  console.log()

  console.log('=== 各模型成本（USD）===')
  for (const [name, p] of Object.entries(PRICING)) {
    const cost = (inputTokens * p.input + outputTokens * p.output) / 1_000_000
    console.log(`  ${name.padEnd(22)} = $${cost.toFixed(2)}  (in=$${((inputTokens * p.input) / 1_000_000).toFixed(2)}  out=$${((outputTokens * p.output) / 1_000_000).toFixed(2)})`)
  }

  console.log()
  console.log('=== 时长估算（concurrency=5, 平均单次 ~2s）===')
  const totalSecondsSerial = totalLeaves * 2
  for (const c of [5, 10, 20]) {
    const minutes = totalSecondsSerial / c / 60
    console.log(`  并发 ${c}: ${minutes.toFixed(1)} 分钟 (${(minutes / 60).toFixed(1)} 小时)`)
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
