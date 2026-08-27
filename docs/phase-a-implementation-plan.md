# Phase A 实施方案：教材本体驱动课堂教学模式

> 状态：勘察完成，待实施 · 2026-05-24

---

## 1. 现状勘察

### 1.1 教材库 knowledgeType 字段覆盖率

教材索引层（packages/textbook-index/src/types.ts:16）：TextbookEntry 和 NationalLesson（tree-types.ts:23）均无 knowledgeType 字段。

备课层（packages/setup/src/curriculum-designer.ts:57）：knowledgeAnalysis.primaryType 是 LLM 产出字段，值域 factual|conceptual|procedural|metacognitive，不来自教材库。

课程聚合层（packages/shared-types/src/course.ts:120）：CourseV2 无 knowledgeType 字段。

结论：教材库不存 knowledgeType；备课层的 primaryType 是 LLM 即兴标注，覆盖率 0。

### 1.2 数据流（关键断层）

教材索引 TextbookEntry（无 knowledgeType）
  → baseline-resolver OCR → LessonDesignBaseline（文本，无结构化 knowledgeType）

CurriculumDesigner.design（curriculum-designer.ts:84，LLM，temperature=0.4）
  → LLM 自由选 → primaryType + bloomsLevel + outline[].teachingModeId
  → MODE_TO_SCENE_TYPE（curriculum-designer.ts:28）立刻抹平 teachingModeId → sceneType
  → app/lib/actions/setup.ts:170 → 备课审批页 bloomsLevel+primaryType 文字标签（仅展示）
  → TeachingMethodPlan → Rundown → atom-worker 分发 → SceneAtom[]
    → ClassroomV2Client.tsx:16 course.atoms 静态数组  ← 关键断层
      → AtomRenderer switch atom.type → 8 个渲染组件

AdaptiveController（controller.ts:25）：逻辑完整，shouldSkip/suggestRemediation/IRT → 零调用方 ← 关键断层
student-response-store → student_responses 表（correct/timeSpentMs/objectiveIds 已有）
  ← AtomRenderer SingleQuestionView POST /api/v2/student-response

三处关键断层（已审计确认）：
1. primaryType 从 LLM 产出后走备课审批页 UI 标签，不影响 atom 生成时的类型选择
2. ClassroomV2Client 的 atoms 是 course.atoms 静态数组，AdaptiveController 逻辑完备但零调用
3. MODE_TO_SCENE_TYPE（curriculum-designer.ts:28）立刻把 teachingModeId 映射回旧 6 种 sceneType，用新标签走旧路

### 1.3 关键文件 file:line 索引

| 文件 | 关键 loc | 当前行为 |
|------|----------|----------|
| packages/setup/src/curriculum-designer.ts:18 | VALID_TEACHING_MODE_IDS | 硬编码 6 个 mode，LLM 自由选 |
| packages/setup/src/curriculum-designer.ts:28 | MODE_TO_SCENE_TYPE | teachingModeId → sceneType 立刻抹平 |
| packages/setup/src/curriculum-designer.ts:57 | primaryType zod schema | LLM 产出，不来自教材 |
| packages/setup/src/prompts/curriculum-design.md:41 | Knowledge Type Guidelines | 建议性文字，LLM 不强制遵守 |
| packages/shared-types/src/teaching-modes.ts:74 | TEACHING_MODES 数组 | 6 个 mode，无 knowledgeType 字段 |
| packages/shared-types/src/teaching-method-plan.ts:12 | TeachingMethodId | 与 teachingModeId 是两套平行概念 |
| packages/shared-types/src/scene-atom.ts:14 | AtomType | 8 种 atom，无 worked-example |
| packages/shared-types/src/course.ts:120 | CourseV2 | 无 knowledgeType 字段 |
| packages/classroom/src/adaptive/controller.ts:25 | AdaptiveController | 逻辑完整，无调用方 |
| app/app/(classroom)/v2/[courseId]/ClassroomV2Client.tsx:16 | atoms = course.atoms 静态 | 不经 AdaptiveController |
| app/app/(classroom)/v2/[courseId]/AtomRenderer.tsx:38 | switch(atom.type) | 8 个 case，无 worked-example |
| app/app/lib/v2/student-response-store.ts:105 | recordResponse | 写 student_responses 表 |
| app/app/lib/actions/setup.ts:170 | bloomsLevel/primaryType 透出 | 仅 UI 标签 |
| app/app/lib/types/setup-types.ts:5 | bloomsLevel/primaryType 类型 | UI 层 |
| packages/textbook-index/src/types.ts:16 | TextbookEntry | 无 knowledgeType |
| packages/textbook-index/src/tree-types.ts:23 | NationalLesson | 无 knowledgeType |

