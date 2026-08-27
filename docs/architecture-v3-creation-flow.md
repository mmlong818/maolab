# Architecture v3 — 创作流程 + 演讲态 + presgen 合并

> 本文记录在 v2 基础上的重大架构演进。覆盖 2026-05 一轮 session 的全部改动。
> 配套 commit: `f211c4e` → `ceda518` → 后续节目单编辑/讲稿编辑/主题切换/atom 编辑

## 一、7 步创作流程显式化

原来的黑盒：`/create` → `/plan` → `/method` → `/rundown` → 一次性生成 → `/v2-preview`

现在每一步用户都可见、可参与、可回看：

```
1. 内容    /create           输入主题+教材
2. 完整度  /audit/[id]       AI 审计内容,标出 covered/gaps/boundaries,提议目标(B2)
3. 目标    /plan/[id]        TeachingPlan 草稿审批
4. 教法    /method/[id]      5 段教法分配审批
5. 提纲    /rundown/[id]     节目单 nodes,可拖动/跨段/插入/删除
6. 讲稿    /script/[id]      ScriptDocs 分段审阅,可单段重写,可行内编辑(B1+inline)
7. 内容页  /atoms/[id]       atom 清单,可单个重写,可编辑文本字段
   ↓
   /v2-preview/[id]    选老师上课/演讲/导出 PPTX
```

### Status 状态机扩展

```
analyzing → auditing → audited → plan-draft → plan-approved
  → method-drafting → method-draft → method-approved
  → rundown-drafting → rundown-draft → rundown-approved
  → scripting → scripted              ← 新增(B1)
  → atom-generating → ready           ← 新增(B1)
```

### 顶部统一 Stepper(B3)

`app/components/SetupStepper.tsx` 在 setup layout 顶部 sticky 显示 7 步:
- 当前步蓝色高亮
- 已完成步骤绿色 ✓ 可点击回看
- 自动从 `usePathname()` 推断当前步

## 二、节目单播放器(替代单调 PPT 演讲态)

`/v2/[id]/present` 不再把所有 atom 强行转 slide。按 atom.type 分发到不同 Stage:

| Atom type           | Stage                | 视觉特征 |
| ------------------- | -------------------- | ------- |
| `single-example` (intro) | IntroStage      | 大标题 + 编号列表 |
| `single-example` (case)  | ExampleStage    | 案例 eyebrow + 大标题 + 正文 |
| `single-claim`           | ClaimStage      | 84px 居中宣言 |
| `recap-bullet`           | RecapStage      | 64px 大字回顾 |
| `image-caption`          | ImageCaptionStage | 大图 + 居中字幕 |
| `single-question`        | QuestionStage   | 橙色"老师在问" + ABCD 选项 |
| `demonstration`          | DemoStage       | 左 3/2 图右 2/3 旁白 |
| `dialogue-turn`          | DialogueStage   | 头像 + 气泡(老师/学生/旁白) |
| `derivation-step`        | DerivationStage | monospace 公式框 + 依据 |

### 顶部彩色节目单缩略

每个 atom 一颗按类型染色的圆点;点击跳转;P 键弹出网格总览。

### 主题切换(presgen 集成)

`app/components/PresentMode.tsx` 接入 `@maolab/presgen` 的 26 个主题:
- 默认 `modern-minimal`
- Picker 给 6 个主流: 现代极简/杂志衬线/工程暗色/午夜豪华/巴洛克粉彩/瑞士网格
- 每个 Stage 用 `theme.text` / `theme.muted` / `theme.accent` / `theme.paper` / `theme.bg` / `theme.fontBody`
- 右上角下拉实时换肤

## 三、presentation-generator 合并

`packages/presgen/` workspace 子包:

```
packages/presgen/
├── lib/
│   ├── types.ts             # ThemeId / LayoutType / Slide 等
│   ├── themes.ts            # 26 个 ThemeTokens
│   ├── layouts/registry.ts  # 25 种 layout 元数据
│   ├── adapt-from-maolab.ts # atomsToSlides(course): Slide[]
│   ├── prompts.ts brandkit.ts editor/ ...
│   └── index.ts
├── components/editor/       # tiptap/konva slide canvas(暂未接入 UI)
├── package.json             # workspace package, deps: pptxgenjs/jspdf/zod
└── tsconfig.json
```

### PPTX 导出

`POST /api/v2/export-pptx/[courseId]` 流程:
1. `findCourse` → 拉取 25 atoms + plan
2. `atomsToSlides(course)` → 适配为 26 张 presgen Slide
3. `pptxgenjs` 服务端渲染,目前覆盖 6 种 layout (cover/statement/checklist/quote/argument/process),其他 fallback 为 JSON dump
4. 返回 `.pptx` 二进制下载

入口在 v2-preview "导出 PPTX" 按钮。

### 后续待办

- 接 `presentation-generator/pptx-service` (Python) 做完整 25 layout 高保真导出
- 接入 `components/editor/SlideCanvas` (konva + tiptap) WYSIWYG 编辑

## 四、Beat 演出层(image-caption)

`packages/shared-types/src/beat.ts` 定义 5 种 beat:

```ts
type BeatKind = 'reveal' | 'narrate' | 'ask' | 'await' | 'react'
```

`app/lib/v2/beats-worker.ts` 为 image-caption atom 生成 beats 序列 (LLM 3-5 拍):
- `tell-then-show`: narrate → reveal image → narrate → reveal caption → ...
- `show-then-tell`: reveal image → narrate "你看这张..." → ...
- `show + 反问`: reveal → ask → react

`BeatStage.tsx` 状态机渲染:
- 状态: `idle | narrating | awaiting | reacting | paused`
- 学生答题后调 `/api/v2/evaluate-answer` 由 LLM 评估,react beat 用老师人设反馈
- H 键举手提问浮窗,Esc 收起

## 五、生成 pipeline 拆分

原 `runGenerationPipeline` (一次性 script+atoms) 已拆为两个独立函数:

```
runScriptOnlyGeneration  → status: scripting → scripted
   ├ POST /api/v2/script-only/[id]              触发
   ├ PUT /api/v2/script-only/[id]/[segId]      单段重写
   └ PUT /api/v2/script-only/[id]/[segId]/edit 用户编辑保存

runAtomsOnlyGeneration   → status: atom-generating → ready
   ├ POST /api/v2/atoms-only/[id]                触发
   ├ PUT /api/v2/atoms-only/[id]/[atomId]       单 atom 重写
   └ PATCH /api/v2/atoms-only/[id]/[atomId]/payload  字段级编辑
```

每段/每 atom 完成时增量 save → 中断后 UI 检测 (status=ing + updatedAt>30s) 自动重触发 POST → server 跳过已存在的 segment/node 续传。

## 六、节目单可编辑

`PUT /api/v2/rundown/[id]/edit` 替换整个 rundown,自动重算 order。

UI 操作 (rundown 页):
- ↑↓ 段内移动
- 下拉 "→ 段" 跨段移动
- ✕ 删除
- "+ 在这段末尾加一张空白" 插入默认空白 node

## 七、布局/视觉规则

- ScaleStage 仅用于演讲态 (`/v2/[id]/present`),固定 1920×1080 设计画布等比 fit viewport
- setup 页面用普通 responsive (max-width 1080 居中),配合 `box-sizing: border-box` 修复 `minHeight 100vh + padding` 的滚动条溢出问题
- BeatStage 浮窗(narration/ask/raise-hand)用 grid-rows 参与正常布局流,避免 fixed 在小视口被裁

## 八、本地图片缓存

`app/lib/v2/image-cache.ts`:
- 拉外链图 → SHA1 命名 → 写入 `public/generated-images/`
- 课程内引用统一改为 `/generated-images/{hash}.{ext}`
- 课堂期间不依赖外站,避免 Pollinations 等图床抖动

## 九、API 同步/异步语义（重要 · 易踩坑）

