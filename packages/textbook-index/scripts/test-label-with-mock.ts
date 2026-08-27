#!/usr/bin/env tsx
/**
 * Mock LLM 端到端测试，验证 Annotator pipeline：
 *   - 叶子节点正确识别
 *   - annotations.knowledgeType 字段正确写回
 *   - .bak 自动生成
 *   - 统计/分布正确
 *   - 重跑（version 不变）会被 skipExisting 跳过
 */
import { readFile, unlink, access, copyFile } from 'node:fs/promises'
import {
  createKnowledgeTypeAnnotator,
  runPipeline,
  type TextbookFullInfo,
} from '../src/index.js'

const TARGET = 'data/textbook-trees/4bf136c9-43cc-4005-8c8b-b21d21bad96f.json'

async function main() {
  const snapshot = TARGET + '.test-snapshot'
  await copyFile(TARGET, snapshot)
  try {
    let callCount = 0
    const types = ['factual', 'conceptual', 'procedural', 'metacognitive']
    const mockLLM = async (_args: { prompt: string }): Promise<string> => {
      callCount++
      const t = types[callCount % 4]
      return JSON.stringify({
        knowledgeType: t,
        confidence: 0.7 + (callCount % 3) * 0.1,
        reasoning: `mock #${callCount}`,
      })
    }

    const tree = JSON.parse(await readFile(TARGET, 'utf-8')) as TextbookFullInfo
    const annotator = createKnowledgeTypeAnnotator({ model: 'mock:mock' })

    const stats = await runPipeline({
      trees: [tree],
      treePaths: [TARGET],
      annotators: [annotator],
      apiKey: 'mock',
      concurrency: 5,
      sampleN: 8,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llmCall: mockLLM as any,
    })

    console.log('stats:', JSON.stringify(stats, null, 2))

    const written = JSON.parse(await readFile(TARGET, 'utf-8'))
    let labeled = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function walk(n: any[]) {
      for (const c of n) {
        if (c.annotations?.knowledgeType?.value) labeled++
        if (c.child_nodes) walk(c.child_nodes)
      }
    }
    walk(written.chapterTree)
    console.log(`written labeled chapters: ${labeled}`)

    // 第二次跑：版本相同，应全部 skip
    const tree2 = JSON.parse(await readFile(TARGET, 'utf-8')) as TextbookFullInfo
    const stats2 = await runPipeline({
      trees: [tree2],
      treePaths: [TARGET],
      annotators: [annotator],
      apiKey: 'mock',
      concurrency: 5,
      sampleN: 8,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      llmCall: mockLLM as any,
    })
    console.log('rerun stats (应全 skip):', JSON.stringify(stats2.perAnnotator, null, 2))

    try { await access(TARGET + '.bak'); console.log('.bak 已生成 ✓') }
    catch { console.log('.bak 缺失 ✗') }
  } finally {
    await copyFile(snapshot, TARGET)
    await unlink(snapshot)
    await unlink(TARGET + '.bak').catch(() => {})
    console.log('已还原')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
