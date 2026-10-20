// 本轮图示规划：pre-step 写入，render_visual 读取。按 agent 对象存（WeakMap），agent 释放后自动回收。
// 规划只属于产生它的回合：新回合开始时先清空，回合内没算出规划就是"无规划"，render_visual 据此拒绝。
// 图示校验的来源文本不在这里存，而是每次从会话日志（agent.session.deriveMessages()）现取。
import { stripToolChatter } from './chatter.ts'

/** 与自习室内核 visual-planner 的 VisualPlanDecision 同形（迁入时保留，备课不用图示规划） */
export interface VisualPlanDecision {
  need: 'required' | 'helpful' | 'none'
  candidates: string[]
  reason: string
  fallback: 'text-only' | 'fixed-resource' | 'deterministic'
  subject?: string
}

interface AgentPlanState { turn: number; plan?: VisualPlanDecision }
const states = new WeakMap<object, AgentPlanState>()

/** 回合入口调用：回合号变了就清掉上一回合的规划 */
export function enterTurn(agent: object, turn: number): void {
  if (states.get(agent)?.turn !== turn) states.set(agent, { turn })
}

export function getPlan(agent: object): VisualPlanDecision | undefined {
  return states.get(agent)?.plan
}

export function setPlan(agent: object, turn: number, plan: VisualPlanDecision): void {
  states.set(agent, { turn, plan })
}

// ---- 会话来源（从 dsh 会话日志派生） ----

interface LogBlock { type?: string; text?: string }
interface LogMessage { id?: unknown; role?: string; content?: LogBlock[] | string; source?: { kind?: string } }
interface AgentWithSession { session?: { deriveMessages?(): LogMessage[] } }

const textOfMessage = (m: LogMessage): string =>
  typeof m.content === 'string' ? m.content : (m.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
const isStudent = (m: LogMessage): boolean => m.role === 'user' && m.source?.kind === 'user'

function logOf(agent: object): LogMessage[] {
  try {
    return (agent as AgentWithSession).session?.deriveMessages?.() ?? []
  } catch {
    return []
  }
}

/**
 * 图示校验的来源文本：会话里学生发言与导师回复按时间顺序排列，截止到最新一条学生发言（含），
 * 因此最新学生发言总在最后（内核按 sourceTexts.at(-1) 读"学生最新要求"）。
 * 与旧 backend conversation.py 的 source_texts 一致：那里取的是已存的全部消息，新学生消息在末尾、本轮回复尚未入库。
 * 系统注入的说明、工具结果、模型参数都不算来源。
 */
export function conversationSources(agent: object): string[] {
  const log = logOf(agent)
  let last = -1
  for (let i = log.length - 1; i >= 0; i--) if (isStudent(log[i]!)) { last = i; break }
  return log
    .slice(0, last + 1)
    .filter((m) => isStudent(m) || m.role === 'assistant')
    .map(textOfMessage)
    .filter((t) => t.trim() !== '')
}

/** 本回合到目前为止导师已说出的文字：会话日志里最后一条学生发言之后的 assistant 文本（工具调用所在消息的前置文字也在其中） */
export function currentTurnAssistantText(agent: object): string {
  const log = logOf(agent)
  let last = -1
  for (let i = log.length - 1; i >= 0; i--) if (isStudent(log[i]!)) { last = i; break }
  // 真实模型（GLM）在"文字 + 工具调用"之后的下一步常把同一段文字再说一遍：按空白归一后与前面某段相同的丢掉，否则定稿会重复两遍。
  // 终审 M-1：比较的是剥离旁白与伪调用之后的文字（"X + <render_visual>…" 之后再说 "X" 也算重复）；剥离后什么都不剩的一步不算文字
  const seen = new Set<string>()
  return log.slice(last + 1).filter((m) => m.role === 'assistant').map(textOfMessage).filter((t) => {
    const key = stripToolChatter(t, { emptyIfAll: true }).replace(/\s+/g, ' ').trim()
    if (!key || seen.has(key)) return false
    seen.add(key)
    return true
  }).join('\n')
}

/** 本回合的全部日志消息（最后一条学生发言之后，不含它）；prep 定稿据此取工具结果（3d） */
export function currentTurnMessages(agent: object): Array<Record<string, unknown>> {
  const log = logOf(agent)
  let last = -1
  for (let i = log.length - 1; i >= 0; i--) if (isStudent(log[i]!)) { last = i; break }
  // 没有学生消息 = 本回合的学生消息已被压缩进摘要：剩下的日志都属于本回合（与 currentTurnAssistantText 同一取法）
  return log.slice(last + 1) as unknown as Array<Record<string, unknown>>
}

/** 会话日志里每条学生发言的消息 id（按时间顺序，位置与发言一一对应；没有 id 的为 undefined）。消息 id 即该回合的 runId
 *  （pre-step setRunId），定稿据此判断待评检查题是不是上一回合登记的（终审裁决） */
export function studentMessageIds(agent: object): Array<string | undefined> {
  return logOf(agent).filter(isStudent).map((m) => (typeof m.id === 'string' && m.id !== '' ? m.id : undefined))
}

/** 会话日志里的第一条学生发言（会话标题的默认来源；续会话后仍可从日志取到） */
export function firstStudentText(agent: object): string | undefined {
  const first = logOf(agent).find(isStudent)
  return first ? textOfMessage(first) : undefined
}

/** 消息里出现的全部字符串（递归；工具结果的结构因 dsh 版本而异，不依赖具体形状） */
function stringsOf(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value)
  else if (Array.isArray(value)) for (const v of value) stringsOf(v, out)
  else if (value && typeof value === 'object') for (const v of Object.values(value)) stringsOf(v, out)
  return out
}

