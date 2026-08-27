#!/usr/bin/env tsx
import { createQwenCaller } from '../src/qwen-provider.js'
import { createKnowledgePointExtractionAnnotator } from '../src/annotators/knowledge-point-extraction.js'
import type { AnnotationContext } from '../src/annotation-pipeline.js'

const apiKey = process.env.DASHSCOPE_API_KEY ?? ''
if (!apiKey) { console.error('DASHSCOPE_API_KEY 未设置'); process.exit(1) }

const llmCall = createQwenCaller(apiKey)
const model = 'qwen:qwen-plus'
const annotator = createKnowledgePointExtractionAnnotator({ model })

const CASES: Array<{ label: string; ctx: AnnotationContext }> = [
  {
    label: '多概念 — 力的合成和分解',
    ctx: {
      chapterId: 'q1', chapterTitle: '力的合成和分解', subject: '物理', stage: '高中',
      ancestorTitles: ['必修第一册', '第三章 相互作用'], linkedLessonTitles: [],
      textbookTitle: '人教版高中物理必修第一册',
      chapterBodyText: '合力与分力：如果一个力产生的效果与几个力共同作用产生的效果相同，这个力就叫做那几个力的合力，那几个力叫做这个力的分力。力的合成遵循平行四边形定则：以两个力为邻边作平行四边形，其对角线即为合力。力的分解是合成的逆运算，同样遵循平行四边形定则。分解时需根据力的实际作用效果确定分力方向，一个力可以分解为无数对分力，但按实际效果分解是唯一的。',
    },
  },
  {
    label: '敏感内容 — 鸦片战争（测内容过滤）',
    ctx: {
      chapterId: 'q2', chapterTitle: '鸦片战争', subject: '历史', stage: '初中',
      ancestorTitles: ['八年级上册', '第一单元 中国开始沦为半殖民地半封建社会'], linkedLessonTitles: [],
      textbookTitle: '人教版历史八年级上册',
      chapterBodyText: '1840年，英国发动鸦片战争。清政府战败，被迫签订《南京条约》：割让香港岛给英国，赔款2100万银元，开放五个通商口岸，协定关税。鸦片战争是中国近代史的开端，中国开始沦为半殖民地半封建社会。',
    },
  },
  {
    label: '化学 — 酸碱盐',
    ctx: {
      chapterId: 'q3', chapterTitle: '酸和碱的中和反应', subject: '化学', stage: '初中',
      ancestorTitles: ['九年级下册', '第十单元 酸和碱'], linkedLessonTitles: [],
      textbookTitle: '人教版化学九年级下册',
      chapterBodyText: '中和反应：酸与碱作用生成盐和水的反应叫做中和反应。例如：盐酸与氢氧化钠反应：HCl + NaOH → NaCl + H₂O。中和反应是放热反应。中和反应在实际生活中有广泛应用：用熟石灰改良酸性土壤、用苏打或小苏打治疗胃酸过多、工厂废水用碱处理等。',
    },
  },
]

for (const { label, ctx } of CASES) {
  const t = Date.now()
  try {
    const r = await annotator.annotate(ctx, { apiKey: '', llmCall, model })
    const elapsed = ((Date.now() - t) / 1000).toFixed(1)
    console.log(`\n【${label}】 ${elapsed}s  KP=${r.annotation.value.length}`)
    r.annotation.value.forEach(k => console.log(`  • ${k.canonicalName} | ${k.canonicalNameEn} | conf=${k.confidence}`))
  } catch (e) {
    console.error(`\n【${label}】 ERROR: ${(e as Error).message.slice(0, 200)}`)
  }
}