---
## 2. 改动清单（逐文件、逐函数级别）

### Sprint A1.1 — knowledgeType → teachingMode 规则函数

新增 packages/shared-types/src/knowledge-type-rules.ts

目的：定义 KnowledgeType 枚举 + 规则表 + resolveTeachingMode 函数

关键接口：
  export type KnowledgeType = factual | conceptual | procedural | metacognitive
  映射表（A1 阶段）：
    factual       → lecture-image      （呈现 + 旁白）
    conceptual    → socratic-dialogue  （有前置铺垫时；无铺垫降级 lecture-image）
    procedural    → lecture-diagram    （worked-example 占位，B 阶段换 demonstration）
    metacognitive → socratic-dialogue  （判断/迁移）
  export function resolveTeachingMode(
    knowledgeType: KnowledgeType,
    hasPriorScaffold: boolean,
  ): { modeId: TeachingModeId; source: rule }

为什么：规则集中在单一文件，测试覆盖直接，加新类型只改这里
风险点：conceptual 映射需要前置铺垫检测，A1 阶段用 hasPriorScaffold = outline.index > 0 做简单代理

修改 packages/shared-types/src/teaching-modes.ts（+5 行）
  在 TeachingModeSpec interface 加 goodForKnowledgeTypes?: KnowledgeType[] 字段
  为已有 6 个 mode 补充该字段
  风险点：additive change，不破坏现有类型

数据库 migration：不需要

---

### Sprint A1.2 — CurriculumDesigner 改为规则驱动

修改 packages/setup/src/curriculum-designer.ts（变更在第 157 行 outline 后处理处）

  在 Zod 校验后 return 前，对每个 outline item 用规则覆写 teachingModeId：

  // 新增于 curriculum-designer.ts:157 左右
  const resolvedOutline = validated.outline.map((item, index) => ({
    ...item,
    teachingModeId: resolveTeachingMode(
      validated.knowledgeAnalysis.primaryType,
      index > 0,
    ).modeId,
  }))

  保留 LLM 在 prompt 中建议 mode（作为 context），在 TypeScript 层强制覆写
  仅当 primaryType 缺失时降级使用 LLM 的 teachingModeId

为什么：不修改 prompt 结构（向后兼容），在 TypeScript 层强制规则
风险点：primaryType 是 per-course 全局唯一，同一门课所有 scene 用相同 mode。A1 接受 per-course 精度，per-scene 精准化留 B 阶段（见 D5）

修改 packages/setup/src/prompts/curriculum-design.md
  Knowledge Type Guidelines 小节加注释：teachingModeId 会由服务端规则自动确定，outline 中的建议仅作参考

修改 packages/setup/src/__tests__/curriculum-designer.test.ts
  新增：primaryType: procedural → 所有 outline item teachingModeId 为 lecture-diagram
  新增：primaryType: factual → 所有 outline item teachingModeId 为 lecture-image

类型改动：无（CurriculumDesignResult.outline[].teachingModeId 已是 optional）

---
### Sprint A1.3 — delivery-adapter 层（教材本体 + 学情 → atom 序列决策）

新增 packages/classroom/src/delivery/delivery-adapter.ts

目的：读教材本体 + 学情 → 决定本节实际 atom 序列

关键接口：
  export interface DeliveryContext {
    courseId: string
    knowledgeType: KnowledgeType
    atoms: SceneAtom[]
    studentHistory?: {
      correctRateByObjective: Record<string, number>
      consecutiveErrors: number
    }
  }
  export interface DeliveryPlan {
    orderedAtomIds: string[]
    insertedRemediation: string[]
    skippedAtomIds: string[]
    reason: string
  }
  export function buildDeliveryPlan(ctx: DeliveryContext): DeliveryPlan

初版 3 条最小策略（A1 阶段）：
  1. consecutiveErrors >= 2 → 在下一个 teach atom 前插入补救（从现有 atoms 倒找 recap-bullet）
  2. correctRateByObjective[id] >= 0.85 → 标记该 objective 的 single-question atoms 为可跳过
  3. knowledgeType === procedural → 强制保留 demonstration atoms 不被跳过

