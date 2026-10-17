// 备课对话的发送流程（终审修复，从 PrepChat 抽出，便于在 node 测试环境里测）：
// - M3：还没有会话时，两次很快的发送只建一个会话（建会话的 Promise 共享，失败后清掉可重试）；
// - M2：流正常结束但没收到 done/error 帧（'streamed' 却没有终帧）时，改为重读会话记录，草稿不会一直挂着"正在处理"；
// - M4：send 可以带上原来的 requestId 重试同一条消息（api 对进行中的同一请求回 202、已完成的回放，不会再派一个回合）；
//   同一个 requestId 已在本页发送中时不重复发；
// - M1：inflight() 给出本页在途的 requestId，轮询的 loaded 据此保留在途草稿。
import { newRequestId, type prepApi } from '../lib/api'
import type { ChatAction, ChatFrame, PrepSession } from '../lib/chat-state'
import { errorText } from '../errors'

export const SEND_FAILED_TEXT = '连接中断了：备课助理可能还在处理，稍后会自动刷新。'
/** 发送失败后多久重读会话记录 */
export const RELOAD_AFTER_FAILURE_MS = 3000

export interface ChatControllerDeps {
  api: Pick<typeof prepApi, 'createSession' | 'send'>
  dispatch(action: ChatAction): void
  courseId(): string | null
  /** 当前显示的会话：帧只落到发起它的会话仍在显示时 */
  viewing: { current: string | null }
  sessionCreated(session: PrepSession): void
  /** 已落到列表上的帧的副作用（面板重读、会话更新） */
  frame(frame: ChatFrame): void
  /** 重读会话记录（delayMs = 0 立即） */
  reload(sessionId: string, delayMs: number): void
  inflightChanged(count: number): void
}

export function createChatController(deps: ChatControllerDeps) {
  let session: PrepSession | null = null
  let creating: Promise<PrepSession> | null = null
  const inflight = new Set<string>()

  function ensureSession(): Promise<PrepSession> {
    if (session) return Promise.resolve(session)
    if (!creating) {
      const courseId = deps.courseId()
      const attempt: Promise<PrepSession> = deps.api.createSession(courseId ? { courseId } : {}).then(({ session: created }) => {
        if (creating === attempt) creating = null
        session = created
        deps.viewing.current = created.id
        deps.sessionCreated(created)
        return created
      }, (e: unknown) => {
        if (creating === attempt) creating = null
        throw e
      })
      creating = attempt
    }
    return creating
  }

  async function send(content: string, requestId: string = newRequestId()): Promise<void> {
    const text = content.trim()
    if (!text || inflight.has(requestId)) return
    inflight.add(requestId)
    deps.inflightChanged(inflight.size)
    deps.dispatch({ type: 'sent', requestId, content: text })
    let target: PrepSession | null = session
    let reloadAfter: number | null = null
    try {
      target = await ensureSession()
      const started = target
      const courseId = deps.courseId()
      let terminal = false
      const outcome = await deps.api.send(started.id, { content: text, requestId, ...(courseId ? { courseId } : {}) }, (frame) => {
        if (frame.type === 'done' || frame.type === 'error') terminal = true
        if (deps.viewing.current !== started.id) return
        deps.dispatch({ type: 'frame', requestId, frame })
        deps.frame(frame)
      })
      // 202（同一请求还在处理）或流结束却没有终帧：以服务端记录为准
      if (outcome === 'running' || (outcome === 'streamed' && !terminal)) reloadAfter = 0
    } catch (e) {
      deps.dispatch({ type: 'failed', requestId, error: errorText(e, SEND_FAILED_TEXT) })
      reloadAfter = RELOAD_AFTER_FAILURE_MS
    } finally {
      inflight.delete(requestId)
      deps.inflightChanged(inflight.size)
    }
    // 先移出在途再重读：loaded 用服务端的记录替换这一条
    const id = target?.id
    if (reloadAfter !== null && id && deps.viewing.current === id) deps.reload(id, reloadAfter)
  }

  return {
    send,
    ensureSession,
    /** 老师切换会话或加载到会话时同步（null = 新的对话） */
    setSession(next: PrepSession | null) { session = next; if (!next) creating = null },
    inflight: (): string[] => [...inflight],
    isInflight: (requestId: string): boolean => inflight.has(requestId),
  }
}
export type ChatController = ReturnType<typeof createChatController>
