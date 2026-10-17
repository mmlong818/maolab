export const SESSION_HEADER = 'X-Session-Token'

/** 业务请求用请求头带本站 token（生产 Kong 只拦 Authorization: Bearer）；下载链接仍用 ?token=。 */
export function withSessionHeader(init: RequestInit, token: string): RequestInit {
  if (!token) return init
  const headers = new Headers(init.headers)
  headers.set(SESSION_HEADER, token)
  return { ...init, headers }
}
