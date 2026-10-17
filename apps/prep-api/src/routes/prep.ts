// 3d：/api/prep/*。判定顺序固定（计划"已定事实"，Ruling [T4] F6 调整）：渲染数据路径一律 404（server.ts 的 onRequest，先于鉴权，匿名也是 404）
// → 全局鉴权（server.ts，401）→ 未开鉴权 403 → 名单 403 → 路由（不存在 404）。
// 渲染数据路径 /api/prep/render[/...] 只由 render worker 在自己的浏览器里拦截供数（3b），api 永不提供：显式 404，不读任何课程，不看身份。
// 本插件内未处理的异常对浏览器一律是固定文案，日志只记错误名（异常文本可能带课程内容或上游响应）。
import type { FastifyPluginAsync } from 'fastify'
import { authEnabled, type ApiConfig } from '../config.ts'
import { prepAllowed } from '../prep/config.ts'
import { resolvePrepCredential } from '../harness/credential.ts'
import { PREP_ERRORS } from '../prep/errors.ts'
import { decodePathLeniently } from '../auth/route-path.ts'
import { prepCourseRoutes } from './prep-courses.ts'
import { prepArtifactRoutes } from './prep-artifacts.ts'
import { prepChatRoutes } from './prep-chat.ts'
import { prepKnowledgeRoutes } from './prep-knowledge.ts'

/** Ruling [T4] F6：渲染数据路径判定先归一再比对——重复斜杠、点段与 ..、百分号编码（含多重编码，如 %2F、%252F）、反斜杠、
 *  段内 ;参数、大小写都不能绕过。只用于决定"直接 404"，宁可多拦：归一后前三段是 api/prep/render 即算。 */
export function isPrepRenderPath(url: string): boolean {
  // T4 M-a（终审修复）：绝对形式的请求行（http://host/api/prep/render，直连 Node 时可能出现）先去掉 scheme 与 authority
  const target = url.replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]*/, '')
  // M1：宽松解码（非法 % 转义原样保留、不中断），多重编码反复解到稳定
  const path = decodePathLeniently(target.split(/[?#]/, 1)[0] ?? '')
  const segs: string[] = []
  for (const raw of path.replace(/\\/g, '/').split('/')) {
    const seg = (raw.split(';', 1)[0] ?? '').toLowerCase()
    if (seg === '' || seg === '.') continue
    if (seg === '..') { segs.pop(); continue }
    segs.push(seg)
  }
  return segs[0] === 'api' && segs[1] === 'prep' && segs[2] === 'render'
}

export function prepDenial(req: { user_id?: string }, config: ApiConfig): { error: string; code: string } | undefined {
  if (!authEnabled(config)) return PREP_ERRORS.unavailable
  if (!prepAllowed(config.prep, req.user_id ?? '')) return PREP_ERRORS.notEnabled
  return undefined
}

export const prepRoutes: FastifyPluginAsync = async (app) => {
  const { config, store } = app.deps
  const notFound = async (_req: unknown, reply: { code(n: number): { send(b: unknown): unknown } }) => reply.code(404).send(PREP_ERRORS.notFound)
  app.all('/api/prep/render', notFound)
  app.all('/api/prep/render/*', notFound)

  await app.register(async (scoped) => {
    scoped.setErrorHandler((error, _req, reply) => {
      const e = error as { name?: string; code?: string }
      if (typeof e.code === 'string' && e.code.startsWith('FST_ERR_CTP_')) return reply.code(400).send(PREP_ERRORS.bodyInvalid)
      scoped.log.warn(`prep-route: failed (${e.name ?? 'error'})`)
      return reply.code(500).send(PREP_ERRORS.failed)
    })
    // 闸门在 onRequest（server.ts 的根级 onRequest 已为 /api/prep 解析好身份）：先于请求体解析，名单外的账号带坏请求体也是 403
    scoped.addHook('onRequest', async (req, reply) => {
      // 兜底：根级 onRequest 已在鉴权前拦下渲染路径；这里再判一次，路由归一的差异也不会让任何身份落进下面的路由
      if (isPrepRenderPath(req.url)) return reply.code(404).send(PREP_ERRORS.notFound)
      // fail closed（Ruling [T4] fix round 1）：路由把请求交到本插件就一定要有身份——根级钩子因任何原因没解析时在这里解析，失败即拒绝
      if (req.user_id === undefined) {
        const ok = await app.authenticateRequest(req, reply)
        if (!ok || req.user_id === undefined) return reply.sent ? reply : reply.code(403).send(PREP_ERRORS.unavailable)
      }
      const denied = prepDenial(req, config)
      if (denied) return reply.code(403).send(denied)
    })
    scoped.get('/api/prep/status', async (req) => ({
      enabled: true,
      // D7：只认本人的云一凭证，不回退任何站点密钥（建会话、发消息用同一个 resolvePrepCredential）
      hasCredential: Boolean(await resolvePrepCredential(store, req.user_id!)),
      imagesAvailable: config.prep.imagesAvailable,
    }))
    await scoped.register(prepChatRoutes)
    await scoped.register(prepCourseRoutes)
    await scoped.register(prepArtifactRoutes)
    await scoped.register(prepKnowledgeRoutes)
    // /api/prep 本身也进闸门：名单外的账号在任何 /api/prep 路径上都是 403
    scoped.all('/api/prep', notFound)
    scoped.all('/api/prep/*', notFound)
  })
}
