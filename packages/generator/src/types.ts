import type { LLMConfig } from './llm/client.js'
import type { RetryOptions } from './llm/validated-generate.js'
import type { ImageProviderConfig } from './llm/openai-image.js'

export interface GeneratorConfig {
  llm: LLMConfig
  concurrency?: number
  retryOptions?: Partial<RetryOptions>
  /** Optional OpenAI image generation; when present, ImageWorker calls gpt-image-1 instead of Pollinations. */
  image?: ImageProviderConfig
  /** Enable library lookup — pipeline tries to reuse an existing ContentUnit before invoking a worker. */
  reuseFromLibrary?: boolean
}
