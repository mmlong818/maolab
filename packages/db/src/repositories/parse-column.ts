/**
 * JSON 列解析的统一入口(2026-07-28,处理 code-review-2026-06-13 H-4)
 *
 * 各 repo 原先直接 `JSON.parse(row.x) as T`。数据损坏时抛出的是
 * `Unexpected token } in JSON at position 417`——**不知道是哪张表、哪一行、哪一列**,
 * 500 之后只能靠人肉翻库找。审查把它评为 HIGH 不是因为容易发生,
 * 是因为一旦发生,排查成本高得离谱。
 *
 * 这里只补上下文,**不改变失败语义**:仍然抛,由调用方决定怎么处理。
 * 静默吞掉会把「数据坏了」变成「数据没了」,那是更糟的方向。
 *
 * 主线路径(`mainline-course` / `season`)不用这个:它们已有 try/catch +
 * envelope 结构守卫,坏行返回 undefined 被上游过滤掉,是更强的处理。
 */
export function parseJsonColumn<T>(
  raw: string,
  ctx: { table: string; id: string; column: string },
): T {
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    throw new Error(
      `[${ctx.table}] 行 ${ctx.id} 的 ${ctx.column} 列不是合法 JSON:${(error as Error).message}`,
      { cause: error },
    )
  }
}
