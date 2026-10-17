import type { ServerResponse } from 'node:http'
/** 逐行写出；空闲超过 heartbeatMs 补一行 ping（前端 45 秒无数据判挂住）。浏览器断开后不再写，但继续消费（编排照常完成） */
export async function pipeNdjson<F extends { type: string }>(raw: ServerResponse, frames: AsyncIterable<F>, heartbeatMs: number): Promise<void> {
  raw.writeHead(200, { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-cache, no-transform', 'x-accel-buffering': 'no', 'x-served-by': 'api' })
  let closed = false
  let last = Date.now()
  raw.on('close', () => { closed = true })
  // 断开瞬间的写入错误不能变成未处理的 'error'（进程崩溃）：只停止写
  raw.on('error', () => { closed = true })
  const write = (f: F | { type: 'ping' }): void => {
    if (closed || raw.destroyed || raw.writableEnded) return
    raw.write(`${JSON.stringify(f)}\n`)
    last = Date.now()
  }
  const timer = setInterval(() => { if (Date.now() - last >= heartbeatMs) write({ type: 'ping' }) }, Math.max(50, Math.floor(heartbeatMs / 3)))
  try {
    for await (const f of frames) write(f)
  } finally {
    clearInterval(timer)
    if (!closed && !raw.writableEnded) raw.end()
  }
}
