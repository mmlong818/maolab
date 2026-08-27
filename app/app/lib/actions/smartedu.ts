'use server'

import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { URL as NodeURL } from 'node:url'
import type { DocumentRef, DocumentChapter } from '@maolab/shared-types'
import { segmentDocument } from '@maolab/setup'

const UPLOAD_DIR = join(process.cwd(), 'public', 'source-documents')
const PUBLIC_PREFIX = '/source-documents'

const SMARTEDU_HOST_PATTERN = /(basic\.smartedu\.cn|ykt\.cbern\.com\.cn|smartedu\.cn)/i

interface FetchedPdf {
  buffer: Buffer
  filename: string
  sourceUrl: string
}

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

/**
 * Public action: pull a remote PDF and turn it into a DocumentRef.
 *
 * Accepts either a direct PDF URL or a smartedu textbook detail-page URL like
 * `https://basic.smartedu.cn/tchMaterial/detail?...&contentId={uuid}`. For the
 * latter, we try the known CDN patterns; on failure we surface a clear error
 * suggesting manual download.
 */
export async function fetchPdfFromUrl(rawUrl: string): Promise<DocumentRef> {
  const url = (rawUrl ?? '').trim()
  if (!url) throw new Error('URL 不能为空')
  if (!/^https?:\/\//i.test(url)) throw new Error('URL 必须以 http:// 或 https:// 开头')

  let fetched: FetchedPdf
  try {
    if (isSmarteduDetailPage(url)) {
      const contentId = extractContentId(url)
      if (!contentId) throw new Error('无法从智慧教育平台 URL 中识别 contentId')
      fetched = await fetchSmarteduPdf(contentId, url)
    } else if (url.toLowerCase().endsWith('.pdf') || isLikelyPdfUrl(url)) {
      fetched = await fetchDirectPdf(url)
    } else {
      throw new Error('暂只支持以 .pdf 结尾的直链,或国家智慧教育平台教材详情页。请粘贴直链 PDF 或先下载到本地再上传。')
    }
  } catch (err) {
    throw new Error(`抓取失败:${err instanceof Error ? err.message : String(err)}`)
  }

  if (fetched.buffer.length < 1024) {
    throw new Error('下载内容过小,可能不是 PDF 或被服务器拒绝。请尝试直接下载后上传文件。')
  }
  // Cheap PDF magic check
  if (!fetched.buffer.subarray(0, 5).toString('ascii').includes('%PDF')) {
    throw new Error('下载到的内容不是 PDF。请确认链接指向 PDF 文件。')
  }

  // ── Persist ────────────────────────────────────────────────────────────────
  await mkdir(UPLOAD_DIR, { recursive: true })
  const id = randomUUID()
  const safeName = sanitize(fetched.filename || 'smartedu.pdf')
  const storedName = `${id}-${safeName}`
  await writeFile(join(UPLOAD_DIR, storedName), fetched.buffer)

  // ── Parse PDF ──────────────────────────────────────────────────────────────
  let pageCount: number | undefined
  let rawText = ''
  try {
    // @ts-expect-error — pdf-parse@1 ships untyped
    const mod = await import('pdf-parse/lib/pdf-parse.js')
    const pdfParse = (mod.default ?? mod) as (b: Buffer) => Promise<{ text: string; numpages: number }>
    const parsed = await pdfParse(fetched.buffer)
    rawText = (parsed.text ?? '').trim()
    pageCount = parsed.numpages
  } catch (err) {
    throw new Error(`PDF 解析失败:${err instanceof Error ? err.message : String(err)}`)
  }
  if (!rawText) throw new Error('未能从 PDF 中提取文字 — 可能是图像版扫描件。')

  let chapters: DocumentChapter[] = []
  let summary: string | undefined
  try {
    const result = await segmentDocument(rawText, pageCount, getLLMConfig())
    chapters = result.chapters
    summary = result.summary
  } catch {
    chapters = [{ index: 0, title: fetched.filename.replace(/\.pdf$/i, ''), text: rawText.slice(0, 8000) }]
  }

  const doc: DocumentRef = {
    id,
    filename: fetched.filename,
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

// ── Smartedu helpers ─────────────────────────────────────────────────────────

function isSmarteduDetailPage(url: string): boolean {
  if (!SMARTEDU_HOST_PATTERN.test(url)) return false
  return url.includes('contentId=') || url.includes('/tchMaterial/')
}

function isLikelyPdfUrl(url: string): boolean {
  return /\.pdf(\?|#|$)/i.test(url) || url.includes('pdf.pdf')
}

function extractContentId(url: string): string | undefined {
  const m = url.match(/contentId=([0-9a-fA-F-]{32,36})/)
  return m?.[1]
}

/**
 * Try the known smartedu CDN patterns for a textbook PDF. We attempt several
 * known hosts because the platform rotates them. Returns the first one that
 * responds with a PDF.
 */
async function fetchSmarteduPdf(contentId: string, sourceUrl: string): Promise<FetchedPdf> {
  const candidates = [
    `https://r1-ndr-doc.ykt.cbern.com.cn/edu_product/esp/assets/${contentId}.pkg/pdf.pdf`,
    `https://r2-ndr-doc.ykt.cbern.com.cn/edu_product/esp/assets/${contentId}.pkg/pdf.pdf`,
    `https://r3-ndr-doc.ykt.cbern.com.cn/edu_product/esp/assets/${contentId}.pkg/pdf.pdf`,
    `https://c1-ndr-doc.ykt.cbern.com.cn/edu_product/esp/assets/${contentId}.pkg/pdf.pdf`,
    `https://c2-ndr-doc.ykt.cbern.com.cn/edu_product/esp/assets/${contentId}.pkg/pdf.pdf`,
    `https://s-file-1.ykt.cbern.com.cn/edu_product/esp/assets/${contentId}.pkg/pdf.pdf`,
  ]
  const errors: string[] = []
  for (const cdnUrl of candidates) {
    try {
      const buf = await downloadBytes(cdnUrl)
      if (buf.length > 1024 && buf.subarray(0, 5).toString('ascii').includes('%PDF')) {
        return {
          buffer: buf,
          filename: `smartedu-${contentId.slice(0, 8)}.pdf`,
          sourceUrl,
        }
      }
      errors.push(`${new URL(cdnUrl).host}: ${buf.length} bytes (not PDF)`)
    } catch (err) {
      errors.push(`${new URL(cdnUrl).host}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  throw new Error(`所有 CDN 镜像均无法获取该 contentId 的 PDF。\n${errors.join('\n')}`)
}

async function fetchDirectPdf(url: string): Promise<FetchedPdf> {
  const buffer = await downloadBytes(url)
  const u = new NodeURL(url)
  const namePart = u.pathname.split('/').pop() || 'document.pdf'
  const filename = namePart.endsWith('.pdf') ? namePart : namePart + '.pdf'
  return { buffer, filename, sourceUrl: url }
}

// ── HTTP layer ───────────────────────────────────────────────────────────────

async function downloadBytes(url: string, depth = 0): Promise<Buffer> {
  if (depth > 5) throw new Error('Too many redirects')
  const u = new NodeURL(url)
  const lib = u.protocol === 'http:' ? httpRequest : httpsRequest
  return new Promise<Buffer>((resolve, reject) => {
    const req = lib(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + (u.search ?? ''),
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; MaolabBot/0.1)',
          'Referer': 'https://basic.smartedu.cn/',
          'Accept': 'application/pdf,*/*',
        },
      },
      async res => {
        const status = res.statusCode ?? 0
        if (status >= 300 && status < 400 && res.headers.location) {
          const next = new NodeURL(res.headers.location, url).toString()
          try { resolve(await downloadBytes(next, depth + 1)) } catch (e) { reject(e) }
          return
        }
        if (status < 200 || status >= 300) {
          reject(new Error(`HTTP ${status}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      },
    )
    req.on('error', reject)
    req.setTimeout(60_000, () => req.destroy(new Error('Request timeout 60s')))
    req.end()
  })
}

function sanitize(name: string): string {
  return name.replace(/[\/\\:*?"<>|]/g, '_').replace(/\s+/g, '_').slice(0, 80) || 'doc.pdf'
}
