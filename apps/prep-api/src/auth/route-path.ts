// Ruling [T4] fix round 1（C1/C1′）：鉴权与闸门按路由视角给请求分类。
// find-my-way 匹配前会把 %70、%61 这类转义解码，原始 req.url 与路由看到的路径不一致：
// 按原始字符串判断"是不是 /api/、是不是 prep"会漏掉身份解析（/%61pi/account/me 匿名进了处理函数，/api/%70rep/* 孩子进了 prep）。
import type { FastifyRequest } from 'fastify'

/** 宽松解码：只替换合法的 %XX（非法转义原样保留，不抛错），反复到稳定（多重编码），最多 4 轮。只用于分类，不用于取数 */
export function decodePathLeniently(path: string): string {
  let out = path
  for (let i = 0; i < 4; i++) {
    const next = out.replace(/%([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    if (next === out) break
    out = next
  }
  return out
}

/** 请求的分类键：命中路由时取路由模板（如 '/api/prep/*'、'/api/prep/courses/:id'，与处理函数一一对应，权威）；
 *  没有命中路由（只会走 404 处理）时取宽松解码后的路径——此时只决定回 401 还是 404，不会进任何处理函数 */
export function routeKey(req: Pick<FastifyRequest, 'url' | 'routeOptions'>): string {
  const route = req.routeOptions?.url
  if (typeof route === 'string' && route) return route
  return decodePathLeniently(req.url.split('?', 1)[0] ?? '')
}

/** prep 插件的路由（routes/prep.ts 的 '/api/prep'、'/api/prep/*' 及以后在其下注册的路由） */
export const isPrepKey = (key: string): boolean => key === '/api/prep' || key.startsWith('/api/prep/')
