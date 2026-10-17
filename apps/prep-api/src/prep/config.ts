// 备课开关与回合参数。YUNYI_PREP 缺省 all（备课室就是备课产品）；list 只开给名单里的账号，off 关闭。非法值使 api 启动失败；非 off 时要求 harness 地址与内部密钥。
// 回合超时按分钟计：3c T12 真实模型单回合最长 626.6 秒，缺省 30 分钟。
// 课程与知识点 schema 与 harness profile 的 yunyi-prep 同名变量一致（YUNYI_COURSE_SCHEMA 只给测试用，生产不得设置，3c 交接）。
// 图像是否可用与 harness 同读 YUNYI_PREP_IMAGE_MODEL（用户裁决 D3 缺省空 = 不可用）：面板的"确认计划"与对话工具对图像页的判定一致。
import type { HarnessConfig } from '../config.ts'

export type PrepMode = 'off' | 'list' | 'all'
export interface PrepConfig {
  mode: PrepMode
  /** list 模式的账号用户名（不是学习者档案 id） */
  users: Set<string>
  turnTimeoutMs: number
  heartbeatMs: number
  courseSchema: string
  knowledgeSchema: string
  imagesAvailable: boolean
  /** 备课会话的 agent 模型（dsh provider 与 model）：YUNYI_TURN_PROVIDER、YUNYI_TURN_MODEL，缺省 yunyi / glm-5.3 */
  provider: string
  model: string
}
export const DEFAULT_PREP_TURN_TIMEOUT_MS = 1_800_000
export const PREP_STALE_MARGIN_MS = 15_000
/** 进行中的回合超过"超时 + 余量"仍是 running 视为丢失（api 重启），同 requestId 可重新占位 */
export const prepStaleMs = (prep: PrepConfig): number => prep.turnTimeoutMs + PREP_STALE_MARGIN_MS
const SCHEMA_RE = /^[a-z_][a-z0-9_]*$/

const posInt = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${name} 必须是正整数`)
  return n
}
const schemaOf = (raw: string | undefined, fallback: string, name: string): string => {
  const v = (raw ?? '').trim() || fallback
  if (!SCHEMA_RE.test(v)) throw new Error(`${name} 不是合法的 schema 名：${v}`)
  return v
}

export function readPrepConfig(env: NodeJS.ProcessEnv, harness: HarnessConfig): PrepConfig {
  const mode = (env.YUNYI_PREP ?? 'all').trim() || 'all'
  if (mode !== 'off' && mode !== 'list' && mode !== 'all') throw new Error(`YUNYI_PREP 只能是 off、list、all：${mode}`)
  const prep: PrepConfig = {
    mode,
    users: new Set((env.YUNYI_PREP_USERS ?? '').split(',').map((s) => s.trim()).filter(Boolean)),
    turnTimeoutMs: posInt(env.YUNYI_PREP_TURN_TIMEOUT_MS, DEFAULT_PREP_TURN_TIMEOUT_MS, 'YUNYI_PREP_TURN_TIMEOUT_MS'),
    heartbeatMs: posInt(env.YUNYI_PREP_HEARTBEAT_MS, 15_000, 'YUNYI_PREP_HEARTBEAT_MS'),
    courseSchema: schemaOf(env.YUNYI_COURSE_SCHEMA, 'course', 'YUNYI_COURSE_SCHEMA'),
    knowledgeSchema: schemaOf(env.YUNYI_PREP_KNOWLEDGE_SCHEMA, 'kp', 'YUNYI_PREP_KNOWLEDGE_SCHEMA'),
    imagesAvailable: Boolean((env.YUNYI_PREP_IMAGE_MODEL ?? '').trim()),
    provider: (env.YUNYI_TURN_PROVIDER ?? 'yunyi').trim() || 'yunyi',
    model: (env.YUNYI_TURN_MODEL ?? 'glm-5.3').trim() || 'glm-5.3',
  }
  if (mode !== 'off') for (const [name, value] of [['YUNYI_HARNESS_URL', harness.url], ['YUNYI_INTERNAL_KEY', harness.internalKey]] as const) {
    if (!value) throw new Error(`YUNYI_PREP=${mode} 需要 ${name}`)
  }
  return prep
}

export function prepAllowed(prep: PrepConfig, username: string): boolean {
  if (prep.mode === 'all') return true
  if (prep.mode === 'list') return prep.users.has(username)
  return false
}
