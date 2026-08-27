'use server'

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { DocumentRef, DocumentChapter } from '@maolab/shared-types'
import { segmentDocument, extractFromImage, joinPages, type ExtractedPage } from '@maolab/setup'

const UPLOAD_DIR = join(process.cwd(), 'public', 'source-documents')
const PUBLIC_PREFIX = '/source-documents'

const IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/jpg'])

function getLLMConfig() {
  const apiKey = process.env['OPENAI_API_KEY']
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured')
  const cfg: { apiKey: string; model: string; baseURL?: string } = {
    apiKey,
    model: process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
  }
  const baseURL = process.env['OPENAI_BASE_URL']
  if (baseURL) cfg.baseURL = baseURL
  return cfg
}

function getVisionLLMConfig() {
  // Prefer dedicated vision env vars; fall back to the main OPENAI_* setup.
  const apiKey = process.env['OPENAI_VISION_API_KEY'] ?? process.env['OPENAI_API_KEY']
  if (!apiKey) throw new Error('OPENAI_VISION_API_KEY or OPENAI_API_KEY required for vision extraction')
  const cfg: { apiKey: string; model: string; baseURL?: string } = {
    apiKey,
    // qwen-vl-max-latest works on DashScope OpenAI-compatible mode; gpt-4o-mini on real OpenAI.
    model: process.env['OPENAI_VISION_MODEL'] ?? (process.env['OPENAI_VISION_API_KEY'] ? 'gpt-4o-mini' : 'qwen-vl-max-latest'),
  }
  const baseURL = process.env['OPENAI_VISION_BASE_URL'] ?? process.env['OPENAI_BASE_URL']
  if (baseURL) cfg.baseURL = baseURL
  return cfg
}

/**
 * Accept an uploaded PDF, persist it under public/source-documents/, extract its
 * text, ask the LLM to segment it into chapters, and return a complete
 * DocumentRef ready to attach to a TeachingPlan.
 */
