import { createDb, createStageRepository, createContentUnitRepository, createProgramRepository } from '@maolab/db'
import { callLLM } from './llm/client.js'
import { KnowledgeProfileExtractor } from './knowledge/extractor.js'
import { WorkerRegistry } from './workers/registry.js'
import { SlideWorker } from './workers/slide-worker.js'
import { QuizWorker } from './workers/quiz-worker.js'
import { InteractiveWorker } from './workers/interactive-worker.js'
import { HotspotWorker } from './workers/hotspot-worker.js'
import { ComparisonWorker } from './workers/comparison-worker.js'
import { DragDropWorker } from './workers/drag-drop-worker.js'
import { ClozeWorker } from './workers/cloze-worker.js'
import { AnimationWorker } from './workers/animation-worker.js'
import { BranchingWorker } from './workers/branching-worker.js'
import { Model3dWorker } from './workers/model3d-worker.js'
import { ImageWorker } from './workers/image-worker.js'
import { GenerationPipeline } from './pipeline/generation-pipeline.js'
import type { GeneratorConfig } from './types.js'
import type { RetryOptions } from './llm/validated-generate.js'

export { GenerationPipeline } from './pipeline/generation-pipeline.js'
export { WorkerRegistry } from './workers/registry.js'
export { KnowledgeProfileExtractor } from './knowledge/extractor.js'
export { SlideWorker } from './workers/slide-worker.js'
export { QuizWorker } from './workers/quiz-worker.js'
export { InteractiveWorker } from './workers/interactive-worker.js'
export { HotspotWorker } from './workers/hotspot-worker.js'
export { ComparisonWorker } from './workers/comparison-worker.js'
export { DragDropWorker } from './workers/drag-drop-worker.js'
export { ClozeWorker } from './workers/cloze-worker.js'
export { AnimationWorker } from './workers/animation-worker.js'
export { BranchingWorker } from './workers/branching-worker.js'
export { Model3dWorker } from './workers/model3d-worker.js'
export { ImageWorker } from './workers/image-worker.js'
export { generateOpenAIImage, generateOpenAIImageEdit } from './llm/openai-image.js'
export type { ImageProviderConfig } from './llm/openai-image.js'
export { callLLM } from './llm/client.js'
export { generateScript, generateScriptDoc } from './workers/script-worker.js'
export { validatedGenerate, LLMOutputValidationError } from './llm/validated-generate.js'
export type { GeneratorConfig } from './types.js'
export type { LLMConfig, LLMCallOptions } from './llm/client.js'
export type { ContentWorker } from './workers/types.js'
export type { GenerationEvent, EventHandler, PipelineOptions } from './pipeline/generation-pipeline.js'

const DEFAULT_RETRY: RetryOptions = { maxRetries: 3, baseDelay: 500 }

export function createGenerationPipeline(db: ReturnType<typeof createDb>, config: GeneratorConfig): GenerationPipeline {
  const stageRepo = createStageRepository(db)
  const contentRepo = createContentUnitRepository(db)
  const programRepo = createProgramRepository(db)

  const boundCallLLM = (userPrompt: string, systemPrompt?: string) =>
    callLLM(userPrompt, config.llm, { jsonMode: true, ...(systemPrompt ? { systemPrompt } : {}) })

  const boundCallLLMFreeform = (userPrompt: string, systemPrompt?: string) =>
    callLLM(userPrompt, config.llm, { ...(systemPrompt ? { systemPrompt } : {}) })

  const retryOpts = { ...DEFAULT_RETRY, ...config.retryOptions }

  const extractor = new KnowledgeProfileExtractor(boundCallLLM, retryOpts)

  const registry = new WorkerRegistry()
  registry.register(new SlideWorker(boundCallLLM, retryOpts))
  registry.register(new QuizWorker(boundCallLLM, retryOpts))
  registry.register(new InteractiveWorker(boundCallLLM, retryOpts, boundCallLLMFreeform))
  registry.register(new HotspotWorker(boundCallLLM, retryOpts))
  registry.register(new ComparisonWorker(boundCallLLM, retryOpts))
  registry.register(new DragDropWorker(boundCallLLM, retryOpts))
  registry.register(new ClozeWorker(boundCallLLM, retryOpts))
  registry.register(new AnimationWorker(boundCallLLM, retryOpts, boundCallLLMFreeform))
  registry.register(new BranchingWorker(boundCallLLM, retryOpts))
  registry.register(new Model3dWorker(boundCallLLM, retryOpts))
  registry.register(new ImageWorker(boundCallLLM, retryOpts, config.image))

  return new GenerationPipeline(
    stageRepo,
    registry,
    extractor,
    {
      ...(config.concurrency !== undefined ? { concurrency: config.concurrency } : {}),
      ...(config.reuseFromLibrary !== undefined ? { reuseFromLibrary: config.reuseFromLibrary } : {}),
    },
    contentRepo,
    programRepo,
  )
}
