# Maolab Architecture v2 — World-Class AI Course Generation

> ## 📦 本文是历史留档，**不反映现状**（2026-07-28 核查）
>
> 全文的 ✅ 与 `- [x]` 记录的是 2026-05/06 当时**确实交付过**的东西，
> 不是当前可用的特性。此后主线换成了 mainline（`app/app/lib/mainline/**`
> + `/api/v2/mainline/*`），本文描述的 v2 链路已整体退役：
>
> | 本文写的 | 现状 |
> |---|---|
> | Sprint 0–4、6 的 `/api/v2/analyze`、`/plan`、`/method-plan`、`/rundown`、`/showscript`、`/script-only`、`/atoms-only`、`/course-state`、`/backfill-images`、`/narrate`、`/script`、`/lint`、`/migrate-legacy` | **目录已删**。`app/app/api/v2` 现只剩 `live/`、`mainline/`、`textbook-kps/`、`textbooks/` |
> | Sprint 5 实时课堂（SSE 信道 / 老师控台 / 学生端） | **2026-07-27 整体退役**：7 个路由统一返回 410，页面 307 导向 Mainline |
>
> 当前架构见 [architecture-v3-creation-flow.md](architecture-v3-creation-flow.md)
> 与 [v5-master-plan-2026-07-20.md](v5-master-plan-2026-07-20.md)；索引见 [README.md](README.md)。
>
> 保留原文不改正文,是因为它记录了当时的判断过程(如下方「用 SSE 而非
> WebSocket」的权衡),那部分仍有参考价值。

> 起草日期：2026-05-20
> 目标：把 maolab 重构为世界顶尖 AI 课程生成系统
> 执行模式：长任务自治。每节点完成 → 重读本文 → 执行下一节点 → Sprint 6 完毕为止。

## 北极星原则（决断）

1. **审批节点同步、强阻断** — 3 个 gate（计划 / 方法 / 节目单）必须用户显式通过才推进
2. **教学方法可混合** — 方法挂在节目单的 segment 上，不是课程全局开关
3. **一页一语义 schema 强约束** — Atom 是不可分割的语义原子，多题/多 slide 由生成器自动拆，校验层拒收复合
4. **"上课"双模** — 课程库 + 独自演练（V1）→ 实时课堂（V2）

## 数据模型骨架

```
Course
 └─ TeachingPlan (Sprint 0)
     ├─ knowledgeBoundary, knowledgeContent, knowledgeVision
     ├─ audience, depth, purpose
     └─ learningObjectives[]
 └─ TeachingMethodPlan (Sprint 0)
     └─ segments[]: { order, method, rationale }
 └─ Rundown (Sprint 0)
     └─ segments[]: {
          method, atomType, scaffolding,
          onCorrect, onIncorrect, branches[]
        }
 └─ ScriptDoc[]  (per segment, generated from Rundown)
     └─ lines[]: { text, mediaRef?, interactionRef? }
 └─ SceneAtom[]  (per ScriptLine, generated from script)
     └─ exactly ONE of:
        image-caption | single-question | single-claim
        | single-example | dialogue-turn | derivation-step
        | demonstration | recap-bullet
```

## 教学方法库（Sprint 3 完整目录）

| ID | 名称 | Atom 组合规则 |
|---|---|---|
| lecture | 纯授课 | claim → example → claim（无 interaction） |
| interactive | 可交互 | claim → question → claim (有 retry) |
| socratic | 苏格拉底 | question × N → claim 收束 |
| flipped | 翻转课堂 | example/demonstration → 学生操作 → claim |
| case-study | 案例研讨 | example → question × N → derivation-step → claim |
| quest | 闯关 | question → 通过则解锁下一 question |

---

## Sprint 0 — 数据模型重塑 ✅

- [x] 0.1 写 `packages/shared-types/src/teaching-plan.ts` (TeachingPlanV2)
- [x] 0.2 写 `packages/shared-types/src/teaching-method-plan.ts`
- [x] 0.3 写 `packages/shared-types/src/rundown.ts`
- [x] 0.4 写 `packages/shared-types/src/scene-atom.ts` (8 种 atom 类型 + 校验)
- [x] 0.5 在 `packages/shared-types/src/index.ts` 导出新类型
- [x] 0.6 新增 `CourseV2` 顶层聚合类型 + 状态机转移规则
- [x] 0.7 新增 `coursesV2` 表 + 0004 迁移 SQL + repository
- [x] 0.8 引入 dual-read 开关：`feature-flags.ts` 的 `isV2Enabled()`
- [x] 0.9 typecheck 通过（shared-types + db）

**冲突解决**：v2 类型加 `V2` 后缀（`TeachingPlanV2` / `CourseStatusV2` / `CourseV2`）避免与旧 47 处 `TeachingPlan` 引用冲突

## Sprint 1 — 三关审批管线 ✅

