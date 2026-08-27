import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { request as httpsRequest } from 'node:https'
import { request as httpRequest } from 'node:http'
import { URL as NodeURL } from 'node:url'

interface HttpResponseBody {
  status: number
  body: Buffer
}

async function httpsPostJson<T>(url: string, body: string, headers: Record<string, string>, timeoutMs: number): Promise<T> {
  const agent = await getProxyAgent()
  return new Promise((resolve, reject) => {
    const u = new NodeURL(url)
    const lib = u.protocol === 'http:' ? httpRequest : httpsRequest
    const req = lib(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + (u.search ?? ''),
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
        ...(agent ? { agent } : {}),
      } as unknown as Parameters<typeof httpsRequest>[0],
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            reject(new Error(`OpenAI image API ${status}: ${buf.toString('utf-8').slice(0, 300)}`))
            return
          }
          try {
            resolve(JSON.parse(buf.toString('utf-8')) as T)
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err instanceof Error ? err.message : String(err)}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timed out after ${timeoutMs}ms`))
    })
    req.write(body)
    req.end()
  })
}

async function httpsGet(url: string, timeoutMs: number): Promise<HttpResponseBody> {
  const agent = await getProxyAgent()
  return new Promise((resolve, reject) => {
    const u = new NodeURL(url)
    const lib = u.protocol === 'http:' ? httpRequest : httpsRequest
    const req = lib(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + (u.search ?? ''),
        ...(agent ? { agent } : {}),
      } as unknown as Parameters<typeof httpsRequest>[0],
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }))
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)))
    req.end()
  })
}

// Proxy support: when running behind a forward proxy (clash / corp), set
// HTTPS_PROXY=http://host:port. We honor it by spawning the native request
// through https-proxy-agent — installed lazily only when a proxy is configured,
// so it never enters the non-proxy hot path.
async function getProxyAgent(): Promise<unknown> {
  const proxy =
    process.env['HTTPS_PROXY'] ??
    process.env['https_proxy'] ??
    process.env['ALL_PROXY'] ??
    process.env['all_proxy']
  if (!proxy) return undefined
  try {
    const mod = await import('https-proxy-agent') as { HttpsProxyAgent: new (p: string) => unknown }
    return new mod.HttpsProxyAgent(proxy)
  } catch {
    // Optional dep: only warn — caller will fall back to direct.
    console.warn('[openai-image] HTTPS_PROXY set but https-proxy-agent not installed; using direct connection')
    return undefined
  }
}

export interface ImageProviderConfig {
  apiKey: string
  model?: string
  baseURL?: string
  /** Absolute directory where PNGs are written (must exist or be creatable). */
  outputDir: string
  /** Web-accessible URL prefix for files written under outputDir (e.g. "/generated-images"). */
  publicPrefix: string
  /** OpenAI image size — any `WxH` with both divisible by 16 and aspect ≤3:1 (gpt-image-2), or 'auto'. */
  size?: string
  quality?: 'low' | 'medium' | 'high' | 'auto'
}

export interface GeneratedImage {
  url: string
  width: number
  height: number
  /** Relative path inside outputDir (e.g. "abc-123.png"). */
  filename: string
}

type MultipartPart = { name: string; value?: string; filename?: string; contentType?: string; data?: Buffer }

async function httpsPostMultipart<T>(url: string, parts: MultipartPart[], headers: Record<string, string>, timeoutMs: number): Promise<T> {
  const agent = await getProxyAgent()
  const boundary = `----maolab${randomUUID().replace(/-/g, '')}`
  const segments: Buffer[] = []
  for (const p of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${p.name}"`
    if (p.filename) head += `; filename="${p.filename}"`
    head += '\r\n'
    if (p.contentType) head += `Content-Type: ${p.contentType}\r\n`
    head += '\r\n'
    segments.push(Buffer.from(head, 'utf-8'))
    segments.push(p.data ?? Buffer.from(p.value ?? '', 'utf-8'))
    segments.push(Buffer.from('\r\n', 'utf-8'))
  }
  segments.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'))
  const body = Buffer.concat(segments)
  return new Promise((resolve, reject) => {
    const u = new NodeURL(url)
    const lib = u.protocol === 'http:' ? httpRequest : httpsRequest
    const req = lib(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'http:' ? 80 : 443),
        path: u.pathname + (u.search ?? ''),
        headers: { ...headers, 'Content-Type': `multipart/form-data; boundary=${boundary}`, 'Content-Length': body.length.toString() },
        ...(agent ? { agent } : {}),
      } as unknown as Parameters<typeof httpsRequest>[0],
      res => {
        const chunks: Buffer[] = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const buf = Buffer.concat(chunks)
          const status = res.statusCode ?? 0
          if (status < 200 || status >= 300) {
            reject(new Error(`OpenAI image edits API ${status}: ${buf.toString('utf-8').slice(0, 300)}`))
            return
          }
          try {
            resolve(JSON.parse(buf.toString('utf-8')) as T)
          } catch (err) {
            reject(new Error(`Invalid JSON response: ${err instanceof Error ? err.message : String(err)}`))
          }
        })
      },
    )
    req.on('error', reject)
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timed out after ${timeoutMs}ms`)))
    req.write(body)
    req.end()
  })
}

/**
 * Generate one image from a text prompt + one or more REFERENCE images via OpenAI
 * Images Edits API (gpt-image-2). Used to keep a fixed IP character consistent across
 * comic panels (img2img): pass the character asset(s) as referenceImagePaths.
 */
export async function generateOpenAIImageEdit(
  prompt: string,
  referenceImagePaths: string[],
  cfg: ImageProviderConfig,
): Promise<GeneratedImage> {
  if (!cfg.apiKey) throw new Error('generateOpenAIImageEdit: apiKey required')
  if (!referenceImagePaths.length) throw new Error('generateOpenAIImageEdit: at least one reference image required')

  const baseURL = (cfg.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = cfg.model ?? 'gpt-image-2'
  const size = cfg.size ?? '1024x1024'
  const quality = cfg.quality ?? 'medium'

  const parts: MultipartPart[] = [
    { name: 'model', value: model },
    { name: 'prompt', value: prompt.trim() },
    { name: 'size', value: size },
    { name: 'quality', value: quality },
    { name: 'n', value: '1' },
  ]
  for (const path of referenceImagePaths) {
    const data = await readFile(path)
    parts.push({ name: 'image[]', filename: basename(path), contentType: /\.png$/i.test(path) ? 'image/png' : 'image/jpeg', data })
  }

  const resp = await httpsPostMultipart<{ data?: Array<{ b64_json?: string; url?: string }> }>(
    `${baseURL}/images/edits`,
    parts,
    { Authorization: `Bearer ${cfg.apiKey}` },
    150_000,
  )
  const first = resp.data?.[0]
  if (!first) throw new Error('OpenAI image edits API returned no data')

  let buffer: Buffer
  if (first.b64_json) {
    buffer = Buffer.from(first.b64_json, 'base64')
  } else if (first.url) {
    const imgRes = await httpsGet(first.url, 60_000)
    if (imgRes.status < 200 || imgRes.status >= 300) throw new Error(`Failed to fetch image url: ${imgRes.status}`)
    buffer = imgRes.body
  } else {
    throw new Error('OpenAI image edits API: neither b64_json nor url present')
  }

  await mkdir(cfg.outputDir, { recursive: true })
  const filename = `${randomUUID()}.png`
  await writeFile(join(cfg.outputDir, filename), buffer)
  const prefix = cfg.publicPrefix.replace(/\/+$/, '')
  const dims = parseSize(size) ?? { width: 1024, height: 1024 }
  return { url: `${prefix}/${filename}`, width: dims.width, height: dims.height, filename }
}

/** 从 `WxH` 尺寸串解析宽高;'auto' 等非坐标串返回 null。 */
function parseSize(size: string): { width: number; height: number } | null {
  const m = /^(\d+)x(\d+)$/.exec(size)
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null
}

/**
 * Generate one image via OpenAI Images API (default: gpt-image-2) and persist as PNG.
 *
 * gpt-image-2 (released 2026-04-21) handles multilingual text rendering — including
 * simplified Chinese labels — far better than gpt-image-1. Override via
 * OPENAI_IMAGE_MODEL env var if needed.
 *
 * Returns a public URL (relative to publicPrefix) along with dimensions.
 */
export async function generateOpenAIImage(
  prompt: string,
  cfg: ImageProviderConfig,
): Promise<GeneratedImage> {
  if (!cfg.apiKey) throw new Error('generateOpenAIImage: apiKey required')

  const baseURL = (cfg.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  const model = cfg.model ?? 'gpt-image-2'
  const size = cfg.size ?? '1536x1024'
  const quality = cfg.quality ?? 'medium'

  const endpoint = `${baseURL}/images/generations`
  const body = JSON.stringify({ model, prompt: prompt.trim(), size, quality, n: 1 })

  // Use Node's native https module to bypass Next.js fetch instrumentation
  // (which intermittently breaks with undici interceptor mismatch in dev).
  const data = await httpsPostJson<{ data?: Array<{ b64_json?: string; url?: string }> }>(
    endpoint,
    body,
    {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cfg.apiKey}`,
    },
    120_000,
  )
  const first = data.data?.[0]
  if (!first) throw new Error('OpenAI image API returned no data')

  let buffer: Buffer
  if (first.b64_json) {
    buffer = Buffer.from(first.b64_json, 'base64')
  } else if (first.url) {
    const imgRes = await httpsGet(first.url, 60_000)
    if (imgRes.status < 200 || imgRes.status >= 300) {
      throw new Error(`Failed to fetch image url: ${imgRes.status}`)
    }
    buffer = imgRes.body
  } else {
    throw new Error('OpenAI image API: neither b64_json nor url present')
  }

  await mkdir(cfg.outputDir, { recursive: true })
  const filename = `${randomUUID()}.png`
  await writeFile(join(cfg.outputDir, filename), buffer)

  const prefix = cfg.publicPrefix.replace(/\/+$/, '')
  const dims = parseSize(size) ?? { width: 1536, height: 1024 }
  return {
    url: `${prefix}/${filename}`,
    width: dims.width,
    height: dims.height,
    filename,
  }
}
