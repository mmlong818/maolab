// 插件 yunyi-finalize（备课室版）：网关在会话的 turn/end 时调用 finalize(agent, end)，由它发 yunyi/turn-final（经网关 yunyi/* 通用转发进 SSE），
// api 据此收尾备课回合。备课室只有 prep 会话（以及测试用的探针 preset），没有导师定稿：prep 会话走 prep/finalize.ts，其他会话不发帧。
// 结束原因的分类与额度、凭证判定与自习室的导师定稿相同（自 maolab-ai-learning packages/bundle/src/finalize.ts 迁入，只留备课用到的部分）：
// completed / max-tokens 为有效结束；aborted 带 reason（AgentCancelCause），其中 disposed 是宿主释放而非用户取消，按失败处理；
// error 带 error: LlmFailure（message/code/status）；blocked、interrupted、forked 与缺省原因都按失败处理。
import { createPrepFinalizer, type PrepTurnFinal } from './prep/finalize.ts'

export const name = 'yunyi-finalize'
export const inject = ['yunyiSessions']

export type ModelError = 'quota' | 'credential'
/** dsh turn/end 的 data。reason.reason 是 aborted 的取消原因（AgentCancelCause） */
export interface TurnEndData { reason?: { kind?: string; message?: string; error?: unknown; reason?: { kind?: string } } }

// 云一网关额度不足回 403/401，按文案判断
const QUOTA = /insufficient_user_quota|insufficient[\s_]+quota|insufficient_credits|payment\s+required|\b402\b|用户额度不足|令牌额度已用尽|额度不足|余额不足|积分不足|账户已?欠费/i
export const isQuotaError = (text: string): boolean => QUOTA.test(text)

/** turn/end 的失败原因 → 额度不足或凭证过期；凭证过期只认上游 401（llm-yunyi 对 401/403 都抛 code AUTH，所以不看 AUTH，只看 status 与 "HTTP 401"） */
export function modelErrorOf(reason: TurnEndData['reason']): ModelError | undefined {
  const err = reason?.error as { message?: unknown; code?: unknown; status?: unknown } | undefined
  const text = [reason?.message, err?.message, err?.code].filter((v) => typeof v === 'string').join(' ')
  if (isQuotaError(text)) return 'quota'
  if (/\bHTTP 401\b/.test(text) || err?.status === 401) return 'credential'
  return undefined
}

const LIVE_KINDS = new Set(['completed', 'max-tokens'])
const CANCEL_KINDS = new Set(['cancelled', 'canceled', 'aborted'])

export function classifyTurnEnd(reason: TurnEndData['reason']): 'live' | 'cancelled' | 'failed' {
  const kind = reason?.kind
  if (kind !== undefined && LIVE_KINDS.has(kind)) return 'live'
  if (kind !== undefined && CANCEL_KINDS.has(kind) && reason?.reason?.kind !== 'disposed') return 'cancelled'
  return 'failed'
}

export interface FinalizeDeps {
  isPrep(agent: { id: unknown }): boolean
  emit(event: string, payload: unknown): void
}

export function createFinalizer(deps: FinalizeDeps): { finalize(agent: { id: unknown }, end: TurnEndData): Promise<PrepTurnFinal | undefined> } {
  const finalizer = createPrepFinalizer({ classify: (r) => classifyTurnEnd(r as TurnEndData['reason']), modelErrorOf: (r) => modelErrorOf(r as TurnEndData['reason']) })
  return {
    async finalize(agent, end) {
      if (!deps.isPrep(agent)) return undefined
      const final = finalizer.finalize(agent as object, end)
      if (!final) return undefined
      // 发帧失败不让 finalize reject；日志只写类别
      try {
        deps.emit('yunyi/turn-final', { agent, ...final })
      } catch (e) {
        process.stderr.write(`yunyi-finalize: emit failed${e instanceof Error ? ` (${e.name})` : ''}\n`)
      }
      return final
    },
  }
}

interface FinalizeCtx { yunyiSessions: { presetOfSession(sessionId: string): string | undefined }; provide(name: string, value: unknown): void; emit(event: string, payload: unknown): unknown }
export function apply(ctx: FinalizeCtx): void {
  ctx.provide('yunyiFinalize', createFinalizer({
    isPrep: (agent) => ctx.yunyiSessions.presetOfSession(String(agent.id)) === 'prep',
    emit: (e, p) => { ctx.emit(e, p) },
  }))
}
