/**
 * textbook-body-segment — 把整本 OCR 全文按章节叶子切分成 {leafId -> bodyText}
 *
 * national_lesson 树给的是权威章节结构(叶子 + 顺序),tch_material 给的是
 * 整本逐页正文(扁平页序,无页->章节映射)。本模块用一次文本 LLM 调用把
 * "有序叶子标题列表" 对齐到 "页码区间",再按页确定性切出每个叶子的正文。
 *
 * LLM 走 API 直连文本模型(默认 qwen-plus / dashscope compatible-mode),
 * 与 KP 抽取的 claude-cli 订阅额度互不影响。切分结果缓存到
 * data/textbook-body-cache/{treeId}.segments.json,一棵树只切一次。
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { TextbookBodyOcr } from './textbook-body-ocr.js'

const CACHE_ROOT = join(process.cwd(), 'data', 'textbook-body-cache')

export interface LeafForSegment {
  leafId: string
  title: string
  ancestorTitles: string[]
}

export interface ChapterBodySegment {
  leafId: string
  title: string
  /** 命中的页码区间(闭区间,1-based);未定位到时 startPage=endPage=0 */
  startPage: number
  endPage: number
  /** 该区间内有效正文页拼接,无正文则空串 */
  bodyText: string
}

export interface TextbookBodySegments {
  treeId: string
  bodyTextbookId: string
  segmentedAt: number
  model: string
  segments: ChapterBodySegment[]
}

interface SegConfig {
  apiKey: string
  model: string
  baseURL: string
}

function loadSegConfig(): SegConfig {
  const apiKey = process.env.DASHSCOPE_API_KEY ?? process.env.OPENAI_API_KEY
  if (!apiKey?.trim()) {
    throw new Error('[textbook-body-segment] Missing DASHSCOPE_API_KEY / OPENAI_API_KEY')
  }
  const model = process.env.SEG_MODEL ?? 'qwen-plus'
  const baseURL =
    process.env.SEG_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    'https://dashscope.aliyuncs.com/compatible-mode/v1'
  return { apiKey, model, baseURL }
}

interface ChatMsg {
  role: 'system' | 'user' | 'assistant'
  content: string
}

async function textCall(opts: {
  cfg: SegConfig
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
        body: JSON.stringify({
          model: cfg.model,
          messages,
          temperature: 0.1,
          response_format: { type: 'json_object' },
        }),
        signal: ctrl.signal,
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new Error(`SEG HTTP ${res.status}: ${body.slice(0, 200)}`)
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
  throw new Error(`textCall failed: ${String(lastErr)}`)
}

const SEG_SYSTEM_PROMPT =
  '你是教材结构对齐助手。给你一本教材的逐页正文摘要(每页 [P{页码}] 开头)和这本教材按顺序排列的章节叶子列表,你要判断每个叶子在正文里大致从第几页开始、到第几页结束。\n\n规则:\n1. 叶子是按教材实际顺序给的,页码区间必须随叶子序号单调不减(后一个叶子的 startPage >= 前一个的 startPage)。\n2. 区间相邻叶子可共享边界页(一页可能含上一节结尾+下一节开头)。\n3. 找不到明确对应正文的叶子(如纯活动/复习/目录页),给它最贴近的页码即可,不要留空。\n4. 只依据标题文字在正文中的出现位置定位,不要臆造。\n5. 页码不得超过给定总页数,不得小于 1。\n\n只输出 JSON: {"ranges":[{"index":叶子序号,"startPage":起页,"endPage":止页}, ...]},index 从 1 开始,覆盖所有叶子。'

/** 每页正文摘要: [P{n}] + 前 maxChars 字,供 LLM 定位章节边界 */
function buildPageDigest(ocr: TextbookBodyOcr, maxChars = 280): string {
  return ocr.pages
    .filter(p => p.rawText && p.rawText !== '(图片页,无正文)')
    .map(p => {
      const head = p.rawText.replace(/\s+/g, ' ').slice(0, maxChars)
      return `[P${p.pageNo}] ${head}`
    })
    .join('\n')
}

function buildLeafList(leaves: LeafForSegment[]): string {
  return leaves
    .map((l, i) => {
      const path = l.ancestorTitles.length ? l.ancestorTitles.join(' › ') + ' › ' : ''
      return `${i + 1}. ${path}${l.title}`
    })
    .join('\n')
}

interface RawRange {
  index: number
  startPage: number
  endPage: number
}

function parseRanges(
  raw: string,
  leafCount: number,
  totalPages: number,
): Map<number, { startPage: number; endPage: number }> {
  const out = new Map<number, { startPage: number; endPage: number }>()
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    const m = /\{[\s\S]*\}/.exec(raw)
    if (!m) return out
    try {
      parsed = JSON.parse(m[0])
    } catch {
      return out
    }
  }
  const ranges = (parsed as { ranges?: RawRange[] })?.ranges
  if (!Array.isArray(ranges)) return out
  const clamp = (n: number): number => Math.min(Math.max(Math.round(n), 1), totalPages)
  for (const r of ranges) {
    const idx = Number(r.index)
    const sp = Number(r.startPage)
    const ep = Number(r.endPage)
    if (!Number.isInteger(idx) || idx < 1 || idx > leafCount) continue
    if (!Number.isFinite(sp) || !Number.isFinite(ep)) continue
    const a = clamp(sp)
    const b = clamp(ep)
    out.set(idx, { startPage: Math.min(a, b), endPage: Math.max(a, b) })
  }
  return out
}

