import { readPrepConfig, type PrepConfig } from './prep/config.ts'

export interface ApiConfig {
  port: number
  pgUrl: string
  secretKey: string
  oidc: { clientId: string; clientSecret: string; authority?: string | undefined; tokenTtl: string; gatewayBaseUrl?: string | undefined }
  portalBaseUrl: string
  portalPlanCodes: string[] | undefined
  adminUsers: Set<string>
  /** 可信代理跳数（Fastify trustProxy）：1 = 只信任紧邻的 Nginx。 */
  trustProxy: number
  /** 备课宿主（harness 控制网关）：地址、内部密钥、单次控制调用上限 */
  harness: HarnessConfig
  /** 备课：YUNYI_PREP=off|list|all（缺省 all）；off = /api/prep/* 一律 403 PREP_NOT_ENABLED。 */
  prep: PrepConfig
}

export interface HarnessConfig {
  url: string
  internalKey: string
  /** 单次 harness 控制调用（建/续/prompt/cancel/dispose）与事件流建立（到 ": connected"）的上限 */
  timeoutMs: number
}

export const posInt = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} 必须是正整数`)
  return n
}

export function readHarnessConfig(env: NodeJS.ProcessEnv): HarnessConfig {
  return {
    url: (env.YUNYI_HARNESS_URL ?? '').trim().replace(/\/+$/, ''),
    internalKey: (env.YUNYI_INTERNAL_KEY ?? '').trim(),
    timeoutMs: posInt(env.YUNYI_HARNESS_TIMEOUT_MS, 10_000, 'YUNYI_HARNESS_TIMEOUT_MS'),
  }
}

function readTrustProxy(raw: string | undefined): number {
  const n = Number((raw ?? '').trim())
  return raw?.trim() && Number.isInteger(n) && n >= 0 ? n : 1
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const codesRaw = (env.PORTAL_PLAN_CODES ?? '').trim()
  const codes = !codesRaw ? undefined : codesRaw.startsWith('[') ? (JSON.parse(codesRaw) as string[]) : codesRaw.split(',').map((s) => s.trim()).filter(Boolean)
  const secret = env.OIDC_CLIENT_SECRET ?? ''
  const harness = readHarnessConfig(env)
  return {
    port: Number(env.API_PORT ?? 8101),
    pgUrl: env.PG_DATABASE_URL ?? '',
    secretKey: (env.SECRET_ENCRYPTION_KEY ?? '').trim(),
    oidc: {
      clientId: (env.OIDC_CLIENT_ID ?? '').trim(),
      clientSecret: secret.startsWith('<') ? '' : secret,
      authority: env.OIDC_AUTHORITY?.trim().replace(/\/+$/, '') || undefined,
      tokenTtl: env.OIDC_TOKEN_TTL?.trim() || '720h',
      gatewayBaseUrl: env.OIDC_GATEWAY_BASE_URL?.trim().replace(/\/+$/, '') || undefined,
    },
    portalBaseUrl: (env.PORTAL_BASE_URL ?? '').trim().replace(/\/+$/, ''),
    portalPlanCodes: codes,
    trustProxy: readTrustProxy(env.API_TRUST_PROXY),
    adminUsers: new Set((env.MAOLAB_ADMIN_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    harness,
    prep: readPrepConfig(env, harness),
  }
}

export const authEnabled = (c: ApiConfig) => Boolean(c.oidc.clientId || c.portalBaseUrl)
