---
摘要: 从旧 v2 生产线（7 步创作流 + SceneAtom + courses_v2 JSON blob）迁移到 mainline 主线（Course→TeachingSkeleton→LearningFragment→Scene→Beat）的可执行分阶段计划。采用「壳内重启 + adapter 桥接 + 绞杀者并行」策略：旧线只读冻结、新线通过 adapter 从旧数据长出，先打通一条真实课程的端到端垂直切片再逐阶段替换生成/渲染/落库。核心结论：mainline 原型的类型/闸门/技术库/舞台已建齐，缺的是「落库 + 真实生成器 + 上课入口」三处接线；旧线已有被忽视的「硬骨架填槽」路径（rundown.ts buildHardSkeletonRundown），Phase 2 是形态转换而非从零造轮子。第一切片建议用 samples.ts 已有黄金课直接落库 + 复用 StageCanvas 上课，绕开生成器，先验证「Course→Stage→QualityGate」链路。
来源: chat
日期: 2026-07-08
关联: project-redesign-2026-06-30.md, CORE_VS_EXPERIMENTAL.md, real-check/2026-07-07-round05/FINAL-REPORT.md
---

# maolab 旧 v2 生产线 → mainline 主线 迁移计划

- 日期：2026-07-08
- 依据：`docs/project-redesign-2026-06-30.md`（重启设计，尤其第 6/7/10/12/18 节）+ `docs/CORE_VS_EXPERIMENTAL.md`（执行边界）
- 事实基线：本计划所有文件级动作均已对照当前代码核实，核实结论见「附录 A：现状核实与对简报的修正」。

---

## 0. 一页纸摘要（给决策者）

**现状一句话**：mainline 是一座「陈列室」——类型、六类质量闸门（`quality-gates.ts` 334 行，真能跑）、10 条展示技术库、1920×1080 舞台（StageCanvas + DialogueLayer + SceneTechniqueView）、3 门硬编码黄金样板课都建齐了，但**它不落库、无 adapter、无真实生成器、只有一个 demo 页面挂着**（`/mainline/sample`）。旧 v2 线才是活的：真检 round04/round05 一直在它上面跑到 ready、修 bug、出全真图。

**迁移不是重写，是接线**。按「壳内重启」（设计 18 节）：旧线原地冻结成只读资产，mainline 通过 adapter 从旧数据/样板课长出，用绞杀者（strangler）模式逐段把生产流量从旧线切到新线。

**三个关键接线缺口**（解锁一切的关键路径）：
1. **落库**：mainline 无持久化。决策点——加真实表 vs 复用 `courses_v2.data` JSON 列（本计划建议：**先复用 JSON 列**，零迁移风险）。
2. **adapter 层**：`app/app/lib/mainline/adapters/`（当前不存在），把 `CourseV2`（旧）↔ `MainlineCourse`（新）双向转换。
3. **上课入口**：mainline 目前只有 demo 页。需要一个 `findCourse → MainlineCourse → StageCanvas` 的真实播放路由。

**第一条垂直切片**（设计 18.5）：不碰生成器。取 `samples.ts` 里已验证的黄金课（`golden-middle-tianjingsha` 初中语文，文科；或引入 round05 历史课 `fcf9bc34` 经 adapter 转换）→ 落库 → 一个上课路由 → StageCanvas 播放 → 闸门跑通。**目标是证明「Course→Stage→QualityGate」链路可端到端运行**，而不是证明能生成。

**六个阶段**（对齐设计 Phase 0-5，落到本仓库文件）：
- **P0 止血**（0.5 天）：`present`/`live` 加降级拦截、feature-zones 台账接线到路由守卫。
- **P1 垂直切片**（3-5 天，关键路径）：落库 + adapter + 上课入口，一门样板课端到端。
- **P2 骨架主导生成**（1-2 周）：把旧线 `buildHardSkeletonRundown` 的产物形态从 RundownNode/SceneAtom 转成 Scene/Beat（compile-lesson / fill-scenes）。
- **P3 备课工作台**（1-2 周）：mainline 侧的结构树 + 画面预览 + 闸门定位 + 单页重生成。
- **P4 个人跟课与反馈闭环**（1 周）：把旧线 `@maolab/classroom` 的 DeliveryPlan/补教能力接到 mainline runtime。
- **P5 输出恢复**（延后）：PPTX/视频/media 只从过闸课程导出。

**必须用户拍板的三件事**（详见第 7 节）：DB 表 vs JSON blob；是否废弃 `present`/`live` 路由；P2 骨架库从旧 `teaching-skeletons.ts` 移植还是重写。

