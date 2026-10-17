// 3d：备课回合 harness SSE 帧 → 浏览器 NDJSON 帧。浏览器只见 ping/queued/delta/tool/done/error 六种；done 的形状是新的（不受 contracts/ 约束）。
// tool 帧取网关转发的 tool/result（data.message.content[].text 是工具结果 JSON，2c identity.test 实测形状），只给 ok、reason、课程 id 与工具名（取得到时）；
// 工具结果里的其他内容（课程正文、诊断原文）不进浏览器帧，面板按 tool 帧去重读课程。
import type { PrepSessionRow, PrepToolOutcome } from '@maolab/domain'
import type { HarnessFrame } from '../harness/client.ts'
import { textDeltaOf } from '../harness/frames.ts'

export interface PrepSessionDto { id: string; title: string; courseId: string | null; createdAt: number; updatedAt: number }
export interface PrepDoneBody {
  runId: string
  session: PrepSessionDto
  message: { id: string; role: 'assistant'; content: string; createdAt: number }
  tools: PrepToolOutcome[]
  outcome: 'completed' | 'failed'
  modelError?: 'quota' | 'credential'
  replayed?: true
}
export type PrepFrame =
  | { type: 'ping' }
  | { type: 'queued'; ahead: number }
  | { type: 'delta'; delta: string }
  | ({ type: 'tool' } & PrepToolOutcome)
  | ({ type: 'done' } & PrepDoneBody)
  | { type: 'error'; error: string; code: string }

export const sessionDto = (row: PrepSessionRow): PrepSessionDto => ({ id: row.id, title: row.title, courseId: row.courseId, createdAt: row.createdAt, updatedAt: row.updatedAt })

const textBlocks = (content: unknown): string =>
  Array.isArray(content) ? content.map((b) => (b && typeof b === 'object' && (b as { type?: unknown }).type === 'text' ? String((b as { text?: unknown }).text ?? '') : '')).join('') : typeof content === 'string' ? content : ''

export function toolOutcomeOfFrame(frame: HarnessFrame): PrepToolOutcome | undefined {
  if (frame.type !== 'tool/result') return undefined
  const data = (frame.data ?? {}) as { message?: { content?: unknown; name?: unknown; toolName?: unknown }; toolName?: unknown; name?: unknown }
  let parsed: Record<string, unknown>
  try { parsed = JSON.parse(textBlocks(data.message?.content)) as Record<string, unknown> } catch { return undefined }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.ok !== 'boolean') return undefined
  const name = [data.message?.name, data.message?.toolName, data.toolName, data.name].find((v): v is string => typeof v === 'string' && v !== '')
  const course = parsed.course as { courseId?: unknown } | undefined
  const courseId = typeof course?.courseId === 'string' ? course.courseId : typeof parsed.courseId === 'string' ? parsed.courseId : undefined
  return { ...(name ? { name } : {}), ok: parsed.ok, ...(parsed.ok === false && typeof parsed.reason === 'string' ? { reason: parsed.reason } : {}), ...(courseId ? { courseId } : {}) }
}

export function mapPrepFrame(frame: HarnessFrame): PrepFrame | undefined {
  if (frame.type === 'agent/assistant-stream') {
    const delta = textDeltaOf(frame.frame)
    return delta ? { type: 'delta', delta } : undefined
  }
  const tool = toolOutcomeOfFrame(frame)
  return tool ? { type: 'tool', ...tool } : undefined
}

/**
 * 一个回合用一个映射器（终审修复，T15 走查第 5 条）：真实 dsh 的 tool/result 不带工具名，只有 message.toolCallId；
 * 工具名在之前的 tool/call 帧（data { callId, name }）上。这里按 callId 记下名字，结果帧没有名字时补上。
 */
export function createPrepFrameMapper(): (frame: HarnessFrame) => PrepFrame | undefined {
  const names = new Map<string, string>()
  return (frame) => {
    if (frame.type === 'tool/call') {
      const data = (frame.data ?? {}) as { callId?: unknown; name?: unknown }
      if (typeof data.callId === 'string' && typeof data.name === 'string' && data.name) names.set(data.callId, data.name)
      return undefined
    }
    const mapped = mapPrepFrame(frame)
    if (mapped?.type !== 'tool' || mapped.name) return mapped
    const callId = ((frame.data ?? {}) as { message?: { toolCallId?: unknown } }).message?.toolCallId
    const name = typeof callId === 'string' ? names.get(callId) : undefined
    return name ? { ...mapped, name } : mapped
  }
}
