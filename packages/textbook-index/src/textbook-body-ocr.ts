/**
 * textbook-body-ocr — 教材正文逐页 vision OCR
 *
 * 把 tch_material 教材本体的逐页 JPG 用 qwen-vl-max 转写成带页码的全文,
 * 缓存到 data/textbook-body-cache/{textbookId}.json。一本只 OCR 一次,
 * 全书所有 leaf 章节共享(章节切分在 textbook-body-segment 里基于此全文做)。
 *
 * 自包含 vlCall(不依赖 app/),与 app/lib/v2/*-ocr 同口径:
 *   env: DASHSCOPE_API_KEY / OPENAI_API_KEY, VL_MODEL(默认 qwen-vl-max),
 *        VL_BASE_URL / OPENAI_BASE_URL(默认 dashscope compatible-mode)
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

const CACHE_ROOT = join(process.cwd(), 'data', 'textbook-body-cache')
const PAGES_ROOT = join(process.cwd(), 'data', 'textbook-body-pages')

/**
 * 读已下载到本地的逐页 JPG(download-textbook-pages.ts 产物)。
 * 返回按页序的本地文件路径 + 真实页数;无 _meta.json 返回 null。
 */
export async function listLocalBodyPages(
  textbookId: string,
): Promise<{ pages: string[]; totalPages: number } | null> {
  try {
    const metaRaw = await readFile(join(PAGES_ROOT, textbookId, '_meta.json'), 'utf-8')
    const meta = JSON.parse(metaRaw) as { totalPages: number }
    if (!meta.totalPages || meta.totalPages < 1) return null
    const pages = Array.from({ length: meta.totalPages }, (_, i) =>
      join(PAGES_ROOT, textbookId, `${i + 1}.jpg`),
    )
    return { pages, totalPages: meta.totalPages }
  } catch {
    return null
  }
}

export interface TextbookBodyOcrPage {
  pageNo: number
  url: string
  rawText: string
}

export interface TextbookBodyOcr {
  textbookId: string
  title: string
  ocrAt: number
  model: string
  /** 成功 OCR 的页数 / 总页数 */
  pageCount: number
  totalPages: number
  pages: TextbookBodyOcrPage[]
  /** 全书拼接全文,带 [P{n}] 页码锚点,供章节切分定位 */
  fullText: string
}

interface VLConfig {
  apiKey: string
  model: string
  baseURL: string
}

function loadVLConfig(): VLConfig {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('[textbook-body-ocr] Missing DASHSCOPE_API_KEY / OPENAI_API_KEY')
  }
  const model = process.env.VL_MODEL ?? 'qwen-vl-max'
  const baseURL =
    process.env.VL_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  return { apiKey, model, baseURL }
}

interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
}