---

## 1. 迁移策略总纲

### 1.1 三条原则（源自设计 18.1）

1. **壳内重启**：保留仓库、依赖、资产、可运行服务；新主线不再服从旧代码结构，但也不推倒旧代码。
2. **adapter 单向门**：旧数据只能通过 `adapters/` 进入新 `MainlineCourse`，禁止 mainline 生成/渲染代码直接 import 旧 `SceneAtom`/`Rundown` 类型。这是防污染的硬边界。
3. **新旧都能做同一件事时，以新主线为准**（设计 18.3）。

### 1.2 绞杀者（strangler）并行边界

| 区域 | 迁移前（现状） | 迁移中（P1-P4） | 何时冻结/退役 |
| --- | --- | --- | --- |
| 旧 v2 创作流（create→...→atoms） | 生产主路径 | **只读冻结**：可查看、回放、修 bug；不接新需求 | P2 完成、新生成器过 3 门真检后停止新建入口 |
| 旧上课 `/v2/[id]?mode=lecture`（LectureMode） | 唯一正式上课 | 与新 mainline 上课并行；旧课走旧、新课走新 | P4 完成后旧上课只服务旧数据 |
| `/v2/[id]/present`（PresentMode） | **可直接访问，无拦截** | P0 立即加降级/合并提示 | P1 后重定向到 mainline 上课或旧 lecture |
| `/live` | 可直接访问 | P0 加实验区 banner | 保持实验区，不退役 |
| mainline `/mainline/sample` | 唯一 demo 挂点 | P1 起被真实上课路由取代 | demo 保留作回归 |
| `courses_v2` 表 | 存旧 CourseV2 | P1 起同表也存新 mainline（JSON 列，见 4.2） | 不退役 |

**冻结的操作定义**：给旧 v2 创作 API（`from-kps`/`generate`/`rundown`/`atoms-only` 等 route）不加任何新特性；只在 round06+ 真检抓到 bug 时修。新增能力一律进 mainline 侧。

### 1.3 层次归属（设计 10.1 五层 + adapters）

mainline 代码必须落到六层之一，且已建部分对应如下：

| 层 | 目录 | 现状 |
| --- | --- | --- |
| domain | `app/app/lib/mainline/domain.ts`, `scene-techniques.ts` | ✅ 已建齐 |
| quality | `app/app/lib/mainline/quality-gates.ts` | ✅ 已建齐（可跑 auditMainlineCourse） |
| samples | `app/app/lib/mainline/samples.ts` | ✅ 3 门黄金课 |
| presentation | `app/app/components/mainline/{StageCanvas,DialogueLayer,SceneTechniqueView,QualityPanel}.tsx` | ✅ demo 级 |
| **adapters** | `app/app/lib/mainline/adapters/`（**待建**） | ❌ 缺 |
| **generation** | `app/app/lib/mainline/generation/`（**待建**） | ❌ 缺（P2） |
| **runtime/落库** | `app/app/lib/mainline/store.ts`（**待建**） | ❌ 缺（P1） |

---

## 2. 第一条垂直切片（设计 18.5）

### 2.1 选哪门课

**建议：`golden-middle-tianjingsha`（初中语文《天净沙·秋思》）**，理由：
- 已在 `samples.ts` 完整建模（4 scenes / 3 fragments / 9 beats / 双角色 / qualityStatus='passed'），`auditMainlineCourse` 对它应返回 0 blocking（P1 首个验收点）。
- 文科、初中，与 round05 的文科气质一致，能复用现有 cast 资产路径（`/generated-images/cast/base/middle/summer`）。
- 满足设计 18.5 全部要求：单知识点、单年级、单老师、单同学功能、3-5 scene、≥2 版式、≥1 SceneTechnique、全程 1920×1080、有板书/讲解/提问/反馈。

**次选/并行验证：round05 历史课 `fcf9bc34`**（DB 中真实存在的旧 CourseV2）——用它验证 adapter 的**真实数据转换路径**（不是硬编码样板）。切片阶段先用样板课打通渲染链路，adapter 用 `fcf9bc34` 验证「旧→新」转换能产出可播放的 MainlineCourse。两条并行不冲突。

### 2.2 切片端到端链路

```
samples.ts 黄金课 (硬编码 MainlineCourse)
  └→ [新] store.ts: saveMainlineCourse() 写入 courses_v2 (data JSON, 加 schemaKind 标记)
        └→ [新] 上课路由 /mainline/[courseId]/page.tsx: findMainlineCourse()
              └→ auditMainlineCourse() 跑六类闸门 (blocking>0 则拦)
                    └→ StageCanvas 渲染 (复用现有组件)
```