**踩坑背景**：v1.1 cluster 真检发现 method-plan / rundown 在 UI 写得像异步（spinner + polling），但 API 实际是同步阻塞——POST 等到内部 LLM 调用全跑完才返回。结果是 UI 可能：
- 请求 timeout 显示"失败"但实际服务端已成功
- 多次重复触发同步 POST 造成幂等性问题
- spinner 时间长得不合理（30s+ 等同步而非真后台轮询）

下面表是创作流程 7 步 + 演讲态的真实同步性，写前端时按这个走。

### 同步阻塞型（POST 返回时已完成，无需 polling）

| Step | 端点 | 时长量级 | UI 模式 |
|------|------|---------|--------|
| Plan | `POST /api/v2/method-plan/[id]` | 5-30s LLM | **请求中态**（按钮 disabled + spinner），返回后直接跳下一步。**不要 setInterval polling**。允许 60s timeout |
| Method approve→Rundown | `POST /api/v2/rundown/[id]` | 5-20s LLM | 同上。一次 await 拿到 rundown，无中间状态 |
| 节目单编辑 | `PUT /api/v2/rundown/[id]/edit` | <1s | 乐观更新 |
| 单段讲稿重写 | `PUT /api/v2/script-only/[id]/[segId]` | 5-15s LLM | 请求中态，返回即可见 |
| 单 atom 重写 | `PUT /api/v2/atoms-only/[id]/[atomId]` | 5-15s LLM | 同上 |

### 异步火去型（POST 立即返回 status=ing，后台跑，UI polling）

| Step | 端点 | 时长量级 | UI 模式 |
|------|------|---------|--------|
| Audit | `POST /api/v2/material-audit/[id]` | 30-120s | 立即返回 `status: auditing`。UI 用 `GET /api/v2/course-state/[id]` 轮询，看 status 变成 `audited` |
| Script-only 全量 | `POST /api/v2/script-only/[id]` | 1-5 min | 立即返回 `status: scripting`。UI 轮询直到 `scripted`。**续传机制**：每段完成增量 save，中断后重新 POST 会跳过已存在的 segment |
| Atoms-only 全量 | `POST /api/v2/atoms-only/[id]` | 2-10 min | 立即返回 `status: atom-generating`。UI 轮询直到 `ready`。同样有 node 级续传 |

### 续传 / 中断恢复机制

异步火去型的两个 POST（script-only / atoms-only）都支持**中断重试**：
- 每完成一个 segment / atom 立即 `saveCourse`，状态留在 DB
- UI 检测 `status === '*-ing' && updatedAt > 30s ago` 自动重触发 POST
- Server 端检查 `existingAtomNodeIds` 集合，跳过已生成的 node，只补差量
- 详见 `app/app/lib/v2/generate-atoms-only.ts` 与 `generate-pipeline.ts`

### UI 轮询模板

异步型用 `setInterval(reload, 4000)` 是当前实现：
- 见 `/method`, `/script`, `/atoms` 等等待页
- **不要**对同步型 step 用这个模板——会导致按钮可重复点 / spinner 死循环

### 状态机参考

```
analyzing → auditing → audited                    ← 异步
  → plan-draft (审批后)
  → method-draft → method-approved                ← 同步 POST
  → rundown-draft → rundown-approved              ← 同步 POST
  → scripting → scripted                          ← 异步
  → atom-generating → ready                       ← 异步
  → failed (任一步出错)
```

同步步骤没有独立的 `-ing` 中间态（POST 内部完成所有事），异步步骤都有显式 `-ing` 状态供 UI 轮询。

### 已知历史踩坑

- `material-audit PATCH` 在 audited 状态下需要主动推进 plan-draft（见 commit `24c5ad1`），早期写法靠 PATCH 自动推进，导致 /plan 页 approve 失败
- script-only 续传依赖 `(course.atoms ?? []).flatMap(a => [a.id, a.rundownSegmentId ?? ''])` 的存在性判断，注意不要清空 atoms 数组当作"重新生成"

