// 3d：prep 会话的回合定稿。prep preset 不挂 pre-step，没有导师的回合状态，导师定稿对它什么都不发（finalize.ts 的 getTurnState 为空）；
// api 要靠 yunyi/turn-final { runId } 收尾（apps/api/src/learning/harness-client.ts 的 turnFinalOf），这里补上：
// - runId = 本回合学生消息的 id，即网关 followup 交给 agent 的 messageId（= api 的回合 id，实测：prep-final.test.ts）；网关在 finalize 的 context 里直接给，
//   日志里的最后一条学生消息只作后备（压缩后它可能已不在日志里，回复与工具改取压缩后剩下的日志）；
// - reply = 本回合 assistant 文字（与导师同一取法：去重复述，再 stripToolChatter(emptyIfAll) 剥离旁白与伪调用；另剥 prep 工具名的伪调用块，
//   因为 chatter.ts 的工具名表只有导师工具，改它会动导师定稿）；剥完为空用"已处理。"，不把原始块交出去；失败回合用备课版兜底文案（工具写进课程的改动不受影响）；
// - tools = 本回合每条工具结果的 ok/reason/课程 id（工具结果 JSON 来自 packages/bundle/src/tools/prep-tools.ts）；
// - 不写教学文档、不登记检查题、不碰记忆：备课不是学习回合。
// - 去重按回合结束，不按 messageId（Ruling [T2/T8] F4）：api 对失败、超时、取消的回合用同一个 messageId 重试，
//   dsh 接受重复 id（实测：新回合里再追加一条同 id 的学生消息），每次重试都要有自己的终帧，否则 api 挂满回合超时。
//   回合结束的标识优先取 turn/end 的 data.turn（dsh 每个 agent 递增的回合号，实测有），没有时退到"学生消息条数 + 最新 id"
//   （重试追加了一条新的学生消息，条数变了）；只记上一次定稿的标识，同一回合结束重复调用不再发帧。
// 本文件不 import finalize.ts（避免循环），分类函数由 finalize.ts 注入。
import { randomUUID } from 'node:crypto'
import { stripToolChatter } from '../chatter.ts'
import { currentTurnAssistantText, currentTurnMessages, studentMessageIds } from '../plan-store.ts'
import { PREP_TOOL_NAMES } from '../tools/prep-tools.ts'

export interface PrepToolOutcome { name?: string; ok: boolean; reason?: string; courseId?: string }
export type PrepTurnFinal =
  | { runId: string; cancelled: true }
  | { runId: string; prep: true; assistantMessageId: string; reply: string; outcome: 'completed' | 'failed'; tools: PrepToolOutcome[]; modelError?: 'quota' | 'credential' }

export function prepFallbackReply(kind: 'quota' | 'credential' | undefined): string {
  if (kind === 'quota') return '云一账户额度不足，这一步没有完成。充值后重新发送这条消息即可；课程里已经保存的内容不受影响。'
  if (kind === 'credential') return '登录已过期，这一步没有完成。请退出后重新登录，再重新发送这条消息；课程里已经保存的内容不受影响。'
  return '这一步没有完成。课程里已经保存的内容不受影响，可以直接重新发送这条消息，或在右侧面板查看课程当前状态。'
}

const textOf = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((b) => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : '')).join('')
}

// prep 工具名的伪调用（与 chatter.ts 同三种形状：成对 XML 块、自闭合、GLM 原生 <tool_call>）；整行只剩伪调用的行连同换行去掉
const PREP_NAMES = PREP_TOOL_NAMES.join('|')
const PREP_XML_BLOCK = new RegExp(`<(${PREP_NAMES})(?:\\s[^<>]*)?>[\\s\\S]*?</\\1\\s*>`, 'g')
const PREP_XML_SELF = new RegExp(`<(?:${PREP_NAMES})(?:\\s[^<>]*)?/>`, 'g')
const PREP_GLM_CALL = new RegExp(`<tool_call>\\s*(?:${PREP_NAMES})\\b[\\s\\S]*?</tool_call>`, 'g')
const MARK = '\u0000'
function stripPrepToolBlocks(text: string): string {
  const marked = text.replace(PREP_GLM_CALL, MARK).replace(PREP_XML_SELF, MARK).replace(PREP_XML_BLOCK, MARK)
  if (!marked.includes(MARK)) return text
  return marked.split('\n')
    .filter((line) => !(line.includes(MARK) && line.split(MARK).join('').trim() === ''))
    .map((line) => line.split(MARK).join(''))
    .join('\n')
}