并行验证支线：
```
DB 里真实 CourseV2 fcf9bc34
  └→ [新] adapters/course-v2-to-mainline.ts: toMainlineCourse(courseV2)
        └→ (进入上面同一条 store→路由→audit→stage 链路)
```

### 2.3 最小文件改动清单

**新增（7 个文件）**：

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `app/app/lib/mainline/store.ts` | `saveMainlineCourse` / `findMainlineCourse` / `listMainlineCourses`，写 `courses_v2.data`，用 `data.schemaKind='mainline'` 与旧 CourseV2 区分 | `@maolab/db` 的 coursesV2 repo（复用 course-store.ts 同一 repo）|
| `app/app/lib/mainline/adapters/course-v2-to-mainline.ts` | `toMainlineCourse(c: CourseV2): MainlineCourse`，旧 atoms→scenes、旧 learningFragments→新 fragments、旧 beat→新 LessonBeat、teacher/cast/voice profile 从 PRESET_TEACHERS + ip-style-library 组装 | 只 import 旧类型做入参，产出纯 domain 类型 |
| `app/app/lib/mainline/__tests__/course-v2-to-mainline.test.ts` | 用 DB 里 `fcf9bc34` 的快照测 adapter 产物能过 auditMainlineCourse（0 blocking）| vitest |
| `app/app/lib/mainline/__tests__/samples-quality.test.ts` | 断言 3 门样板课 `auditMainlineCourse` 返回 0 blocking（回归护栏） | vitest |
| `app/app/(classroom)/mainline/[courseId]/page.tsx` | 真实上课路由（server component），`findMainlineCourse → audit → notFound/blocked/StageCanvas` | store.ts + quality-gates + StageCanvas |
| `app/app/api/v2/mainline/seed-samples/route.ts` | 一次性把 `GOLDEN_MAINLINE_COURSES` 落库（开发/演示用），或改为 `scripts/` 一次性脚本 | store.ts |
| `app/app/components/mainline/StageCanvas.tsx`（**改**，见下） | 支持单课模式 | — |

**改（2 个文件，最小）**：

| 文件 | 改动 | 理由 |
| --- | --- | --- |
| `app/app/components/mainline/StageCanvas.tsx` | 当前只接 `courses: MainlineCourse[]` 做 demo 多课切换。加一个单课入口（`course: MainlineCourse`）或让路由传单元素数组。**优先零改**：路由直接传 `[course]` 数组，不改组件 | 复用而非重写 |
| `packages/db/src/repositories/courses-v2.sqlite.ts` | 若 `list()` 需按 schemaKind 过滤，加一个可选过滤参数（否则 P1 不改 DB 层） | 让课程库能区分新旧课；可延后到 P3 |

**DB 表**：**P1 不新增表**。用 `courses_v2.data` JSON 列存 `MainlineCourse`，在 JSON 里加 `schemaKind: 'mainline'` 判别字段。旧 CourseV2 无此字段即视为 legacy。理由见 4.2。

### 2.4 切片验收标准

1. `pnpm test` 新增两个测试通过：样板课 0 blocking；`fcf9bc34` 经 adapter 后 0 blocking（或列出的 blocking 是真实数据缺陷而非 adapter bug）。
2. 浏览器访问 `/mainline/<落库的样板课id>` 能看到 StageCanvas 播放全部 4 个 scene，翻页/技术视图/对话层正常。
3. `pnpm typecheck` 全绿；`pnpm build` 通过。
4. **不触碰任何旧 v2 生产文件**（route/lib/v2 生成链）——用 `git diff --stat` 证明改动只落在 mainline 目录 + 一个上课路由。

### 2.5 切片可回滚点

- 全部改动在 mainline 目录 + 新路由，旧线零改动 → 回滚 = 删除新增文件 + revert StageCanvas 的单课支持。
- 落库用 JSON 列不加表 → 无迁移，回滚不涉及 schema。
- 落库的样板课带 `schemaKind='mainline'`，旧课程库列表按需过滤即可隐藏，不影响旧课。

---

## 3. 分阶段路线（落到文件级）

> 每阶段格式：目标 / 涉及文件 / 依赖 / 验收 / 回滚点。

### Phase 0：止血（对齐设计 Phase 0，0.5 天）

**目标**：停止扩散——平行体验加拦截，边界台账接线，新功能强制绑主线。

