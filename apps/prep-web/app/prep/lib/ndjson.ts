// 备课对话流（application/x-ndjson）：逐行 JSON，坏行与空行丢弃，最后一段不完整的留到下一块
export function splitNdjson(buffer: string): { lines: unknown[]; rest: string } {
  const parts = buffer.split('\n')
  const rest = parts.pop() ?? ''
  const lines: unknown[] = []
  for (const part of parts) {
    const text = part.trim()
    if (!text) continue
    try { lines.push(JSON.parse(text)) } catch { /* 坏行丢弃 */ }
  }
  return { lines, rest }
}

export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished = false
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) { finished = true; break }
      buffer += decoder.decode(value, { stream: true })
      const { lines, rest } = splitNdjson(buffer)
      buffer = rest
      yield* lines
    }
    const { lines } = splitNdjson(`${buffer}${decoder.decode()}\n`)
    yield* lines
  } finally {
    // 调用方提前退出（break/return）或读取出错：取消流，让底层连接关掉；cancel 自身的错误不再抛
    if (!finished) await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
