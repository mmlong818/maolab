// 3d：备课产物下载（截图证据、配图、PPTX；S4 起还有课程包与撤回单）。按 owner 取（过期视为不存在），别人的、过期的、不存在的一律 404，正文一字不差。
// 浏览器的 <img> 与下载链接带不了请求头：用 2e 已有的 ?token=（server.ts 的日志序列化会抹掉它）。
// 绝不复用 /api/prep/render 的数据路径（3b）；SVG 同源下载要 CSP sandbox 与 nosniff（3b Note for 3d），脚本不会在本站源下执行。
import type { FastifyPluginAsync } from 'fastify'
import { ARTIFACT_CONTENT_TYPES, PACKAGE_CONTENT_TYPE, PPTX_CONTENT_TYPE, RECALL_CONTENT_TYPE, type StoredArtifact } from '@maolab/domain'
import { PREP_ERRORS } from '../prep/errors.ts'
import { validId } from './prep-courses.ts'

/** 与 worker 供 SVG 的指令一致（workers/render/src/page-host.ts SVG_HEADERS），外加 sandbox：直接打开也不在本站源下执行任何脚本 */
const SVG_CSP = "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:"
const NAME_MAX = 80

/** 下载文件名：去掉控制字符、引号、斜杠与反斜杠，去掉双向控制字符（防伪装扩展名），压空白，按码点最长 80 字（不切半个代理对），补扩展名（缺省 .pptx） */
export function attachmentName(raw: string | undefined, fallback: string, ext = '.pptx'): string {
  const cleaned = (raw ?? '')
    .replace(/[‎‏‪-‮⁦-⁩]/g, '')
    .replace(/[\u0000-\u001f\u007f"\\/]+/g, ' ')
    .replace(/\s+/g, ' ').trim()
  const stem = cleaned.toLowerCase().endsWith(ext) ? cleaned.slice(0, cleaned.length - ext.length) : cleaned
  const short = Array.from(stem).slice(0, NAME_MAX).join('').trim()
  return `${short || fallback}${ext}`
}

/** RFC 5987 ext-value：encodeURIComponent 不转义的 ' ( ) * 也不是 attr-char，补转义 */
const rfc5987 = (value: string): string => encodeURIComponent(value).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export const prepArtifactRoutes: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string }; Querystring: { name?: string } }>('/api/prep/artifacts/:id', async (req, reply) => {
    if (!validId(req.params.id)) return reply.code(404).send(PREP_ERRORS.notFound)
    let artifact: StoredArtifact | undefined
    try {
      artifact = await app.prep.courses.artifacts(req.user_id!).get(req.params.id)
    } catch (error) {
      // T7 review M5：不在 PG 里的行（对象存储迁移后）本 api 读不到字节，按不存在处理；其余错误照常走 500
      if (/not stored in PG/.test((error as Error | null)?.message ?? '')) return reply.code(404).send(PREP_ERRORS.notFound)
      throw error
    }
    // T7 review M1：put 已按白名单收类型；下载端再核一次，迁移或旧行不经 put 时也不会把任意类型从本站源发出
    if (!artifact || !ARTIFACT_CONTENT_TYPES.includes(artifact.contentType)) return reply.code(404).send(PREP_ERRORS.notFound)
    reply.header('content-type', artifact.contentType)
    reply.header('x-content-type-options', 'nosniff')
    reply.header('cache-control', 'private, no-store')
    if (artifact.contentType === 'image/svg+xml') reply.header('content-security-policy', SVG_CSP)
    // 导出件一律按附件下载：PPTX、课程包（S4，zip）、撤回单（S4，JSON；只有 kind recall 用这个类型）
    const attachment = artifact.contentType === PPTX_CONTENT_TYPE ? { ext: '.pptx', fallback: '课件', ascii: 'course.pptx' }
      : artifact.contentType === PACKAGE_CONTENT_TYPE ? { ext: '.maolab-course.zip', fallback: '课程包', ascii: 'course.maolab-course.zip' }
      : artifact.contentType === RECALL_CONTENT_TYPE ? { ext: '.recall.json', fallback: '撤回单', ascii: 'package.recall.json' }
      : undefined
    if (attachment) {
      const name = attachmentName(typeof req.query.name === 'string' ? req.query.name : undefined, attachment.fallback, attachment.ext)
      reply.header('content-disposition', `attachment; filename="${attachment.ascii}"; filename*=UTF-8''${rfc5987(name)}`)
    }
    return reply.send(artifact.bytes)
  })
}