**涉及文件**：
- `app/app/(classroom)/v2/[courseId]/present/page.tsx`：加降级——重定向到 `?mode=lecture` 或显示「present 已合并进上课模式」提示（当前**无任何拦截**，直接渲染 PresentMode）。
- `app/app/(classroom)/live/**/page.tsx`：加实验区 banner（不退役）。
- `app/app/lib/mainline/feature-zones.ts`：已有 `canEnterMainline()` 但**无任何路由调用**（现状核实）。P0 不强求接线，但在文档记录「台账是唯一事实来源」。
- `CLAUDE.md` / `docs/README.md`：登记「新功能一律进 mainline，旧 v2 创作流冻结」。

**依赖**：无。

**验收**：直接访问 `/v2/<id>/present` 不再进入平行视觉；`git log` 显示冻结声明落档。

**回滚点**：纯拦截逻辑，revert 即恢复。

**注意**：P0 是低风险高价值，但「废弃 present/live」是需用户拍板的决策（第 7 节），P0 只做「加提示/软降级」，不做硬删除。

---

### Phase 1：垂直切片 = 落库 + adapter + 上课入口（对齐设计 18.5，关键路径，3-5 天）

**目标**：一门样板课从 Course 走到 Stage 走到 Quality Gate，端到端可运行。

**涉及文件**：见 2.3 清单。

**依赖**：mainline domain/quality/samples/presentation（**已就绪**）。这是 P1 能这么快的原因——只接线不造血。

**验收**：见 2.4。挂到测试（新增 2 个 vitest）+ 人工「真检式」走查（专家能翻完 4 页且画面-讲解-板书自洽——本质是把 round05 的真检方法用到 mainline 首课）。

**回滚点**：见 2.5。

**关键子任务顺序（内部串行）**：
1. `store.ts`（先，一切依赖它）→ 2. `seed-samples` 落一门课 → 3. 上课路由 → 4. StageCanvas 单课支持 → 5. samples-quality 测试 → 6.（并行）adapter + adapter 测试。

---

### Phase 2：骨架主导生成（对齐设计 Phase 2 + 7.2 新管线，1-2 周）

**目标**：新课不再走旧 atoms-only 的自由生成，而是骨架 → compile scenes → LLM 填槽 → 编译 beats。

**关键现状（对简报的重要修正）**：旧 `rundown.ts` **已有硬骨架填槽路径**——`matchActiveSkeleton()`（`skeleton-store.ts`）命中时走 `buildHardSkeletonRundown()`，按 `skeleton.arc` 确定 node 序列，注 constraint「只填槽，不自由加剧情壳」，完全绕过 LLM 自由编排。所以 Phase 2 **不是从零造骨架层**，而是：
- (a) 把骨架产物形态从 `RundownNode[]`（喂 atoms-only）转成 `LessonFragment/LessonScene[]`（喂 fill-scenes）。
- (b) 把 `teaching-skeletons.ts`（旧 `SkeletonStep`：role/atomType/visualForm/slot）映射到 mainline `TeachingSkeleton`（arc/requiredVisualForms/requiredChecks/nonGoals）。

**涉及文件**：
- 新增 `app/app/lib/mainline/generation/choose-skeleton.ts`：包 `matchActiveSkeleton`，产出 mainline `TeachingSkeleton`。
- 新增 `app/app/lib/mainline/generation/compile-lesson.ts`：按 skeleton.arc 生成 `LearningFragment[] + LessonScene[]` 骨架（空 contentSlots/teacherScript，待填）。对标设计 7.2 step 3。
- 新增 `app/app/lib/mainline/generation/fill-scenes.ts`：LLM 逐 scene 填 contentSlots/teacherScript/boardText/narrationAnchor/voiceCue/peerFunction 等（设计 6.4 全字段）。step 4。
- 新增 `app/app/lib/mainline/generation/technique-plan.ts`：为 scene 选 SceneTechnique（用 `sceneTechniquesForSceneType()`）。step 5。
- 新增 `app/app/lib/mainline/generation/compile-beats.ts`：scene→LessonBeat[]，保证每 speak/point/reveal 有画面对象。step 6。
- 新增 `app/app/lib/mainline/generation/pipeline.ts`：串起 analyze→skeleton→compile→fill→technique→beats→quality-gate，失败按层回退（设计 7.3，禁黑箱 repair）。
- 新增 `app/app/api/v2/mainline/generate/[courseId]/route.ts`：新生成入口。
- **参考只读**（adapter 迁移来源，不改）：`rundown.ts`、`generate-atoms-only.ts`、`teaching-skeletons.ts`、`skeleton-store.ts`、`show-planner.ts`（beats）。