为什么：student_responses 表已有数据，AdaptiveController 已有 shouldSkip/suggestRemediation，delivery-adapter 是串接胶水层
风险点：
  补救 atom 无专用生成管线，A1 阶段用 recap-bullet 临时补救，B 阶段再建 remediation worker
  consecutiveErrors 需在 delivery-adapter 中按时间顺序计算（student_responses 表无此字段）

新增 packages/classroom/src/delivery/index.ts（重导出）
新增 packages/classroom/src/__tests__/delivery-adapter.test.ts

---

### Sprint A1.4 — 装饰字段降级（UI 层）

修改 app/app/lib/actions/setup.ts:170
  删除 bloomsLevel 和 primaryType 字段从 action 返回值
  CurriculumDesignResult.knowledgeAnalysis.primaryType 在 schema 层保留（LLM 内部参考）

修改 app/app/lib/types/setup-types.ts:5
  删除 bloomsLevel: string 和 primaryType: string

风险点：grep 已确认只有上述 2 处，无 TSX 消费

---

### Sprint A2.1 — ClassroomV2Client 接通 delivery-adapter

修改 app/app/(classroom)/v2/[courseId]/ClassroomV2Client.tsx

当前第 16 行：const atoms = useMemo(() => course.atoms ?? [], [course.atoms]) → 静态数组

目标：
  1. 组件挂载时调 buildDeliveryPlan(ctx) → 得到 orderedAtomIds（含补救/跳过决策）
  2. next() 改为沿 orderedAtomIds 推进，非 idx + 1
  3. 每次 single-question atom complete 后，异步更新 studentHistory，重新评估补救插入

数据来源：/api/v2/insights/{courseId}（已有，app/app/api/v2/insights/）
风险点：
  prev() 需记住已播序列快照，不能简单 idx-1
  首次加载有一次额外 round-trip（可用 course 预埋 initialStats 字段避免）

---

### Sprint A2.2 — worked-example atom type 骨架

修改 packages/shared-types/src/scene-atom.ts
  新增 WorkedExampleAtom interface（加入 AtomType union 和 SceneAtom union）：
    type: worked-example
    payload: {
      problemStatement: string
      steps: Array<{ stepNum: number; action: string; explanation: string }>
      conclusion: string
    }

修改 app/app/(classroom)/v2/[courseId]/AtomRenderer.tsx
  加 case worked-example: return <WorkedExampleView ... />
  WorkedExampleView 初版：线性展示 steps 列表，每步一个 NextBtn
  为什么：B 阶段 worker 产出 worked-example 时，无需再改渲染层

---
## 3. 实施顺序（Sprint 拆分）

A1.1 · 规则函数（1 天）
  新增 packages/shared-types/src/knowledge-type-rules.ts
  修改 packages/shared-types/src/teaching-modes.ts
  验收：
  - [ ] resolveTeachingMode(factual, true) → lecture-image
  - [ ] resolveTeachingMode(procedural, true) → lecture-diagram
  - [ ] resolveTeachingMode(conceptual, false) → lecture-image（无铺垫降级）
  - [ ] resolveTeachingMode(conceptual, true) → socratic-dialogue
  - [ ] 4x2=8 个分支单测全绿

A1.2 · CurriculumDesigner 规则驱动（1 天）
  修改 packages/setup/src/curriculum-designer.ts（第 157 行后）
  修改 packages/setup/src/prompts/curriculum-design.md
  修改 packages/setup/src/__tests__/curriculum-designer.test.ts
  验收：
  - [ ] primaryType: procedural → 所有 outline item teachingModeId 为 lecture-diagram
  - [ ] primaryType: factual → 所有 outline item teachingModeId 为 lecture-image
  - [ ] LLM 返回非法 teachingModeId 时不 500，静默走规则覆写
  - [ ] packages/setup 所有现有测试仍通过

A1.3 · delivery-adapter（2 天）
  新增 packages/classroom/src/delivery/delivery-adapter.ts
  新增 packages/classroom/src/delivery/index.ts
  新增 packages/classroom/src/__tests__/delivery-adapter.test.ts
  验收：
  - [ ] consecutiveErrors >= 2 → insertedRemediation 非空
  - [ ] correctRateByObjective[id] >= 0.85 → question atom 出现在 skippedAtomIds
  - [ ] knowledgeType === procedural + shouldSkip 触发 → demonstration 仍不跳过
  - [ ] 3 条策略各 1 正向 + 1 边界用例，全绿

