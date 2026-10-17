export interface TokenRequest {
  headers?: Readonly<Record<string, string | string[] | undefined>> | undefined
  query?: unknown
}

/** 本站 token 的传输位置：X-Session-Token（生产 Kong 只拦 Authorization: Bearer）→ ?token=（下载链接）→ Bearer（本地）。 */
export function getToken(req: TokenRequest): string {
  const header = req.headers?.['x-session-token']
  const h = Array.isArray(header) ? header[0] : header
  if (typeof h === 'string' && h.trim()) return h.trim()
  const q = (req.query as Record<string, unknown> | undefined)?.token
  if (typeof q === 'string' && q.trim()) return q.trim()
  const auth = req.headers?.authorization
  const a = Array.isArray(auth) ? auth[0] : auth
  return typeof a === 'string' ? a.replace(/^Bearer\s+/i, '').trim() : ''
}