**依赖**：P1 的 store + domain。可复用旧 `@maolab/llm-shared` 的 callLLMJson、旧 baseline-resolver（教学设计基线）、旧 KP context。

**验收**：
- 用 P1 的样板课对应的 KP 走新生成器，产出的 MainlineCourse 过 `auditMainlineCourse` 0 blocking，且能在 P1 的上课路由播放。
- 至少 2 门课（1 文 1 理，设计 18.5）跑通，验证模型可复用。
- 挂现有真检方法：新生成课过 round06 真检（复用 round05 的双专家 + 逐 atom/scene 审）。
- 相同知识类型生成结构稳定（设计 Phase 2 成功标准）。

**回滚点**：新生成器完全独立于旧 atoms-only；出问题就让新建入口继续指向旧 from-kps→generate 链路。generation/ 目录整体可删。

**风险**：这是最重的阶段。fill-scenes 的 LLM 填槽质量、beats 编译的画面对象对齐，都需要多轮真检。建议 P2 内部先做 compile-lesson（纯结构，无 LLM）跑通骨架→空 scene，再逐步加 fill/technique/beats。

---

### Phase 3：备课工作台（对齐设计 Phase 3 + 8.1，1-2 周）

**目标**：老师能看懂并改动 mainline 课程质量。

**涉及文件**：
- 新增 `app/app/(setup)/mainline/[courseId]/prep/page.tsx` + 客户端：左结构树（fragment→scene）、中画面预览（复用 SceneTechniqueView）、右闸门面板（复用 `QualityPanel.tsx` + `auditMainlineCourse`）。
- 新增 `app/app/api/v2/mainline/regenerate-scene/[courseId]/route.ts`：单 scene 重生成（复用 P2 fill-scenes）。
- 改 `app/app/components/mainline/QualityPanel.tsx`：从 demo 只读升级为「问题→定位到 fragment/scene/beat/cast」可跳转（`QualityIssue.targetType/targetId` 已具备定位信息）。
- 设计 17.6 的「版本/差异/回滚」：`MainlineCourse` 存快照数组或在 store 加 revision——**建议 P3 才碰**，P1/P2 不做。

**依赖**：P1（store/audit）+ P2（scene 重生成）。

**验收**：设计 Phase 3 标准——用户 5 分钟内判断可上性；能删/合并/改问题页；系统能解释某页为何被判问题（`QualityIssue.message + impact + fix` 已提供）。

**回滚点**：备课工作台是新增只读+重生成路由，不影响上课链路，可整体下线。

---

### Phase 4：个人跟课与反馈闭环（对齐设计 Phase 4 + 8.3，1 周）

**目标**：学生一个人用时仍被教（非自学翻材料）。

**涉及文件**：
- 新增 `app/app/(classroom)/mainline/[courseId]/follow/page.tsx`：个人跟课模式（上课模式的节奏变体，非独立自学）。
- runtime 接线：把旧 `@maolab/classroom`（buildDeliveryPlan / initQueue / 补教 REMEDIATION_WINDOW，见 ClassroomV2Client.tsx）适配到 mainline 的 fragment/scene 序列。
- `LearningFragment.successSignal`（已在 domain）落地为「可观察信号」（设计 17.1）：复述/小判断/指错/迁移。
- 答错→错因分类→补教片段（设计 17.2），对应 fragment 的 goalId/successSignal。

**依赖**：P1（上课链路）+ 旧 classroom 引擎（复用，不重写）。

**验收**：设计 Phase 4 标准——答错回到知识缺口而非只显示答案；学习记录影响播放顺序。

**回滚点**：跟课是新路由，独立于课堂授课。

---

### Phase 5：输出能力恢复（对齐设计 Phase 5，延后）

**目标**：主流程稳定后恢复导出，且只从过闸课程导出。

**涉及文件**：`app/app/api/v2/export-pptx/[courseId]/route.ts`（改为读 mainline + 校验 qualityStatus='passed'）；media remix 只从过闸片段生成。

**依赖**：P1-P4 全部稳定。**明确延后，第一阶段不做**（设计 18.4）。

---

## 4. 优先级与排序

### 4.1 关键路径（解锁后续，必须先做）

1. **DB 决策（JSON blob vs 真实表）** — 阻塞 P1 store.ts 的实现方式。**建议先 JSON blob，零迁移**（见 4.2），可后续再抽表。
2. **P1 store.ts + adapter + 上课路由** — 是「证明链路可跑」的最小闭环，P2/P3/P4 全部依赖它。
3. **P2 compile-lesson（纯结构层）** — 骨架→scene 的形态转换是新生成器的地基；fill/technique/beats 都挂在它下面。

