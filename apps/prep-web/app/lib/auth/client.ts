// 登录 SDK（dual-login-sdk 浏览器包，vendored 自 byte-bite）单例。浏览器只持有本站 opaque token；
// 云一 OAuth 跳转、PKCE、回调换 token、AI 员工平台入场、登出后强制重新认证都由 SDK 负责。
// 后端未开启账号时 /api/auth/config 返回 enabled:false，bootstrap 直接得到空 token，页面照常使用（单用户模式）。
import { createClient } from '../vendor/agentia-auth/agentia-auth-browser.esm-browser.js'
import { withSessionHeader } from './session-header'
import type { AuthClient } from '../vendor/agentia-auth/agentia-auth-browser.esm-browser.js'

const GATE_TEXT: Record<string, string> = {
  'auth.gate_title': '猫叔备课室',
  'auth.gate_desc': '登录后开始备课，课程会保存在你的账号下',
  'auth.gate_btn': '登录',
  'auth.gate_busy': '登录中…',
  'auth.gate_expired': '登录已过期，请重新登录',
}

let client: AuthClient | null = null
let ready: Promise<string> | null = null

export function authClient(): AuthClient {
  if (!client) {
    client = createClient({
      apiBase: '', // 同源：/api 由 Nginx（部署）或 next dev 转发到后端
      callbackPath: '/login-callback', // 与云一登记的 redirect_uri 一致
      storageKey: 'maolab-prep-token',
      modeKey: 'maolab-prep-auth-mode',
      appName: '猫叔备课室',
      logo: '猫',
      fetch: window.fetch.bind(window), // SDK 内部请求必须用原生 fetch，不能走 apiFetch
      t: (key: string, fallback?: string) => GATE_TEXT[key] ?? fallback ?? key,
      wallet: false, // 余额由页面自己渲染（AccountMenu）
      // 平台网关（Kong nd-auth-restriction）会 403 掉任何带 `Authorization: Bearer` 的请求，
      // 本站 token 一律放 ?token=，SDK 自己的请求也不再先白撞一次 403
      tokenTransport: 'query',
    })
  }
  return client
}

/** 身份就绪：已登录返回 token；未开启账号返回空串；显示登录门或正在跳转时永不 resolve。 */
export function authReady(): Promise<string> {
  if (!ready) ready = authClient().bootstrap()
  return ready
}

/** 业务接口请求：等身份就绪后以 X-Session-Token 请求头带上本站 token（生产网关只拦 Authorization: Bearer）；撞 401 回到登录门。 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = (await authReady()) || authClient().getStored()
  const response = await fetch(input, withSessionHeader(init, token))
  if (response.status === 401 && token) ready = authClient().reauth()
  return response
}

/** 无法带请求头的地址（下载链接）：附加 ?token=，后端与 SDK 同样接受。 */
export function withAuthToken(url: string): string {
  const token = client?.getStored()
  return token ? authClient().withTokenQuery(url, token) : url
}

export function logout(): void {
  authClient().logout()
}