export async function uploadAndExtractDocument(formData: FormData): Promise<DocumentRef> {
  const file = formData.get('file')
  if (!(file instanceof File)) throw new Error('未收到文件')
  if (file.size === 0) throw new Error('文件为空')
  if (file.size > 50 * 1024 * 1024) throw new Error('文件超过 50MB,请拆分后再上传')

  const mimeType = file.type || 'application/octet-stream'
  const lowerName = file.name.toLowerCase()
  const isPdf = mimeType === 'application/pdf' || lowerName.endsWith('.pdf')
  const isImage = IMAGE_MIMES.has(mimeType) || /\.(png|jpg|jpeg|webp)$/i.test(lowerName)

  if (isImage) {
    return await uploadImageAsDocument(file)
  }
  if (!isPdf) {
    throw new Error('支持的格式:PDF / JPG / PNG / WEBP')
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  await mkdir(UPLOAD_DIR, { recursive: true })
  const id = randomUUID()
  const safeName = sanitize(file.name)
  const storedName = `${id}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(join(UPLOAD_DIR, storedName), buffer)

  // ── Parse PDF ──────────────────────────────────────────────────────────────
  let pageCount: number | undefined
  let rawText = ''
  try {
    // pdf-parse@1 has a debug-mode side-effect in its index.js that tries to
    // open a bundled sample PDF at import time. Import the inner lib directly
    // to bypass it.
    // @ts-expect-error — package ships untyped
    const mod = await import('pdf-parse/lib/pdf-parse.js')
    const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string; numpages: number }>
    const parsed = await pdfParse(buffer)
    rawText = (parsed.text ?? '').trim()
    pageCount = parsed.numpages
  } catch (err) {
    console.warn('[uploadAndExtractDocument] pdf-parse failed:', err)
    throw new Error(`PDF 解析失败:${err instanceof Error ? err.message : String(err)}`)
  }

  if (!rawText) {
    throw new Error('未能从 PDF 中提取到任何文字 — 可能是扫描件,请先 OCR')
  }

  // ── LLM segment chapters ───────────────────────────────────────────────────
  let chapters: DocumentChapter[] = []
  let summary: string | undefined
  try {
    const result = await segmentDocument(rawText, pageCount, getLLMConfig())
    chapters = result.chapters
    summary = result.summary
  } catch (err) {
    console.warn('[uploadAndExtractDocument] LLM segmentation failed, falling back to flat:', err)
    // Fallback: one big chapter so the doc is still usable
    chapters = [
      {
        index: 0,
        title: file.name.replace(/\.pdf$/i, ''),
        text: rawText.slice(0, 8000),
      },
    ]
  }

  const doc: DocumentRef = {
    id,
    filename: file.name,
    mimeType: 'application/pdf',
    url: `${PUBLIC_PREFIX}/${storedName}`,
    charCount: rawText.length,
    rawText: rawText.length > 4000 ? rawText.slice(0, 4000) + '\n...(已截断)' : rawText,
    chapters,
    uploadedAt: Date.now(),
  }
  if (pageCount !== undefined) doc.pageCount = pageCount
  if (summary !== undefined) doc.summary = summary

  return doc
}

/**
 * Single-image variant. The image is treated as one "page". The result is a
 * one-chapter DocumentRef. For multi-page textbook batches, call
 * `uploadImagesAsDocument` with multiple files in one form submission.
 */
async function uploadImageAsDocument(file: File): Promise<DocumentRef> {
  await mkdir(UPLOAD_DIR, { recursive: true })
  const id = randomUUID()
  const safeName = sanitize(file.name)
  const storedName = `${id}-${safeName}`
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(join(UPLOAD_DIR, storedName), buffer)

  const mimeType = file.type || 'image/png'

  let page: ExtractedPage
  try {
    page = await extractFromImage(buffer, mimeType, getVisionLLMConfig())
  } catch (err) {
    console.warn('[uploadImageAsDocument] vision failed:', err)
    throw new Error(`图像识别失败:${err instanceof Error ? err.message : String(err)}`)
  }
  if (!page.text && !(page.headings ?? []).length) {
    throw new Error('未能从图像中识别出文字。请确认图像是教材页面而非空白图。')
  }

  const text = page.text || ''
  const title = page.headings?.[0] ?? file.name.replace(/\.(png|jpg|jpeg|webp)$/i, '')
  const chapter: DocumentChapter = {
    index: 0,
    title,
    text: text.slice(0, 8000),
  }
  if (page.topicTags?.length) chapter.concepts = page.topicTags

  const summary = text.slice(0, 200) + (text.length > 200 ? '…' : '')
  return {
    id,
    filename: file.name,
    mimeType,
    url: `${PUBLIC_PREFIX}/${storedName}`,
    pageCount: 1,
    charCount: text.length,
    rawText: text.slice(0, 4000),
    chapters: [chapter],
    summary,
    uploadedAt: Date.now(),
  }
}

/**
 * Multi-image variant: each image is OCR'd in parallel via vision LLM, then
 * the joined text is run through the standard chapter segmenter just like a
 * PDF. Useful when teachers photograph several consecutive textbook pages.
 */
export async function uploadImagesAsDocument(formData: FormData): Promise<DocumentRef> {
  const files = formData.getAll('files').filter((f): f is File => f instanceof File)
  if (files.length === 0) throw new Error('未收到图片')
  if (files.length > 12) throw new Error('单次最多 12 张,请分批上传')

  await mkdir(UPLOAD_DIR, { recursive: true })
  const id = randomUUID()
  const visionCfg = getVisionLLMConfig()

  // Persist + OCR each image in parallel.
  const perImage = await Promise.all(files.map(async (file, i) => {
    const buffer = Buffer.from(await file.arrayBuffer())
    const mimeType = file.type || 'image/png'
    const storedName = `${id}-${i}-${sanitize(file.name)}`
    await writeFile(join(UPLOAD_DIR, storedName), buffer)
    const page = await extractFromImage(buffer, mimeType, visionCfg)
    return { file, page, storedName }
  }))

  const { text, topicTags } = joinPages(perImage.map(p => p.page))
  if (!text.trim()) throw new Error('多张图像均未识别出文字')

  // Now segment as a normal document
  let chapters: DocumentChapter[] = []
  let summary: string | undefined
  try {
    const result = await segmentDocument(text, files.length, getLLMConfig())
    chapters = result.chapters
    summary = result.summary
  } catch (err) {
    console.warn('[uploadImagesAsDocument] segment failed, flat fallback:', err)
    chapters = [{ index: 0, title: '截图合集', text: text.slice(0, 8000), concepts: topicTags }]
  }

  const firstStored = perImage[0]?.storedName
  return {
    id,
    filename: files.length === 1 ? files[0]!.name : `${files.length} 张教材截图`,
    mimeType: 'image/png',
    url: firstStored ? `${PUBLIC_PREFIX}/${firstStored}` : '',
    pageCount: files.length,
    charCount: text.length,
    rawText: text.slice(0, 4000),
    chapters,
    ...(summary !== undefined ? { summary } : {}),
    uploadedAt: Date.now(),
  }
}

function sanitize(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'document.pdf'
}