### 4.2 DB 决策论证（建议方案）

**建议：P1-P3 复用 `courses_v2.data` JSON 列，用 `schemaKind` 判别，P4 后再评估抽表。**
- 现状：`courses_v2` 把整个 CourseV2 序列化进单个 `data` TEXT 列（schema.ts:72-80），`course-store.ts` 是薄 repo。mainline 无任何表。
- 复用 JSON 列：零 migration、零 schema 风险、复用现成 repo（find/save/list/delete/transition）。`MainlineCourse` 是纯可序列化对象，直接 `JSON.stringify` 进 data 列，加 `schemaKind:'mainline'` 与旧 CourseV2 共存同表。
- 代价：无法按 mainline 字段做 SQL 查询（但当前旧线也不这么查，是全量反序列化）。可接受。
- 何时抽真实表：当需要「按 scene/fragment 检索」「版本 diff（设计 17.6）」「课程库大规模过滤」时——**P3/P4 的需求**，那时数据量和查询模式已清晰，抽表风险可控。**过早抽表 = 在需求不明时锁死 schema**，违反「改前建基线」。

### 4.3 可并行的部分

- P0 止血 ‖ P1 前期设计（store 接口定义）——可同时进行。
- P1 内：adapter（`fcf9bc34` 支线）‖ 样板课落库+上课（主线）——两条独立验证。
- P2 内：`teaching-skeletons.ts → TeachingSkeleton` 映射 ‖ StageCanvas 从 demo 升级为真实播放器（若 P1 只做最小复用，P2/P3 再抛光）。

### 4.4 必须串行的部分

- store → 上课路由 → StageCanvas（数据先落库才能取）。
- compile-lesson（结构）→ fill-scenes（填内容）→ compile-beats（编演出）——生成管线的天然依赖链。
- P1 → P2（P2 生成的课要落到 P1 的 store/路由验证）。

---

## 5. 技术债止血与迁移的关系

### 5.1 PresentMode.tsx（1937 行）与三套舞台

**取舍建议：不拆旧的，新舞台在 mainline 侧长出，旧的冻结。**

理由（对照设计 10.2「需要拆的文件」）：
- 设计文档写于 2026-06-30，当时 PresentMode 1518 行；现已 1937 行——**继续在长，拆它是在给冻结区投资**。
- 旧线有三套渲染（AtomRenderer 532 行 / PresentMode 自建 AtomStage / BeatStage 832 行 import SlotPresenters）+ 三套坐标系（ScaleStage/AspectStage/StageCanvas）。**在旧结构上合并三套 = 高风险重构，且成果仍绑死旧 SceneAtom 模型**，不服务新主线。
- mainline 已有干净的单一舞台（StageCanvas + DialogueLayer + SceneTechniqueView），基于 LessonScene 模型。**正确的「合并」是让新舞台成为唯一舞台，旧三套随旧数据一起冻结**，而非把旧三套揉成一套再迁。

**结论**：
- 旧 AtomRenderer/PresentMode/BeatStage 进「旧只读区」，只修 bug（round05 就在这么做），**不拆分、不合并**。
- mainline StageCanvas 从 P1 的 demo 级逐步抛光（P1 复用 → P2 补技术渲染分支 → P3 补备课预览 → P4 补跟课节奏）成为唯一正式舞台。
- 待旧 v2 课程全部退役（远期，非本计划范围）后，整块删除旧三套。

**唯一例外**：`lib/v2/semantic-highlight-colors.ts`（语义色，有单测，已进生产）是旧线里**符合新主线设计 9.3**的资产 → P2/P3 时经 adapter 或直接在 mainline presentation 层复用，不冻结。

### 5.2 其他债的处理

| 债 | 处理 | 阶段 |
| --- | --- | --- |
| `fragment-quality.ts` + `fragment-quality-repair.ts`（扁平 issue，原地 patch） | 旧线保留；mainline 用 `quality-gates.ts`（已分六类 + 定位层）替代，不迁旧的 | P1 已就绪 |
| `learning-fragments.ts`（对旧 atom 事后分组 atomIds） | 旧线保留；mainline compile-lesson 用 sceneIds 正向生成，不事后分组 | P2 |
| backfill-beats / backfill-images（事后补） | 旧线保留；mainline 用 compile-beats + asset-plan 正向生成（设计 7.2 step 6/7） | P2 |
| `CourseStatusV2`（17 枚举，无 skeleton 状态） | 旧线保留；mainline 用 `MainlineCourse.qualityStatus`（draft/blocked/passed，已在 domain）——**不扩旧状态机** | P1 |

