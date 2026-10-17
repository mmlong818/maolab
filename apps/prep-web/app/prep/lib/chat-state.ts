// 备课对话的显示状态：服务端记录（loaded）+ 本页发出的消息（sent → 草稿 → done/error）。草稿以 requestId 为键。
// 终审修复：
// - M1：轮询的 loaded 不再整表替换——本页在途（inflight）、服务端还没有结果的请求保留本地的老师行与草稿，之后的帧照常落到草稿上；
//   没有到达服务端的本地失败（断网）保留错误行，老师可以重试。
// - M4：每项带 requestId（服务端记录也带），错误行可以用同一个 requestId、同样的内容重试（retryOf）；重发时去掉这个 requestId 的所有旧行。
export interface ChatTool { name?: string; ok: boolean; reason?: string; courseId?: string }
export interface PrepSession { id: string; title: string; courseId: string | null; createdAt: number; updatedAt: number }
export interface PrepTranscriptItem { id: string; runId: string; requestId?: string; role: 'teacher' | 'assistant' | 'error'; content: string; createdAt: number; tools?: ChatTool[]; code?: string }
export type ChatFrame =
  | { type: 'ping' }
  | { type: 'queued'; ahead: number }
  | { type: 'delta'; delta: string }
  | ({ type: 'tool' } & ChatTool)
  | { type: 'done'; runId: string; message: { id: string; content: string; createdAt: number }; tools: ChatTool[]; outcome: 'completed' | 'failed'; session: PrepSession }
  | { type: 'error'; error: string; code?: string }
export interface ChatItem { key: string; role: 'teacher' | 'assistant' | 'error' | 'draft'; content: string; tools: ChatTool[]; status?: string; requestId?: string }
export type ChatAction =
  | { type: 'loaded'; messages: PrepTranscriptItem[]; inflight?: readonly string[] }
  | { type: 'sent'; requestId: string; content: string }
  | { type: 'frame'; requestId: string; frame: ChatFrame }
  | { type: 'failed'; requestId: string; error: string }

const draftKey = (requestId: string) => `draft:${requestId}`
const teacherKey = (requestId: string) => `teacher:${requestId}`
const errorKey = (requestId: string) => `error:${requestId}`
/** 本页产生的行（服务端记录的键是 `<runId>:teacher` 这类，不以这些前缀开头） */
const isLocal = (m: ChatItem) => /^(teacher|draft|error):/.test(m.key)

function loaded(state: ChatItem[], messages: PrepTranscriptItem[], inflightIds: readonly string[]): ChatItem[] {
  const server: ChatItem[] = messages.map((m) => ({ key: m.id, role: m.role, content: m.content, tools: m.tools ?? [], ...(m.requestId ? { requestId: m.requestId } : {}) }))
  const inflight = new Set(inflightIds)
  const onServer = new Set(server.map((m) => m.requestId).filter(Boolean))
  const finished = new Set(server.filter((m) => m.role !== 'teacher').map((m) => m.requestId).filter(Boolean))
  const keep = (r: string) => (inflight.has(r) ? !finished.has(r) : !onServer.has(r) && state.some((m) => m.key === errorKey(r)))
  const local = state.filter((m) => isLocal(m) && m.requestId !== undefined && keep(m.requestId))
  const kept = new Set(local.map((m) => m.requestId))
  return [...server.filter((m) => !(m.requestId && kept.has(m.requestId))), ...local]
}

export function chatReducer(state: ChatItem[], action: ChatAction): ChatItem[] {
  if (action.type === 'loaded') return loaded(state, action.messages, action.inflight ?? [])
  const rid = action.requestId
  if (action.type === 'sent') {
    // 同一 requestId 重发（出错后重试、202 后再发）：先去掉这个 requestId 留下的所有行（本地的与服务端记录里的），键不重复，新帧落到新草稿上
    const own = new Set([teacherKey(rid), draftKey(rid), errorKey(rid)])
    return [...state.filter((m) => !own.has(m.key) && m.requestId !== rid), { key: teacherKey(rid), role: 'teacher', content: action.content, tools: [], requestId: rid }, { key: draftKey(rid), role: 'draft', content: '', tools: [], status: '备课助理正在处理…', requestId: rid }]
  }
  const key = draftKey(rid)
  const index = state.findIndex((m) => m.key === key)
  // 没有草稿（已 done 或已出错）：迟到的帧不改任何东西
  if (index < 0) return state
  const replace = (item: ChatItem) => [...state.slice(0, index), item, ...state.slice(index + 1)].filter((m, i) => i === index || m.key !== item.key)
  const draft = state[index]!
  // 错误行用自己的键：之后同一 requestId 的帧找不到草稿，不会覆盖它
  if (action.type === 'failed') return replace({ key: errorKey(rid), role: 'error', content: action.error, tools: draft.tools, requestId: rid })
  const f = action.frame
  if (f.type === 'ping') return state
  if (f.type === 'queued') return replace({ ...draft, status: `排队中：前面还有 ${f.ahead} 条` })
  if (f.type === 'delta') return replace({ ...draft, content: draft.content + f.delta, status: '备课助理正在处理…' })
  if (f.type === 'tool') {
    const { type: _t, ...tool } = f
    return replace({ ...draft, tools: [...draft.tools, tool] })
  }
  // outcome failed 的 done（模型额度、凭证等失败的回合）显示成错误行，不当成助理的回答
  if (f.type === 'done') return replace({ key: f.message.id, role: f.outcome === 'failed' ? 'error' : 'assistant', content: f.message.content, tools: f.tools, requestId: rid })
  return replace({ key: errorKey(rid), role: 'error', content: f.error, tools: draft.tools, requestId: rid })
}

/** 错误行的重试（M4）：同一个 requestId、同一条老师原话；找不到原话（例如只剩错误行）时不给重试 */
export function retryOf(items: readonly ChatItem[], item: ChatItem): { requestId: string; content: string } | null {
  if (item.role !== 'error' || !item.requestId) return null
  const teacher = items.find((m) => m.role === 'teacher' && m.requestId === item.requestId)
  return teacher && teacher.content.trim() ? { requestId: item.requestId, content: teacher.content } : null
}
