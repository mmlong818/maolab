/**
 * image-gen（3a 改写自 maolab app/app/lib/v2/image-gen.ts）。
 *
 * 图像经 runWithCourseRuntime 注入的通道生成；删除站点 OPENAI_IMAGE_* 直连与 Pollinations 公共服务回退
 * （提示词不得发往无合同的公共服务）。提供方由用户裁决 D3 决定、3c 实现；未注入时抛 CourseRuntimeMissingError，
 * 3b 起由页面 runner 原样上抛（诊断点名缺图像通道）。
 */
import { requireCourseImage } from '../runtime.js'

export interface ImageGenOpts {
  /** 画面尺寸 `WxH`:任意 16 倍数,宽高比 ≤3:1(gpt-image-2 实测);预设 1024x1024 等仍可用 */
  size?: string
  /** 原 Pollinations 回退的宽高；回退已删除，保留字段以免改动调用方 */
  fallbackWidth?: number
  fallbackHeight?: number
}

export async function generateImage(prompt: string, opts: ImageGenOpts = {}): Promise<string> {
  return requireCourseImage().generate(prompt, { size: opts.size ?? '1536x1024' })
}