async function vlCall(opts: {
  cfg: VLConfig
  messages: ChatMsg[]
  timeoutMs?: number
  maxAttempts?: number
}): Promise<string> {
  const { cfg, messages } = opts
  const timeoutMs = opts.timeoutMs ?? 120_000
  const maxAttempts = opts.maxAttempts ?? 3
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const res = await fetch(`${cfg.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0.1 }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`VL HTTP ${res.status}: ${body.slice(0, 200)}`)
      }
      const data = (await res.json()) as { choices: Array<{ message: { content: string } }> }
      const content = data.choices[0]?.message?.content
      if (!content) throw new Error('empty completion')
      return content
    } catch (err) {
      lastErr = err
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1500 * attempt))
    } finally {
      clearTimeout(timer)
    }
  }
  throw new Error(`vlCall failed: ${String(lastErr)}`)
}

const OCR_SYSTEM_PROMPT =
  '你是中小学教材 OCR 助手。逐字抄录用户给的教材页面图,保留标题、正文段落、列表、表格、公式、图注、旁批的原文,不要总结、不要改写、不要补充。表格用 Markdown 表格语法。\n\n关键约束: 这是中文教材, 任何英文单词都可能是识别错误,除非原图本身就是英文(学科专有名词/外语教材)才保留。页眉页脚的页码/书名可省略。若整页是纯插图无文字,输出 "(图片页,无正文)"。'

/** 页引用 → vision 可用的 image_url:本地文件转 base64 data URI,http 原样 */
async function resolvePageImage(ref: string): Promise<string> {
  if (/^https?:\/\//i.test(ref)) return ref
  const buf = await readFile(ref)
  const ext = ref.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
  return `data:image/${ext};base64,${buf.toString('base64')}`
}

async function ocrPage(cfg: VLConfig, ref: string): Promise<string> {
  const url = await resolvePageImage(ref)
  return vlCall({
    cfg,
    messages: [
      { role: 'system', content: OCR_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url } },
          { type: 'text', text: '把这一页教材的所有文字逐字转写为 Markdown,保留原结构。只输出转写文本。' },
        ],
      },
    ],
  }).then(s => s.trim())
}

function cachePath(textbookId: string): string {
  return join(CACHE_ROOT, `${textbookId}.json`)
}

export async function loadCachedBodyOcr(textbookId: string): Promise<TextbookBodyOcr | null> {
  try {
    const buf = await readFile(cachePath(textbookId), 'utf-8')
    return JSON.parse(buf) as TextbookBodyOcr
  } catch {
    return null
  }
}

async function saveCachedBodyOcr(ocr: TextbookBodyOcr): Promise<void> {
  const p = cachePath(ocr.textbookId)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(ocr, null, 2), 'utf-8')
}

function assembleFullText(pages: TextbookBodyOcrPage[]): string {
  return pages
    .filter(p => p.rawText && p.rawText !== '(图片页,无正文)')
    .map(p => `[P${p.pageNo}]\n${p.rawText}`)
    .join('\n\n')
}

export interface OcrTextbookBodyInput {
  textbookId: string
  title: string
  /** 逐页 JPG URL, 已按页序排序 */
  pages: string[]
}

/**
 * 整本教材逐页 OCR(并发),命中缓存直接返回。
 * 单页失败容忍(记空文本),不中断整本。
 */
export async function ocrTextbookBody(
  input: OcrTextbookBodyInput,
  opts: { forceRefresh?: boolean; concurrency?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<TextbookBodyOcr> {
  if (!opts.forceRefresh) {
    const cached = await loadCachedBodyOcr(input.textbookId)
    if (cached) return cached
  }
  const cfg = loadVLConfig()
  const total = input.pages.length
  const concurrency = Math.max(1, opts.concurrency ?? 4)
  const results: TextbookBodyOcrPage[] = new Array(total)
  let nextIdx = 0
  let done = 0
  let failed = 0

  async function worker(): Promise<void> {
    while (true) {
      const i = nextIdx++
      if (i >= total) return
      const url = input.pages[i]!
      const pageNo = i + 1
      try {
        const rawText = await ocrPage(cfg, url)
        results[i] = { pageNo, url, rawText }
      } catch (err) {
        failed++
        console.warn(`[textbook-body-ocr] ${input.textbookId} p${pageNo} 失败:`, String(err).slice(0, 120))
        results[i] = { pageNo, url, rawText: '' }
      } finally {
        done++
        opts.onProgress?.(done, total)
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))

  const pages = results.filter(Boolean)
  const ocr: TextbookBodyOcr = {
    textbookId: input.textbookId,
    title: input.title,
    ocrAt: Date.now(),
    model: cfg.model,
    pageCount: pages.filter(p => p.rawText).length,
    totalPages: total,
    pages,
    fullText: assembleFullText(pages),
  }
  await saveCachedBodyOcr(ocr)
  if (failed > 0) console.warn(`[textbook-body-ocr] ${input.textbookId} 完成,${failed}/${total} 页 OCR 失败`)
  return ocr
}
