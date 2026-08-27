# Architecture v2 — 长任务完成总结

> ## 📦 历史留档，**不反映现状**（2026-07-28 核查）
>
> 「已交付的能力」是 2026-05-20 当时的事实。此后主线换成 mainline，
> 本文列出的 `/create`→`/plan`→`/method`→`/rundown` 三关管线与实时课堂
> **端点目录均已删除或退役**。逐条对照见 [architecture-v2.md](architecture-v2.md) 顶部横幅。

> 完成日期：2026-05-20
> 6 个 Sprint 全部执行完毕。所有改动 typecheck 通过并已 commit。

## 已交付的能力

### 1. 三关审批管线（Sprint 1）

`/create` → 输入主题/教材 →
- **Gate 1** `/plan/[id]`  审 TeachingPlan（受众 / 知识边界 / 学习目标）→
- **Gate 2** `/method/[id]` 审 TeachingMethodPlan（分段 + 方法分配）→
- **Gate 3** `/rundown/[id]` 审 Rundown（节点级细化大纲）→
- `/v2-preview/[id]` 生成进度 → `/v2/[id]` 上课

### 2. 数据模型（Sprint 0）

```
CourseV2 (status machine)
 ├── TeachingPlanV2          知识边界 + 受众 + 目标
 ├── TeachingMethodPlan       segments[].method
 ├── Rundown                 segments[].nodes[]: { role, atomType, scaffolding, interaction }
 ├── scriptDocs: Record<segId, ScriptDoc>
 └── atoms: SceneAtom[]      8 种 atom 类型，强约束一页一语义
```

存储：`courses_v2` JSON blob 表（schema 0004）；`isV2Enabled()` 切换。

### 3. 8 种 SceneAtom（Sprint 0/2）

`image-caption · single-claim · single-question · single-example · dialogue-turn · derivation-step · demonstration · recap-bullet`

每种 atom 有 Zod payload + 渲染器组件（`AtomRenderer.tsx`）。

### 4. 6 种教学方法（Sprint 3）

| ID | 名称 | 特征 |
|---|---|---|
| lecture | 纯授课 | 无 interaction，必须 claim 收尾 |
| interactive | 可交互 | 讲两步插一题 |
| socratic | 苏格拉底 | 连续 question + dialogue |
| flipped | 翻转课堂 | 先 demonstration 再讲解 |
| case-study | 案例研讨 | example + 多 question 拆解 |
| quest | 闯关 | 必须做对解锁 |

每种含 `composition` 规则（allowed/mustEndWith/forbidden/maxQuestions），由 `checkComposition()` 校验。

### 5. 生成管线（Sprint 2）

rundown approve → `runGenerationPipeline()`：
- 每个 segment → `generateScriptDocV2()` → ScriptDoc（每行 ≤ 180 字，关联 nodeId）
- 每个 node → `generateAtomFromNode()` → 单个 atom（Zod 校验 + `validateAtom()` 守门，2 次重试）

### 6. 首页 + 课程库（Sprint 4）

- `/` 双 CTA：创建课程 / 上课
- `/courses` 课程库（按 status 跳转到对应阶段）
- 旧 `/library` `/history` `/setup/quick` 保留但降级

### 7. 实时课堂（Sprint 5）

- SSE 信道（替代 WebSocket，Next.js App Router 原生支持）
- `/live/[courseId]/teach` 老师控台：开课 + 翻页 + 学生在线 + 提问处理
- `/live/[sessionId]/join` 学生端：扫码加入 + 同步当前 atom + 提问按钮
- 课堂结束自动归档到 `data/live-recordings/{courseId}-{sessionId}.json`

### 8. 编辑器与守门（Sprint 6）

- 节目单节点编辑：`PATCH /api/v2/rundown/[courseId]/node`（move/delete/update）
- 讲稿行编辑：`PATCH /api/v2/script/[courseId]`（≤ 180 字守门）
- 旧课件批量迁移：`POST /api/v2/migrate-legacy`（quiz→N题、slide→N单页）
- 运行时 lint：`GET /api/v2/lint/[courseId]`（atom + composition 双层校验）

## 关键设计决策

1. **审批同步阻断** — 用户必须点"通过"才进下一阶段。AI 永远不在错误前提下浪费成本。
2. **方法可混合** — 挂在 segment 级别，不是全局开关。AI 自动分配混合方法。
3. **一页一语义 schema 强约束** — Atom 是不可分割原子。多题/多论断由生成器拆，校验层拒收复合。
4. **SSE > WebSocket** — Next.js App Router 不支持 ws upgrade；广播场景半双工足够。
5. **v2 dual-write** — 新流量写 `courses_v2`，旧课件继续读旧表。`isV2Enabled()` 切换。

## 提交历史

```
Sprint 0  feat(v2): Sprint 0 - data model foundation
Sprint 1  feat(v2): Sprint 1 - three-gate approval pipeline
Sprint 2  feat(v2): Sprint 2 - script-first + one-page-one-meaning
Sprint 3  feat(v2): Sprint 3 - method library expansion
Sprint 4  feat(v2): Sprint 4 - home IA + course library
Sprint 5  feat(v2): Sprint 5 - live classroom (SSE + recording)
Sprint 6  feat(v2): Sprint 6 - editors + lint + legacy migration
```

## 验证步骤（手动验收）

1. `pnpm typecheck` 全包通过
2. 启用 `MAOLAB_V2=1` 启动 dev server
3. 访问 `/` → 点"创建课程" → 走完 3 关 → 进入 `/v2/[id]` 上课
4. 验证 `/courses` 显示课程
5. 验证 `/live/[courseId]/teach` 开课 + 在另一窗口 `/live/[sessionId]/join` 学生加入

## 后续可迭代项（不在 6 个 Sprint 范围内）

- 节目单拖拽前端 UI（后端 API 已就绪）
- TTS / 图像生成对接到 v2 atom（image-caption.imageUrl 当前由生成器留白）
- 课件 PPTX 导出（v1 已有，需对齐 atom）
- 个人学习数据画像（旧 conceptMastery 表迁移）