---

## 6. 风险与决策点

### 6.1 需用户拍板的关键决策

**决策 1：DB — 加真实表 vs 继续 JSON blob**
- 建议：**先 JSON blob（`schemaKind` 判别），P4 后再评估抽表**（论证见 4.2）。
- 需拍板：是否接受「mainline 课暂不可 SQL 检索」这一代价换零迁移风险。

**决策 2：是否废弃 `present`/`live` 路由**
- 现状：`/v2/[id]/present` **可直接访问、无拦截**（PresentMode 平行体验仍活）；`/live` 同理。
- 设计立场：present「降级/合并」，live 进实验区（CORE_VS_EXPERIMENTAL 第 4/5 节）。
- 需拍板：P0 只做「软降级/加提示」是否足够，还是本轮就硬重定向 present→mainline 上课？（涉及是否影响正在用 present 的演示流程）。

**决策 3：P2 骨架库来源 — 移植旧 `teaching-skeletons.ts` vs 重写**
- 现状：旧线已有可运行的 `SkeletonStep` 骨架 + `matchActiveSkeleton` + `buildHardSkeletonRundown`（硬骨架填槽路径，被 rundown 实际调用）。
- 现状补充：`teaching-skeletons.ts` 已导出 `SEED_SKELETONS`（6 个内置种子骨架）+ `KnowledgeType`（9 类）/`TeachingType`（6 类）/`VisualForm`（11 类）分类器 + `extractCandidateSkeleton`（候选骨架）+ `skeleton-store.ts` 的候选→沉淀流程。**旧骨架库相当完整，重写成本高。**
- 选项：A. 移植旧骨架定义到 mainline `TeachingSkeleton`（省事，复用 6 种子 + 分类器 + 匹配，但继承旧 atomType/visualForm 语义，需在 adapter 里映射 VisualForm→requiredVisualForms）；B. 用 `samples.ts` 里 3 门课的 teachingSkeleton 为种子重新沉淀骨架库（干净，但要重建 KnowledgeType×TeachingType 匹配逻辑）。
- 需拍板：优先复用（A）还是优先干净（B）。**建议 A 起步（快速验证），B 收敛**。

**决策 4（延后至 round05 待决项）：map/形势图 visualSpec 类**
- round05 FINAL-REPORT 待决项：历史形势图/地理地图无结构化 visualSpec，回退不可靠生图。
- 与本迁移的关系：mainline `LessonScene` 用 `contentSlots` + `sceneTechnique` 而非旧 `visualSpec` 枚举——**迁移到 mainline 后，此约束从「枚举硬限制」变为「SceneTechnique 是否覆盖地图类」**。建议在 P2 technique-plan 时把「地图/形势图」作为一个待补 SceneTechnique 立项，而非现在决策。

### 6.2 技术风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| adapter 把旧 SceneAtom（10 类）映射到 Scene（19 字段）时字段缺失 | 转换出的 scene 过不了 audit 的 REQUIRED_SCENE_FIELDS | adapter 对缺失字段用保守默认（如 dialogueLayout='no-character'、fallbackPresentation 从 board 组装）；audit 的 blocking 暴露真实缺口，不静默填假值 |
| P2 fill-scenes LLM 填槽质量不如旧 atoms-only（旧线经多轮真检打磨） | 新课质量回退 | P2 复用旧 baseline-resolver / KP context / 分龄约束（round05 沉淀的能力），不从零写 prompt |
| mainline 与旧线在 courses_v2 同表共存，list 混淆 | 课程库列表新旧混杂 | store.list 按 schemaKind 过滤（DB 层加可选参数，见 2.3） |
| StageCanvas 是 demo 级，真实播放缺 TTS/beat 时间轴驱动 | 上课体验不完整 | P1 只验证静态翻页链路；TTS/beat 驱动放 P2（compile-beats 后）+ 复用旧 useTtsAudio.ts |

### 6.3 不可逆动作清单（需格外谨慎）

- 任何对 `courses_v2` 的 schema 变更 / migration → 本计划**刻意避免**（用 JSON 列）。若决策 1 选「加表」，必须先备份 `data/maolab.db`（102MB，勿删），且 migration 可回滚。
- 删除旧 AtomRenderer/PresentMode/BeatStage → **本计划不删**，只冻结。删除是旧课全退役后的远期动作。

---

## 7. 不做什么（设计 18.4，第一阶段克制边界）

