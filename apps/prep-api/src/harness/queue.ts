import { createHash } from 'node:crypto'

/** 回合的帧队列：编排往里推，响应流从里读；end 之后的推送丢弃 */
export class FrameQueue<T> implements AsyncIterable<T> {
  private items: T[] = []
  private waiters: Array<(r: IteratorResult<T>) => void> = []
  private ended = false
  push(item: T): void {
    if (this.ended) return
    const w = this.waiters.shift()
    if (w) w({ value: item, done: false })
    else this.items.push(item)
  }
  end(): void {
    this.ended = true
    for (const w of this.waiters.splice(0)) w({ value: undefined as never, done: true })
  }
  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => this.items.length > 0 ? Promise.resolve({ value: this.items.shift()!, done: false })
        : this.ended ? Promise.resolve({ value: undefined as never, done: true })
          : new Promise((r) => this.waiters.push(r)),
    }
  }
}

/** 同 requestId 的重发按内容判定是否同一请求：哈希去首尾空白后的原话 */
export const inputHash = (content: string): string => createHash('sha256').update(content, 'utf8').digest('hex')
