// 只认最新一次请求：每次 begin 发一张新票，之前的票全部作废；invalidate 作废所有在途的票（切换会话时用）。
// 对话用它丢掉过期的会话加载与重试结果，避免旧会话的数据盖掉老师当前的选择（Task 12 review I1）。
export interface Ticket { readonly key: string; readonly seq: number }

export function createLatest() {
  let seq = 0
  return {
    begin(key: string): Ticket { seq += 1; return { key, seq } },
    isCurrent(ticket: Ticket): boolean { return ticket.seq === seq },
    invalidate(): void { seq += 1 },
  }
}