P0-P1 明确**不做**：
- 不迁移全部旧课程（只落 1 门样板 + 1 门真实数据验证 adapter）。
- 不改任何旧 v2 生成链文件（from-kps / rundown / atoms-only / generate route）。
- 不加 DB 表、不做 migration。
- 不拆 PresentMode/BeatStage/SlotPresenters（冻结）。
- 不恢复 live / media remix / 整课视频 / 复杂 PPTX 编辑器。
- 不做批量生成（黄金样板课过闸前）。
- 不做版本 diff/回滚（设计 17.6，留 P3）。
- 不做 map/形势图 visualSpec（留 P2 立项）。

**先把一门课在新主线上跑对，再扩到十门。**

---

## 附录 A：现状核实与对简报的修正

已逐文件核实，**简报绝大部分准确**，以下是补充/修正（以代码为准）：

1. **[修正-重要] 旧线已有「硬骨架填槽」路径，非纯自由生成**。简报称 rundown.ts 是「LLM 自由生成节目单」。实际：`rundown.ts:434-442` 先 `matchActiveSkeleton()`，命中则走 `buildHardSkeletonRundown()`（`rundown.ts:382-422`），按 `skeleton.arc` 定 node 序列，constraint 明写「节点序列由 skeleton 的 arc 确定，后续生成只填槽，不自由加剧情壳」。**只有未命中骨架才 fallback 到 LLM 自由生成**（`rundown.ts:444+`）。这直接影响 Phase 2 定性：是「形态转换」而非「从零造骨架层」。骨架定义在 `app/app/lib/v2/teaching-skeletons.ts`（`SkeletonStep`），匹配在 `skeleton-store.ts`。

2. **[修正-程度] mainline 不是「类型草案」，是可运行的完整原型**。`quality-gates.ts`（334 行）是能实际执行的 `auditMainlineCourse`，覆盖六类闸门 + 定位到 course/goal/fragment/scene/beat/cast/voice。`scene-techniques.ts` 是 10 条完整技术库（含 supportedSceneTypes/interactionDemand/fallback/auditFocus）。StageCanvas/DialogueLayer/SceneTechniqueView/QualityPanel 四个组件齐全。简报说「类型全建出」偏保守——闸门和技术库是**有业务逻辑的实现**，不只是类型。

3. **[确认] mainline 完全不落库、无 adapter、无 api 引用**。全库仅 `/mainline/sample/page.tsx` import mainline（`lib/mainline` barrel 见 index.ts）。`schema.ts` 无 scene/skeleton/mainline 表（仅 legacy `stages.scenes` 列 + 一处 ContentUnit 注释）。`canEnterMainline()` 存在但无路由调用。**与简报一致。**

4. **[确认] courses_v2 是单 data JSON 列**。`schema.ts:72-80` + `course-store.ts`（薄 repo：find/save/list/delete/transition over coursesV2 repo）。与简报一致。

5. **[修正-细节] 上课入口已部分收敛，但 present 未拦截**。`/v2/[courseId]/page.tsx:23` 强制 `mode!=='lecture'` → redirect 到 lecture，**SelfStudyMode 在主入口已摸不到**（源文件孤儿存在，符合简报）。但 `/v2/[courseId]/present/page.tsx` 是**独立路由、无 mode 拦截、直接渲染 PresentMode**（appendix 已读源码确认）——平行体验仍活，与简报「present/live 仍可直达未降级」一致。

6. **[确认] 真实创建管线**（7 步 API 序列，Explore 子代理复核）：`POST from-kps`（建 shell，plan-draft）→ `method-plan` + approve → `rundown`（`generateRundown`，含硬骨架分支）→ `showscript` → `script-only` → `atoms-only`（`runAtomsOnlyGeneration`，`generate-atoms-only.ts:184+`，自由生成整页 payload 非填槽）→ QA 重试 → beats（`show-planner.ts`）→ learning-fragments → fragment-quality → ready。fragment-quality 事后审 + repair 原地 patch。与简报一致。

7. **[确认] samples.ts 3 门黄金课**：`golden-primary-jingyesi`（小学语文）/ `golden-middle-tianjingsha`（初中语文）/ `golden-middle-refraction`（初中物理）。全字段完整、qualityStatus='passed'。与简报一致。

（注：一个并行 Explore 子代理已复核 course-store / routing / 骨架 / mainline 引用面，结论与上述逐条一致，并额外确认：`canEnterMainline()` 在全库 **0 处调用**；`teaching-skeletons.ts` 导出 6 个 `SEED_SKELETONS` + 分类器 + 候选沉淀流程。以代码为准。）
