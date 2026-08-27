import { createReadStream } from 'node:fs'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { NextResponse } from 'next/server'

import {
  findEducationResourceRoot,
  resolveEducationResourceFile,
} from '../../../../../lib/education-resources/catalog.js'

export const runtime = 'nodejs'

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.geojson': 'application/geo+json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
}

export async function GET(_request: Request, context: { params: Promise<{ path: string[] }> }) {
  try {
    const { path } = await context.params
    const resource = await resolveEducationResourceFile(findEducationResourceRoot(), path.join('/'))
    const stream = Readable.toWeb(createReadStream(resource.path)) as ReadableStream<Uint8Array>
    const mediaType = MIME_TYPES[extname(resource.path).toLowerCase()] ?? 'application/octet-stream'

    return new Response(stream, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
        'Content-Length': String(resource.size),
        'Content-Type': mediaType,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const invalid = message.includes('路径') || message.includes('允许目录')
    return NextResponse.json({ error: invalid ? '教育资源路径无效。' : '教育资源不存在。' }, { status: invalid ? 400 : 404 })
  }
}
