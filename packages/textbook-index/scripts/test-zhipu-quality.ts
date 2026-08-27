#!/usr/bin/env tsx
/**
 * 对比 glm-5.1 vs glm-5-turbo 质量：3 个典型 leaf
 */
import { createZhipuCaller } from '../src/zhipu-provider.js'
import { createKnowledgePointExtractionAnnotator } from '../src/annotators/knowledge-point-extraction.js'
import type { AnnotationContext } from '../src/annotation-pipeline.js'

const apiKey = process.env.ZHIPU_API_KEY ?? ''
if (!apiKey) { console.error('ZHIPU_API_KEY 未设置'); process.exit(1) }

const llmCall = createZhipuCaller(apiKey)

const LEAVES: Array<{ label: string; ctx: AnnotationContext }> = [
  {
    label: '单概念 — 自由落体运动（物理高中）',
    ctx: {
      chapterId: 'leaf-001',
      chapterTitle: '自由落体运动',
      subject: '物理', stage: '高中',
      ancestorTitles: ['必修第一册', '第四章 运动和力的关系'],
      linkedLessonTitles: [],
      textbookTitle: '人教版高中物理必修第一册',
      chapterBodyText: '自由落体运动是指物体只在重力作用下从静止开始的下落运动。伽利略通过实验证明，在忽略空气阻力的情况下，重的物体和轻的物体下落一样快。自由落体运动是匀加速直线运动，加速度g≈9.8m/s²。速度公式：v=gt，位移公式：h=½gt²。竖直上抛运动可视为反向的自由落体运动叠加，利用对称性分析运动过程。',
    },
  },
  {
    label: '多概念 — 力的合成和分解（物理高中）',
    ctx: {
      chapterId: 'leaf-002',
      chapterTitle: '力的合成和分解',
      subject: '物理', stage: '高中',
      ancestorTitles: ['必修第一册', '第三章 相互作用'],
      linkedLessonTitles: [],
      textbookTitle: '人教版高中物理必修第一册',
      chapterBodyText: '合力与分力：如果一个力产生的效果与几个力共同作用产生的效果相同，这个力就叫做那几个力的合力，那几个力叫做这个力的分力。力的合成遵循平行四边形定则：以两个力为邻边作平行四边形，其对角线即为合力。力的分解是合成的逆运算，同样遵循平行四边形定则。分解时需根据力的实际作用效果确定分力方向，一个力可以分解为无数对分力，但按实际效果分解是唯一的。',
    },
  },
  {
    label: '实验类 — 探究牛顿第二定律（物理高中）',
    ctx: {
      chapterId: 'leaf-003',
      chapterTitle: '实验：探究加速度与力、质量的关系',
      subject: '物理', stage: '高中',
      ancestorTitles: ['必修第一册', '第四章 运动和力的关系'],
      linkedLessonTitles: [],
      textbookTitle: '人教版高中物理必修第一册',
      chapterBodyText: '实验目的：探究加速度与力、质量的关系，验证牛顿第二定律。实验器材：打点计时器、小车、砝码盘、细线、长木板等。控制变量法：保持质量不变，改变力（砝码个数）；保持力不变，改变质量（改变小车上砝码）。误差分析：砝码质量远小于小车质量时，砝码重力约等于绳的拉力；补偿摩擦力需倾斜轨道。',
    },
  },
]

async function testModel(model: string): Promise<void> {
  const annotator = createKnowledgePointExtractionAnnotator({ model })
  console.log(`\n${'='.repeat(60)}`)
  console.log(`模型: ${model}`)
  console.log('='.repeat(60))
  const t0 = Date.now()
  for (const { label, ctx } of LEAVES) {
    const t1 = Date.now()
    try {
      const res = await annotator.annotate(ctx, { apiKey: '', llmCall, model })
      const elapsed = ((Date.now() - t1) / 1000).toFixed(1)
      console.log(`\n【${label}】 ${elapsed}s`)
      for (const kp of res.annotation.value) {
        console.log(`  • ${kp.canonicalName} | ${kp.canonicalNameEn} | conf=${kp.confidence} | type=${kp.dimensions.knowledgeType.value}`)
      }
      if (res.annotation.value.length === 0) console.log('  （输出 0 KP）')
    } catch (e) {
      console.error(`  ✗ ERROR: ${e instanceof Error ? e.message.slice(0, 200) : e}`)
    }
  }
  console.log(`\n总耗时: ${((Date.now() - t0) / 1000).toFixed(1)}s`)
}

await testModel('zhipu:glm-5.1')
await testModel('zhipu:glm-5-turbo')
