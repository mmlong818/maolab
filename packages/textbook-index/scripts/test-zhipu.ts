#!/usr/bin/env tsx
import { createZhipuCaller } from '../src/zhipu-provider.js'
import { createKnowledgePointExtractionAnnotator } from '../src/annotators/knowledge-point-extraction.js'

const apiKey = process.env.ZHIPU_API_KEY ?? ''
if (!apiKey) { console.error('ZHIPU_API_KEY 未设置'); process.exit(1) }

const llmCall = createZhipuCaller(apiKey)
const annotator = createKnowledgePointExtractionAnnotator({ model: 'zhipu:glm-5-turbo' })

const ctx = {
  chapterId: 'test-001',
  chapterTitle: '自由落体运动',
  subject: '物理',
  stage: '高中',
  ancestorTitles: ['必修第一册', '第四章 运动和力的关系'],
  linkedLessonTitles: [],
  textbookTitle: '人教版高中物理必修第一册',
  chapterBodyText: '自由落体运动是指物体只在重力作用下从静止开始的下落运动。伽利略通过实验证明，在忽略空气阻力的情况下，重的物体和轻的物体下落一样快。自由落体运动是匀加速直线运动，加速度g≈9.8m/s²。速度公式：v=gt，位移公式：h=½gt²。',
}

try {
  console.log('调用中...')
  const result = await annotator.annotate(ctx, { apiKey: '', llmCall, model: 'zhipu:glm-5-turbo' })
  console.log('✓ KP 数量:', result.annotation.value.length)
  for (const kp of result.annotation.value) {
    console.log(' •', kp.canonicalName, '|', kp.canonicalNameEn, '| conf=', kp.confidence)
  }
} catch (e) {
  console.error('✗ ERROR:', e instanceof Error ? e.message : String(e))
}
