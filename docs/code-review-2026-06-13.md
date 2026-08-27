# 代码质量审查留档 · 2026-06-13

范围：`app/lib/v2`、`app/api/v2`、`packages/{generator,classroom,db}`。结论：核心逻辑结构健康（Zod 校验层、retry 包装、delivery-adapter 纯函数设计都是好选择），无 CRITICAL 问题。以下为分级清单与处理状态。

## 已修复（本次）

- ✅ **H-1** `generate-pipeline.ts:174` — `undefined as unknown as string` 双重 cast 规避类型检查。`failureReason` 本就是可选字段，已改为条件赋值 + delete，移除 cast。
- ✅ **H-5** `student-response-store.ts:169` — `Date.now()+6位随机` 生成 id 在同毫秒并发下有碰撞风险，已改为 `crypto.randomUUID()`。

## HIGH（2026-07-28 全部结清 — 逐条核实，非批量勾选）

- ✅ **H-4 已修（唯一还活着的一条）** `packages/db/src/repositories/*.sqlite.ts` —
  新增 `parse-column.ts` 的 `parseJsonColumn(raw, {table, id, column})`，铺到
  content-unit / courses-v2 / program / stage / teaching-plan / user-profile 共 14 处。
  **只补上下文，不改失败语义**——仍然抛：静默吞掉会把「数据坏了」变成「数据没了」。
  5 条回归；变异验证退回裸 `JSON.parse` → 3 条失败。
  - 三处 `JSON.parse` **有意保留**：`content-unit:178` 是全表计数扫描，坏行跳过即可；
    `mainline-course:82` / `season:77` 已有 try/catch + envelope 结构守卫，比本助手更强。
  - 「关键 repo 过 Zod」**未做**：主线路径（mainline-course / season）已有结构守卫，
    其余是下方 H-2 说的退役线，给它们加 Zod 是往冷代码里投资。
- 📦 **H-2 前提已变**：`student-response-store.ts` / `kp-cluster-mapper.ts` 仍在，
  但**生产代码零引用**，只剩 `packages/db` 的两个测试导入它们。主线的学情写入
  走 `app/app/api/v2/mainline/response/route.ts` → `concept_mastery`。
  给孤儿文件补类型是无效功。**按 CLAUDE.md「预先存在的死代码，提及但不删除」，
  只报不删**——是否清理请用户定。
- 📦 **H-3 文件已删**：`packages/generator/src/pipeline/show-planner.ts` 随旧 v2 线移除。
- 📦 **H-6 文件已删**：`app/app/lib/v2/live-store.ts` 于 2026-07-27 旧 live 退役时移除。

## MEDIUM（择机处理）

- **M-1** 全域 ~30+ 处 `console.log/warn/error`，上生产前换结构化 logger。
- **M-2** `generate-pipeline.ts:162` — intro「今日目标」atom 在 `generateBeatsForAtoms` 之后才 unshift，永远没有 beats，课堂渲染会是裸状态。需确认是否有意（加注释）或补 beats。
- **M-3** 同处 — intro atom 用 `single-example` 类型但 payload 缺必填的 `studentVisible`，过 `validateAtom` 会失败。
- **M-4** `beats-worker.ts:53` — BeatSchema `as unknown as z.ZodType<Beat>`，两类型分叉时 TS 不会报警。建议以 `z.infer` 为权威类型。
- **M-5** `packages/generator/src/llm/openai-image.ts:26,66` — http/https RequestOptions cast，低风险。
- **M-6** `student-response-store.ts:211+` — `listCourseResponses` 每次读都可能触发 setImmediate 懒回填写，无去重/防抖，insights 高频调用时后台写放大。
- **M-7** `classroom/adaptive/controller.ts:5` 与 `delivery/delivery-adapter.ts:39` — MASTERY_THRESHOLD 与 SKIP_THRESHOLD 同为 0.85、语义相同但分居两文件，调参会漏改。应共享常量。
- **M-8** `generate-pipeline.ts:124` — segment 级 script 生成失败时整段 node 静默丢 atom，只留一条 segment 警告，无 per-node 追溯。

## LOW

- **L-1** `evaluate-answer/route.ts:88` — `describeAtomBrief` switch 无 `assertNever` 兜底，新增 atom 类型不会被 TS 提醒。
- **L-2** `live-store.ts:59` — session 复用时忽略新的 `totalAtoms`，重新生成课程后旧 session 计数过期。
- **L-3** `script-only` / `material-audit` / `atoms-only` 路由 — fire-and-forget 仅 console.error，失败不落 course 记录，与 `runGenerationPipeline` 的 failed 状态持久化不一致。
- **L-4** `deskmate-react/route.ts:39` — `getStudentsForStage(stage)[3]!` 硬编码索引假设恰好 4 名学生。
- **L-5** courses-v2 repo 的 `deserialize` 命名未体现会抛异常（与 H-4 同源）。

## 另：运维建议（不在代码内）

- `data/` 下有 6 个数据库备份（`maolab.db.bak-*` / `.backup-*`，合计约 115MB，最旧 2026-05-24）。属不可恢复删除，未动。建议人工确认后只留最近一份。
- `packages/presgen` 约 1051 个预存 typecheck 错误为已知遗留，建议 v1.2 重构 PPT 时一并处理（见 memory 档）。
