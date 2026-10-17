import { describe, expect, it } from 'vitest'
import {
  MAX_COWART_ANNOTATION_BYTES,
  buildCowartEditPrompt,
  imageSizeFromAspect,
  isAllowedRemoteSceneImage,
  normalizeCowartInstruction,
  parseCowartAnnotationDataUrl,
} from '../cowart.js'
import type { LessonScene } from '../../domain.js'

const scene = {
  visualFocus: '观察光线穿过三棱镜后的色散',
  imagePrompt: 'A precise prism dispersion diagram.',
} as LessonScene

describe('Cowart image edit helpers', () => {
  it('accepts PNG data URLs and rejects unsupported or oversized input', () => {
    const parsed = parseCowartAnnotationDataUrl(`data:image/png;base64,${Buffer.from('png').toString('base64')}`)
    expect(parsed.extension).toBe('png')
    expect(parsed.buffer.toString()).toBe('png')
    expect(() => parseCowartAnnotationDataUrl('data:image/svg+xml;base64,PHN2Zy8+')).toThrow('PNG 或 JPEG')
    const tooLarge = Buffer.alloc(MAX_COWART_ANNOTATION_BYTES + 1).toString('base64')
    expect(() => parseCowartAnnotationDataUrl(`data:image/jpeg;base64,${tooLarge}`)).toThrow('12MB')
  })

  it('builds a clean-image prompt with teaching context and user instruction', () => {
    const prompt = buildCowartEditPrompt(scene, '把紫光方向再明显一些')
    expect(prompt).toContain(scene.visualFocus)
    expect(prompt).toContain(scene.imagePrompt)
    expect(prompt).toContain('把紫光方向再明显一些')
    expect(prompt).toContain('Do not include annotation arrows')
  })

  it('normalizes instruction and image dimensions conservatively', () => {
    expect(normalizeCowartInstruction('  更换背景  ')).toBe('更换背景')
    expect(() => normalizeCowartInstruction('x'.repeat(1001))).toThrow('1000')
    expect(imageSizeFromAspect('1312:880')).toBe('1312x880')
    expect(imageSizeFromAspect('9:16')).toBe('864x1536')
    expect(imageSizeFromAspect('1:1')).toBe('1536x1536')
    expect(imageSizeFromAspect(undefined)).toBe('1536x1024')
  })

  it('only allows the product image fallback host for remote source loading', () => {
    expect(isAllowedRemoteSceneImage('https://image.pollinations.ai/prompt/test')).toBe(true)
    expect(isAllowedRemoteSceneImage('http://image.pollinations.ai/prompt/test')).toBe(false)
    expect(isAllowedRemoteSceneImage('https://example.com/image.png')).toBe(false)
  })
})
