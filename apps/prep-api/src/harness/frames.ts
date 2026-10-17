// harness SSE 帧里的文字增量（自 maolab-ai-learning apps/api/src/learning/frames.ts 迁入，只留备课用到的部分）。

/** dsh StreamChunk 的文字增量（实测为准：形状取端到端测试里记录到的真实帧；推理块不算草稿） */
export function textDeltaOf(frame: unknown): string | undefined {
  const f = frame as { type?: unknown; chunk?: Record<string, unknown> } & Record<string, unknown>
  if (!f || f.type !== 'chunk') return undefined
  const c = (f.chunk ?? f) as Record<string, unknown>
  if (typeof c.type === 'string' && !c.type.includes('text')) return undefined
  const text = typeof c.text === 'string' ? c.text : typeof c.delta === 'string' ? c.delta : undefined
  return text || undefined
}
