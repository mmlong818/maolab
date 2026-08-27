import { readFile } from 'node:fs/promises'
import { extname, resolve, sep } from 'node:path'
import { type NextRequest, NextResponse } from 'next/server'
import { isAllowedRemoteSceneImage } from '../../../../../../../lib/mainline/image-edit/cowart.js'
import { findMainlineCourse } from '../../../../../../../lib/mainline/store.js'

export const runtime = 'nodejs'

const MAX_SOURCE_IMAGE_BYTES = 15 * 1024 * 1024

export async function GET(_req: NextRequest, ctx: { params: Promise<{ courseId: string; sceneId: string }> }) {
  const { courseId, sceneId } = await ctx.params
  const course = await findMainlineCourse(courseId)
  const imageUrl = course?.scenes.find(item => item.id === sceneId)?.imageUrl
  if (!imageUrl) return NextResponse.json({ error: '图片不存在。' }, { status: 404 })

  try {
    if (imageUrl.startsWith('/')) return await localImageResponse(imageUrl)
    if (!isAllowedRemoteSceneImage(imageUrl)) {
      return NextResponse.json({ error: '不支持读取这个图片来源。' }, { status: 400 })
    }

    const response = await fetch(imageUrl, { redirect: 'error', signal: AbortSignal.timeout(30_000) })
    if (!response.ok) throw new Error(`source image HTTP ${response.status}`)
    const declaredLength = Number(response.headers.get('content-length') ?? 0)
    if (declaredLength > MAX_SOURCE_IMAGE_BYTES) throw new Error('source image too large')
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.length > MAX_SOURCE_IMAGE_BYTES) throw new Error('source image too large')
    return imageResponse(buffer, response.headers.get('content-type') ?? 'image/png')
  } catch (error) {
    console.error('[mainline-image-source]', error)
    return NextResponse.json({ error: '原图读取失败。' }, { status: 502 })
  }
}

async function localImageResponse(imageUrl: string): Promise<NextResponse> {
  const publicRoot = resolve(process.cwd(), 'public')
  const pathname = new URL(imageUrl, 'http://maolab.local').pathname
  const filePath = resolve(publicRoot, `.${pathname}`)
  if (filePath !== publicRoot && !filePath.startsWith(`${publicRoot}${sep}`)) {
    return NextResponse.json({ error: '图片路径无效。' }, { status: 400 })
  }
  const buffer = await readFile(filePath)
  if (buffer.length > MAX_SOURCE_IMAGE_BYTES) throw new Error('source image too large')
  const extension = extname(filePath).toLowerCase()
  const mimeType = extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg' : 'image/png'
  return imageResponse(buffer, mimeType)
}

function imageResponse(buffer: Buffer, mimeType: string): NextResponse {
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Cache-Control': 'private, max-age=60',
      'Content-Type': mimeType.startsWith('image/') ? mimeType : 'image/png',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