A1.4 · 装饰字段降级（0.5 天）
  修改 app/app/lib/actions/setup.ts
  修改 app/app/lib/types/setup-types.ts
  验收：
  - [ ] pnpm typecheck 通过
  - [ ] 备课审批页不显示 Bloom 层级等标签
  - [ ] CurriculumDesignResult.knowledgeAnalysis schema 不变

A2.1 · ClassroomV2Client 接通（2 天）
  修改 app/app/(classroom)/v2/[courseId]/ClassroomV2Client.tsx
  验收：
  - [ ] 连续答错 2 题后，下一个 atom 是补救内容
  - [ ] correctRate 达标的 objective 对应题目被跳过
  - [ ] prev() 不崩溃，能回看已播 atoms
  - [ ] 无 TypeScript 类型错误

A2.2 · worked-example 骨架（1 天）
  修改 packages/shared-types/src/scene-atom.ts
  修改 app/app/(classroom)/v2/[courseId]/AtomRenderer.tsx
  验收：
  - [ ] TypeScript union 编译通过
  - [ ] 手注 worked-example atom，AtomRenderer 可渲染

---
## 4. 风险与权衡

### 风险 1：教材库 knowledgeType 覆盖率为 0

TextbookEntry（types.ts:16）和 NationalLesson（tree-types.ts:23）均无 knowledgeType；LessonDesignBaseline（OCR 产物）是文本，无结构化知识类型。

兜底方案（等待 D1 决策）：
  方案 A（最小改动）：knowledgeType 继续由 LLM 在 CurriculumDesigner 中产出，规则层以此为输入
  方案 B（渐进标注）：textbook-index schema 加 knowledgeTypeHint?: KnowledgeType 可选字段，admin 脚本批量打标，未打标走 LLM 兜底

### 风险 2：LLM 仍需介入的边界场景

| 场景 | A1 处理 |
|------|---------|
| 教材未标注 knowledgeType | LLM 分类（现有逻辑），规则覆写 mode 选择 |
| 多类型混合（同节课 factual + procedural） | A1 取 primaryType（最重要类型），B 阶段支持 per-node |
| 跨学科课程 | LLM 分类，按 primaryType 取主模式 |

### 风险 3：现有课程数据兼容性

已生成的 CourseV2.atoms（teachingModeId 由旧 LLM 自由选）不需迁移。buildDeliveryPlan 不依赖 teachingModeId，兼容旧 atoms。

### 风险 4：全球化扩展约束

resolveTeachingMode 规则表与语言正交。curriculum-design.md prompt 当前语言固定，B 阶段按学科/语言参数化。

---

## 5. 待用户决策的点

### D1 · 教材未覆盖 knowledgeType 时的兜底策略
  选项 A：继续 100% 由 LLM 即兴判断（建议先选 A，上线 A1）
  选项 B：textbook-index schema 加 knowledgeTypeHint，后台批量打标，未打标走 LLM

### D2 · 装饰字段是物理删除还是隐藏
  选项 A：从 UI action 返回值删除，schema 层保留（本方案默认）
  选项 B：从 CurriculumDesignResult schema 和数据库全部物理删除
  约束：primaryType 在 A1.2 规则层仍需读取，物理删除会破坏 A1.2

### D3 · 旧课程数据是否需要迁移
  选项 A：不迁移，旧课程走旧路（建议选 A）
  选项 B：写批量脚本重新决定旧课程的 teachingModeId（不重生成 atoms）

### D4 · 测试策略
  选项 A：单元测试（vitest 已有），A1 全部包级别覆盖（建议）
  选项 B：A1 单测 + A2 完成后加 1 条 E2E smoke test（创建课程 → 课堂播放 → 答题 → 跳过生效）

### D5 · per-scene knowledgeType（A1 可选扩展）
  选项 A：A1 接受 per-course 精度，B 阶段在 RundownNode 加 knowledgeType 字段
  选项 B：A1 在 OutlineItemSchema 加 knowledgeType?: KnowledgeType optional，LLM 如填则 per-scene 走规则；未填降级 per-course
  建议：选 B，不破坏当前逻辑但为精准化开口子