/** 本回合 assistant 消息里的工具调用块：调用 id → 工具名（实测：dsh 的工具结果消息不带工具名，只有 toolCallId 指回调用块 { type:'tool-call', id, name }） */
function toolNamesOf(messages: Array<Record<string, unknown>>): Map<string, string> {
  const names = new Map<string, string>()
  for (const m of messages) {
    if (m.role !== 'assistant' || !Array.isArray(m.content)) continue
    for (const b of m.content as Array<{ type?: unknown; id?: unknown; name?: unknown } | null>) {
      if (b?.type === 'tool-call' && typeof b.id === 'string' && typeof b.name === 'string' && b.name) names.set(b.id, b.name)
    }
  }
  return names
}

/** 工具消息 → 结果摘要；不是工具消息或解析不了返回 undefined。
 *  实测（prep 宿主的 tool/result 事件）：role 'tool'，toolCallId 指回 assistant 消息的调用块，工具名从调用块取；取不到名字时省略 name */
function toolOutcomeOf(message: Record<string, unknown>, names: Map<string, string>): PrepToolOutcome | undefined {
  if (message.role !== 'tool' && message.role !== 'toolResult') return undefined
  const callId = message.toolCallId
  const nameRaw = message.name ?? message.toolName ?? (typeof callId === 'string' ? names.get(callId) : undefined)
  const named = typeof nameRaw === 'string' && nameRaw ? { name: nameRaw } : {}
  // fix round 1：结果读不出 { ok } 时不丢，记失败并给原因（isError → tool-error；截断或非 JSON → unreadable-result）。
  // skill 工具的结果本来就是文本（<skill_content …>），不按失败计，只看 isError
  let parsed: Record<string, unknown> | undefined
  try { parsed = JSON.parse(textOf(message.content)) as Record<string, unknown> } catch { parsed = undefined }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') {
    if (message.isError === true) return { ...named, ok: false, reason: 'tool-error' }
    if (nameRaw === 'skill') return { ...named, ok: true }
    return { ...named, ok: false, reason: 'unreadable-result' }
  }
  const course = parsed.course as { courseId?: unknown } | undefined
  const courseId = typeof course?.courseId === 'string' ? course.courseId : typeof parsed.courseId === 'string' ? parsed.courseId : undefined
  return {
    ...named,
    ok: parsed.ok,
    ...(parsed.ok === false && typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}),
    ...(courseId ? { courseId } : {}),
  }
}

export function createPrepFinalizer(deps: {
  classify(reason: unknown): 'live' | 'cancelled' | 'failed'
  modelErrorOf(reason: unknown): 'quota' | 'credential' | undefined
  uuid?: () => string
}): { finalize(agent: object, end: { reason?: unknown; turn?: unknown }, context?: { runId?: string }): PrepTurnFinal | undefined } {
  const uuid = deps.uuid ?? randomUUID
  /** 每个 agent 上一次定稿的回合结束标识 */
  const lastEnd = new WeakMap<object, string>()
  return {
    finalize(agent, end, context = {}) {
      const ids = studentMessageIds(agent)
      // 网关告诉的 runId（开启本回合的那条消息）优先：长回合中途压缩会把本回合的学生消息压进摘要，日志里就找不到了（2026-10-20 生产）
      const runId = context.runId ?? ids.at(-1)
      if (!runId) return undefined
      const endKey = typeof end.turn === 'number' ? `turn:${end.turn}` : `log:${ids.length}:${runId}`
      if (lastEnd.get(agent) === endKey) return undefined
      lastEnd.set(agent, endKey)
      const kind = deps.classify(end.reason)
      if (kind === 'cancelled') return { runId, cancelled: true }
      const messages = currentTurnMessages(agent)
      const names = toolNamesOf(messages)
      const tools = messages.map((m) => toolOutcomeOf(m, names)).filter((t): t is PrepToolOutcome => t !== undefined)
      if (kind === 'failed') {
        const modelError = deps.modelErrorOf(end.reason)
        return { runId, prep: true, assistantMessageId: uuid(), reply: prepFallbackReply(modelError), outcome: 'failed', tools, ...(modelError ? { modelError } : {}) }
      }
      const reply = stripToolChatter(stripPrepToolBlocks(currentTurnAssistantText(agent)), { emptyIfAll: true }).trim() || '已处理。'
      return { runId, prep: true, assistantMessageId: uuid(), reply, outcome: 'completed', tools }
    },
  }
}