- [x] 1.1 `/api/v2/analyze` 端点 + `analyzeTopic()`（Zod schema 校验，重试 3 次）
- [x] 1.2 `/plan/[courseId]` 审批页 + `PlanApprovalClient` + approve API
- [x] 1.3 `/api/v2/method-plan/[courseId]` 端点 + `generateMethodPlan()`
- [x] 1.4 `/method/[courseId]` 审批页 + `MethodApprovalClient`
- [x] 1.5 `/api/v2/rundown/[courseId]` 端点 + `generateRundown()`
- [x] 1.6 `/rundown/[courseId]` 审批页 + `RundownApprovalClient`（含 segment + 节点 + interaction 展示）
- [x] 1.7 状态机 `transitionCourse()` 走 `canTransition()` 守门
- [x] 1.8 `/create` 统一入口（一句话 + 段落 + 教材文本三合一）

**注**：拖拽编辑器留到 Sprint 6（专门做编辑器层）。当前审批页支持"通过"+"回退"，已足够走通管线。

## Sprint 2 — 讲稿先行 + 一画面一语义 ✅

- [x] 2.1 `script-worker.ts`：Rundown.segment + plan → ScriptDoc (每行 ≤ 180 字)
- [x] 2.2 `atom-worker.ts`：RundownNode + lines → 单个 SceneAtom（8 种类型）
- [x] 2.3 `atom-validator.ts`：检测多题/多论断/超长 → error/warning
- [x] 2.4 `AtomRenderer.tsx`：8 种 atom type 各一个内联组件，统一 Stage 容器（垂直居中+留白）
- [x] 2.5 `ClassroomV2Client.tsx`：按 atoms 数组顺序播放，进度条+前后控制
- [x] 整合：`generate-pipeline.ts` 串起 script + atoms；rundown approve → `/api/v2/generate` → `/v2-preview/[courseId]` → `/v2/[courseId]`

## Sprint 3 — 教学方法库扩展 ✅

- [x] 3.1 `method-registry.ts`：6 种方法的完整 MethodSpecFull（含 UI 元数据）
- [x] 3.2 每种方法的 `composition` 规则（allowedAtomTypes / mustInclude / mustEndWith / forbidden / maxQuestions）+ `rundownPromptHint`
- [x] 3.3 `PATCH /api/v2/rundown/[courseId]/segment-method` — 切换 segment 方法（编辑器 UI 留到 Sprint 6）
- [x] 3.4 `rundown.ts` 增强：把每个 segment 的方法 hint + 约束注入到生成 prompt，让 LLM 按约束输出
- [x] 提供 `checkComposition()` 校验函数（Sprint 6 lint 用）

## Sprint 4 — 首页 IA + 课程库 ✅

- [x] 4.1 首页 `app/page.tsx` 重写：双 hero CTA（创建 / 上课）+ 旧入口降级到 footer
- [x] 4.2 `/courses` 新增 v2 课程库聚合页（按 status 跳转到对应阶段）
- [x] 4.3 课程卡：status 色条 + 方法标签 + 学段/深度/目标数/画面数
- [x] 4.4 保留 `/library` `/history` 作为旧版入口；新流量进 v2 入口

## Sprint 5 — 实时课堂（V2） ~~✅~~ 📦 已退役 2026-07-27

- [x] 5.1 SSE 信道（替代 WebSocket，半双工足够）：`/api/v2/live/[sessionId]/sse`
- [x] 5.2 老师控台 `/live/[courseId]/teach`：开课 + 翻页 + 学生列表 + 提问处理 + 分享链接
- [x] 5.3 学生端 `/live/[sessionId]/join`：名字加入 + 同步当前 atom + 提问输入
- [x] 5.4 提问广播 + "已接住"标记
- [x] 5.5 `endSession()` 持久化录播 timeline 到 `data/live-recordings/`

**注**：用 SSE 而非 WebSocket — Next.js App Router 不支持 ws 升级，SSE 用 Response stream 原生支持；广播场景半双工足够。

## Sprint 6 — 编辑器与守门 ✅

- [x] 6.1 `PATCH /api/v2/rundown/[courseId]/node` — move/delete/update 节点（编辑器后端就绪；前端拖拽 UI 留作迭代）
- [x] 6.2 `GET / PATCH /api/v2/script/[courseId]` — 列出/编辑某 segment 某行讲稿（≤ 180 字守门）
- [x] 6.3 `legacy-splitter.ts` + `POST /api/v2/migrate-legacy` — 拆旧 Stage 成 atoms（quiz→N 题、slide→N 单页、image→1:1），新建 ready 状态 CourseV2
- [x] 6.4 `GET /api/v2/lint/[courseId]` — 同时跑 `validateAtomList`（atom 内部多题/超长）+ `checkComposition`（segment 内 atom 序列符合方法规则）

---

## 自治执行规则

1. 每完成一个 checkbox，回到本文勾选并提交一次 commit
2. 每节点最大重试 3 次；超出则记录 `BLOCKED` 注释并继续下一节点（不阻塞全局）
3. 期间不询问用户。决策权下放给"北极星原则 + 教学方法库目录 + Sprint 描述"三者
4. 全部完成后写 `docs/architecture-v2-COMPLETED.md` 总结
