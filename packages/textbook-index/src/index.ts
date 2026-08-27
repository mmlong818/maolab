export { syncIndex } from './sync-lib.js'
export { syncTextbookBodyIndex } from './textbook-body-source.js'
export type { TextbookBodySource } from './textbook-body-source.js'
export { ocrTextbookBody, loadCachedBodyOcr, listLocalBodyPages } from './textbook-body-ocr.js'
export type {
  TextbookBodyOcr,
  TextbookBodyOcrPage,
  OcrTextbookBodyInput,
} from './textbook-body-ocr.js'
export { segmentTextbookBody, loadCachedSegments } from './textbook-body-segment.js'
export type {
  TextbookBodySegments,
  ChapterBodySegment,
  LeafForSegment,
  SegmentTextbookBodyInput,
} from './textbook-body-segment.js'
export { searchTextbooks, listFacets } from './search.js'
export {
  fetchTextbookFull,
  fetchAllTextbooks,
  flattenChapters,
  indexLessonsByChapter,
  pickSubResource,
  getLessonsForChapter,
} from './sync-trees.js'
export type { K12Stage, TextbookEntry, TextbookIndex, SearchQuery } from './types.js'
export type {
  Annotation,
  ChapterAnnotations,
  ChapterNode,
  KnowledgeType,
  NationalLesson,
  SubResource,
  SubResourceType,
  TextbookFullInfo,
} from './tree-types.js'
export {
  collectLeaves,
  indexLessonsByChapterId,
  inferStage,
  inferSubject,
  loadCheckpoint,
  runPipeline,
  saveCheckpoint,
} from './annotation-pipeline.js'
export type {
  AnnotationContext,
  AnnotationKey,
  AnnotationRunStats,
  Annotator,
  LeafWithPath,
  LLMCaller,
  PipelineCheckpoint,
  PipelineOptions,
  PipelineStats,
} from './annotation-pipeline.js'
export {
  createClaudeCliCaller,
  parseCliModel,
  tokenAccumulator,
} from './claude-cli-provider.js'
export type { ClaudeCliProviderOptions } from './claude-cli-provider.js'
export { createZhipuCaller, parseZhipuModel } from './zhipu-provider.js'
export { createQwenCaller } from './qwen-provider.js'
export {
  createKnowledgeTypeAnnotator,
  KNOWLEDGE_TYPES,
  KNOWLEDGE_TYPE_SYSTEM_PROMPT,
  KnowledgeTypeOutputSchema,
  buildKnowledgeTypePrompt,
  extractJSON as extractLabelJSON,
} from './annotators/knowledge-type.js'
export {
  createKnowledgePointExtractionAnnotator,
  KP_EXTRACTION_SYSTEM_PROMPT,
  KPDraftSchema,
  KPExtractionOutputSchema,
  buildKPExtractionPrompt,
} from './annotators/knowledge-point-extraction.js'
export type {
  KPDraft,
  EnrichedKPDraft,
  KPExtractionOutput,
  KnowledgePointExtractionAnnotatorOptions,
} from './annotators/knowledge-point-extraction.js'

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { TextbookIndex } from './types.js'
import type { TextbookFullInfo } from './tree-types.js'

export const DEFAULT_INDEX_PATH = 'data/textbook-index.json'
export const DEFAULT_TREES_DIR = 'data/textbook-trees'

export async function loadIndex(path = DEFAULT_INDEX_PATH): Promise<TextbookIndex> {
  const buf = await readFile(path, 'utf-8')
  return JSON.parse(buf) as TextbookIndex
}

export async function saveIndex(index: TextbookIndex, path = DEFAULT_INDEX_PATH): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  // 显式只写这三个字段:syncIndex 的返回值还带一个 rejectedVersions(Map),
  // 直接 stringify 会在索引文件里落下一个空对象 `{}`。
  const persisted: TextbookIndex = {
    moduleVersion: index.moduleVersion,
    syncedAt: index.syncedAt,
    entries: index.entries,
  }
  await writeFile(path, JSON.stringify(persisted, null, 2), 'utf-8')
}

/** 单本教材的完整信息(章节树 + 国家课资源)缓存读取,带内存缓存 */
const fullInfoCache = new Map<string, TextbookFullInfo>()
export async function loadFullInfo(
  textbookId: string,
  treesDir = DEFAULT_TREES_DIR,
): Promise<TextbookFullInfo | null> {
  const cached = fullInfoCache.get(textbookId)
  if (cached) return cached
  try {
    const buf = await readFile(`${treesDir}/${textbookId}.json`, 'utf-8')
    const info = JSON.parse(buf) as TextbookFullInfo
    fullInfoCache.set(textbookId, info)
    return info
  } catch {
    return null
  }
}

export function clearFullInfoCache(): void {
  fullInfoCache.clear()
}
