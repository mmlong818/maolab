/**
 * 历史入口的兼容层——保留旧 API 名称指向新 Annotator pipeline。
 * 新代码请直接用 `annotation-pipeline.ts` + `annotators/knowledge-type.ts`。
 */
export {
  collectLeaves,
  indexLessonsByChapterId,
  inferStage,
  inferSubject,
  loadCheckpoint,
  saveCheckpoint,
  runPipeline,
} from './annotation-pipeline.js'
export type {
  AnnotationContext,
  Annotator,
  LeafWithPath,
  LLMCaller,
  PipelineCheckpoint,
  PipelineOptions,
  PipelineStats,
} from './annotation-pipeline.js'
export {
  createKnowledgeTypeAnnotator,
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_SYSTEM_PROMPT,
  KnowledgeTypeOutputSchema,
  buildKnowledgeTypePrompt,
  extractJSON,
} from './annotators/knowledge-type.js'