/**
 * 本会话（当前派生日志，压缩后以压缩结果为准）是否已经载入过某个 skill：
 * dsh-tool-skill 的 skill 工具结果渲染为 <skill_content name="…">，用户直接调用时注入 source.kind = skill-invocation 的消息。
 */
export function skillLoaded(agent: object, skillName: string): boolean {
  const marker = `<skill_content name="${skillName}"`
  return logOf(agent).some((m) => {
    const source = m.source as { kind?: string; name?: string } | undefined
    if (source?.kind === 'skill-invocation' && source.name === skillName) return true
    return stringsOf(m.content).some((t) => t.includes(marker))
  })
}

/** 规划说明的 source.kind（pre-step 写入） */
export const VISUAL_NOTE_KIND = 'yunyi-visual-note'

/**
 * 本会话（当前派生日志）已注入过的图示指引分段 key：读规划说明的 source.guideSections。
 * 压缩把旧说明移出派生日志后读不到，下一次需要时会重新注入。
 */
export function injectedGuideSections(agent: object): Set<string> {
  const keys = new Set<string>()
  for (const m of logOf(agent)) {
    const source = m.source as { kind?: string; guideSections?: unknown } | undefined
    if (source?.kind !== VISUAL_NOTE_KIND || !Array.isArray(source.guideSections)) continue
    for (const k of source.guideSections) if (typeof k === 'string') keys.add(k)
  }
  return keys
}

// ---- 会话上下文 → visual-planner 的 SessionContext ----

/** 网关登记的会话上下文（apps/harness/src/types.ts 的 SessionContextInput，只取用到的字段） */
export interface SessionContextLike {
  mode: 'question' | 'preview' | 'self-study'
  subject?: string
  knowledgePoint?: { id: string; name: string } | null
  grade?: string; topic?: string; teacherId?: string; learner?: { gender?: string }
  privateHistory?: ReadonlyArray<{ role: string; content: string }>
  /** 4b：上课会话钉住的发布件版本与课程大纲（api 从快照生成，≤ 4000 字；简报中和后放进 <lesson_outline>） */
  lesson?: { publicationId: string; version: number; title: string; outline: string }
}
/** visual-planner 的 SessionContext */
export interface PlanningSession {
  mode: 'question' | 'preview' | 'self-study'
  subject: string | null
  title: string
  knowledgePointName?: string
}

const MODE_TITLES = { question: '新问题', preview: '新的预习', 'self-study': '新的自学' } as const

/**
 * 网关上下文 → visual-planner 的 SessionContext。与 backend 建会话的默认值一致：
 * 标题 = 知识点名，否则首条学生原话（空白折叠、截 32 字），否则按模式的默认标题；topic 不在上下文里，省略。
 * 没有登记上下文时按提问模式、学科未知处理（学科由原话推断）。
 */
export function planningSessionFor(context: SessionContextLike | undefined, firstStudentText: string | undefined): PlanningSession {
  const mode = context?.mode ?? 'question'
  const kpName = context?.knowledgePoint?.name
  const first = firstStudentText?.replace(/\s+/g, ' ').trim().slice(0, 32)
  return {
    mode,
    subject: context?.subject ?? null,
    title: kpName || first || MODE_TITLES[mode],
    ...(kpName ? { knowledgePointName: kpName } : {}),
  }
}