/** 按页区间从 OCR 页拼接正文(过滤图片页) */
function sliceBody(ocr: TextbookBodyOcr, startPage: number, endPage: number): string {
  if (startPage < 1 || endPage < 1) return ''
  return ocr.pages
    .filter(p => p.pageNo >= startPage && p.pageNo <= endPage)
    .filter(p => p.rawText && p.rawText !== '(图片页,无正文)')
    .map(p => p.rawText)
    .join('\n\n')
}

function segCachePath(treeId: string): string {
  return join(CACHE_ROOT, `${treeId}.segments.json`)
}

export async function loadCachedSegments(treeId: string): Promise<TextbookBodySegments | null> {
  try {
    const buf = await readFile(segCachePath(treeId), 'utf-8')
    return JSON.parse(buf) as TextbookBodySegments
  } catch {
    return null
  }
}

async function saveCachedSegments(seg: TextbookBodySegments): Promise<void> {
  const p = segCachePath(seg.treeId)
  await mkdir(dirname(p), { recursive: true })
  await writeFile(p, JSON.stringify(seg, null, 2), 'utf-8')
}

export interface SegmentTextbookBodyInput {
  treeId: string
  bodyOcr: TextbookBodyOcr
  /** 树叶子,按教材顺序(DFS) */
  leaves: LeafForSegment[]
}

/**
 * 把整本 OCR 全文按叶子切分。命中缓存直接返回。
 * LLM 只给页码区间,正文按页确定性切出(不让 LLM 复制正文,避免改写)。
 */
export async function segmentTextbookBody(
  input: SegmentTextbookBodyInput,
  opts: { forceRefresh?: boolean } = {},
): Promise<TextbookBodySegments> {
  if (!opts.forceRefresh) {
    const cached = await loadCachedSegments(input.treeId)
    if (cached) return cached
  }
  const cfg = loadSegConfig()
  const digest = buildPageDigest(input.bodyOcr)
  const leafList = buildLeafList(input.leaves)
  const userPrompt = `教材逐页正文摘要(共 ${input.bodyOcr.totalPages} 页):\n${digest}\n\n章节叶子(按顺序,共 ${input.leaves.length} 个):\n${leafList}`

  const raw = await textCall({
    cfg,
    messages: [
      { role: 'system', content: SEG_SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
  })
  const rangeMap = parseRanges(raw, input.leaves.length, input.bodyOcr.totalPages)

  const segments: ChapterBodySegment[] = input.leaves.map((l, i) => {
    const r = rangeMap.get(i + 1)
    const startPage = r?.startPage ?? 0
    const endPage = r?.endPage ?? 0
    return {
      leafId: l.leafId,
      title: l.title,
      startPage,
      endPage,
      bodyText: sliceBody(input.bodyOcr, startPage, endPage),
    }
  })

  const result: TextbookBodySegments = {
    treeId: input.treeId,
    bodyTextbookId: input.bodyOcr.textbookId,
    segmentedAt: Date.now(),
    model: cfg.model,
    segments,
  }
  await saveCachedSegments(result)
  return result
}
