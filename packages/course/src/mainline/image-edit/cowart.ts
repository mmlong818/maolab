import type { LessonScene } from '../domain.js'

export const MAX_COWART_ANNOTATION_BYTES = 12 * 1024 * 1024

export interface ParsedCowartAnnotation {
  buffer: Buffer
  extension: 'png' | 'jpg'
  mimeType: 'image/png' | 'image/jpeg'
}

export function parseCowartAnnotationDataUrl(value: unknown): ParsedCowartAnnotation {
  if (typeof value !== 'string') throw new Error('标注截图格式无效。')
  const match = /^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(value)
  if (!match) throw new Error('标注截图必须是 PNG 或 JPEG 图片。')

  const base64 = match[2]!.replace(/[\r\n]/g, '')
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) throw new Error('标注截图为空。')
  if (buffer.length > MAX_COWART_ANNOTATION_BYTES) throw new Error('标注截图不能超过 12MB。')

  const mimeType = match[1] as ParsedCowartAnnotation['mimeType']
  return { buffer, mimeType, extension: mimeType === 'image/png' ? 'png' : 'jpg' }
}

export function normalizeCowartInstruction(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value !== 'string') throw new Error('补充要求格式无效。')
  const instruction = value.trim()
  if (instruction.length > 1000) throw new Error('补充要求不能超过 1000 个字符。')
  return instruction
}

export function buildCowartEditPrompt(scene: LessonScene, instruction: string): string {
  return [
    'Create a clean revised educational illustration from this Cowart annotation screenshot.',
    'The screenshot contains the source image plus arrows, freehand marks, and text notes that describe requested changes.',
    'Treat every annotation as an edit instruction. Preserve the source image composition, subject identity, and teaching accuracy unless an annotation explicitly asks for a change.',
    'Return only the finished clean image. Do not include annotation arrows, handwritten marks, note text, selection outlines, canvas chrome, toolbars, or extra explanation.',
    `Teaching focus: ${scene.visualFocus}`,
    scene.imagePrompt ? `Original image brief:\n${scene.imagePrompt}` : '',
    instruction ? `Additional user instruction:\n${instruction}` : '',
  ].filter(Boolean).join('\n\n')
}

export function imageSizeFromAspect(aspect: string | undefined): string {
  const match = /^(\d+):(\d+)$/.exec(aspect ?? '')
  if (!match) return '1536x1024'

  let width = Number(match[1])
  let height = Number(match[2])
  if (width <= 32 && height <= 32) {
    const ratio = width / height
    if (ratio >= 1) {
      width = 1536
      height = 1536 / ratio
    } else {
      height = 1536
      width = 1536 * ratio
    }
  }
  if (width < 256 || height < 256 || width > 2048 || height > 2048) return '1536x1024'
  const ratio = width / height
  if (ratio > 3 || ratio < 1 / 3) return '1536x1024'

  const normalizedWidth = Math.max(256, Math.round(width / 16) * 16)
  const normalizedHeight = Math.max(256, Math.round(height / 16) * 16)
  return `${normalizedWidth}x${normalizedHeight}`
}

export function isAllowedRemoteSceneImage(imageUrl: string): boolean {
  try {
    const url = new URL(imageUrl)
    return url.protocol === 'https:' && url.hostname === 'image.pollinations.ai'
  } catch {
    return false
  }
}
