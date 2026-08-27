/**
 * image-gen — 统一图片生成入口（atom 配图 + 媒介化漫画共用）
 *
 * 优先 OpenAI gpt-image-2(配 OPENAI_IMAGE_API_KEY), 失败回退 Pollinations Flux。
 * 从 atom-worker 抽出, 供 media-form(漫画) 等复用。
 */
import { join } from 'node:path'
import { generateOpenAIImage } from '@maolab/generator'

export function buildPollinationsUrl(prompt: string, width = 1024, height = 768): string {
  const encoded = encodeURIComponent(prompt.trim().slice(0, 2000))
  const seed = Math.floor(Math.random() * 1_000_000)
  return `https://image.pollinations.ai/prompt/${encoded}?width=${width}&height=${height}&model=flux&nologo=true&seed=${seed}`
}

export interface ImageGenOpts {
  /** 画面尺寸 `WxH`:任意 16 倍数,宽高比 ≤3:1(gpt-image-2 实测);预设 1024x1024 等仍可用 */
  size?: string
  /** Pollinations 回退时的宽高 */
  fallbackWidth?: number
  fallbackHeight?: number
}

export async function generateImage(prompt: string, opts: ImageGenOpts = {}): Promise<string> {
  const apiKey = process.env.OPENAI_IMAGE_API_KEY
  if (apiKey) {
    try {
      const result = await generateOpenAIImage(prompt, {
        apiKey,
        model: process.env.OPENAI_IMAGE_MODEL ?? 'gpt-image-2',
        size: opts.size ?? '1536x1024',
        quality: (process.env.OPENAI_IMAGE_QUALITY as 'low' | 'medium' | 'high' | 'auto' | undefined) ?? 'medium',
        outputDir: join(process.cwd(), 'public', 'generated-images'),
        publicPrefix: '/generated-images',
      })
      return result.url
    } catch (err) {
      console.warn('[image-gen] OpenAI failed, fallback Pollinations:', err)
    }
  }
  return buildPollinationsUrl(prompt, opts.fallbackWidth, opts.fallbackHeight)
}
