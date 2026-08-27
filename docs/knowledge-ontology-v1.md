# 知识本体设计 v1

> 状态：草案 · 待用户审议
> 日期：2026-05-24
> 作者：本体设计师（自动起草）
> 关联：`packages/textbook-index/src/tree-types.ts`、`packages/shared-types/src/teaching-modes.ts`、`packages/shared-types/src/knowledge-type-rules.ts`、`docs/textbook-labeling-pipeline.md`

---

## 0. TL;DR

1. **粒度采用"双层"**：保留教材叶子（9,106 个）作为**索引锚点**（chapter leaf），再在其上引入新的实体 `KnowledgePoint`（KP）作为**教学最小单元**。叶子 → KP 通常是 1:N（典型 1:1~5，复杂叶子可到 10）。
2. **v1 打标六维**：`knowledgeType`（已落地）、`difficulty`、`learningObjectives`（Bloom 动词）、`prerequisites`（KP 级引用）、`misconceptions`、`assessability`。其余维度（`estimatedMinutes`、`examWeight`、`representations`、`transferDistance`、`crossSubjectLinks`、`emotionalLoad`）进 v2 占位，原因见 §3。
3. **打标顺序**：先在叶子级跑 *KP 切分 + 六维标注* 一次性 LLM 调用（每叶子 1 prompt，产出 N 个 KP + 维度），人工抽检 5%；不在叶子上重复打粗维度再细化。
4. **决策权要点**：D1（KP 是否引入新表）、D2（`prerequisites` 是否允许跨教材引用）、D3（`difficulty` 是数值还是 3 档枚举）。
5. **风险**：KP 切分一致性是最大未知数；建议先在 *物理高一第一册* 22 个叶子上做 pilot（约 80~120 KP），用双 LLM 投票 + 人工裁决校准 prompt。

---

## 1. 问题与约束

### 1.1 上游：教材索引现状

- `TextbookFullInfo.chapterTree` 是 N 叉树，叶子节点对应教材的"最末级标题"。
- 实际三本教材采样（来自 `data/textbook-trees`）：
  - 高中物理人教版必修第一册：22 叶子，典型如 `第三章 > 1.重力与弹力`、`第二章 > 4.自由落体运动`。
  - 小学数学人教版四年级上册：41 叶子，典型如 `1 大数的认识 > 亿以内数的读法和写法`、`3 角的度量 > 角的度量`。
  - 初中语文统编七年级下册：56 叶子，典型如 `第一单元 > 阅读 > 1 邓稼先`、`第二单元 > 写作 > 学习抒情`。
- 叶子的"教学体量"差异巨大：物理 `1.重力与弹力` 含 ≥3 个相对独立的知识（重力、弹力、胡克定律），数学 `角的度量` 是单一程序性技能，语文 `阅读 > 邓稼先` 则是一篇课文的多层目标（生字 + 内容理解 + 写作手法 + 价值观）。

**结论**：叶子作为索引锚点合理（与教材一一对应、有官方 `id`、与"国家课"资源 `chapter_ids` 互通），但**作为教学单元过粗**，下游决策无法直接落地到叶子。

### 1.2 下游：维度服务于谁

| 消费方 | 文件 | 需要的维度 |
|---|---|---|
| `CurriculumDesigner` | `packages/setup/src/curriculum-designer.ts` | `knowledgeType`（选 teachingMode）、`prerequisites`（决定 hasPriorScaffold）、`learningObjectives`（产出每段课的目标语句） |
| `AdaptiveController` | `packages/classroom/src/adaptive/controller.ts` | `difficulty`（IRT 参数 b 的先验）、`prerequisites`（remediation 路径）、`misconceptions`（错误归因） |
| 课后反思 | `packages/teacher-tools` | `assessability`（哪些 KP 可被作业题客观检测）、`examWeight`（v2，用于复习排序） |
| 教学模式选择 | `teaching-modes.ts` 已用 `goodForKnowledgeTypes` | `knowledgeType`、`representations`（v2，进一步收窄媒介） |

**关键判据**：一个维度如果没有任何下游消费者，删掉。

### 1.3 全局约束

- **语言/学科正交**：本体不能假设中文或某个学科。维度定义须能解释"语文写作"和"高中物理"。
- **打标可重复**：annotator 升级要能整体回标，因此 `Annotation<T>.annotatorVersion` 必须严肃维护。
- **长期工程**：用户已明确"教材会持续不断的分析"，本体设计要为 v2/v3 留扩展位，而不是一次性塞满。

---

## 2. 知识点的粒度与边界（问题 B）

### 2.1 粒度选项对比

| 选项 | 粒度 | 优点 | 致命缺点 |
|---|---|---|---|
| **S1：教材叶子=KP** | 9,106 | 索引天然存在；省事 | 叶子太粗，无法挂 prerequisites/misconceptions；teachingMode 在叶子级只能取众数 |
| **S2：学习目标=KP** | 估 20K~40K | 与 Bloom 目标对齐；适合做 IRT/前置图 | 切分需要 LLM，叶子内一致性依赖 prompt |
| **S3：概念原子=KP** | 估 80K+ | 极细，重组复用强 | 切到原子级在小学/语文反而失真（"邓稼先" 拆 30 个原子荒谬）；成本失控 |
| **S4：分层（叶子→KP→可选原子）** | 双层 9K + 30K | 叶子保留与教材/国家课的硬连接，KP 是教学单元，原子是 v2 可选下沉 | 引入新实体，需要新表；KP 与叶子映射需维护 |

**推荐 S4**。理由：
- 物理 `1.重力与弹力` 必须拆（重力 ≠ 弹力 ≠ 胡克定律，前置依赖不同），否则 `prerequisites` 维度退化。
- 语文 `邓稼先` 必须拆（生字属 factual、内容理解属 conceptual、写作手法属 procedural），否则 `knowledgeType` 退化为多值标签，下游决策失效。
- 数学 `角的度量` 多数情况下 1:1，不强行拆。
- 国家课资源 `relations` 与 `chapter_ids` 在叶子级建立，KP 与国家课的多对多映射靠"KP belongs to leaf"传递。

### 2.2 切分边界判据（三条可操作判据）

一个 KP 是"应当独立"的，当且仅当满足下列**至少两条**：

**B1 独立可评测**：可以为它单独命题（≥1 道题），且题目不必依赖叶子内的其他 KP。
- 例：`重力` 可单独考"重力方向"、"重力与质量关系"；`弹力` 可单独考"形变方向"。两者独立成 KP。

**B2 独立前置图**：它的前置依赖与叶子内邻居不同。
- 例：`胡克定律` 前置 = {弹力概念、正比关系}；`摩擦力` 前置 = {弹力概念、相对运动趋势}。前置集不同 → 必须分。

**B3 独立 teachingMode 选择**：按 §3.1 `knowledgeType` 它会落入不同的教学模式。
- 例：数学叶子 `角的度量` 内的"用量角器量角"（procedural）与"角的概念"（conceptual）分属不同 teachingMode → 分。
- 反例：语文 `邓稼先` 中"生字'锲'"和"生字'鲜为人知'"都是 factual + 同一 mode → **不分**，合并为一个 KP "本课生字词"。

### 2.3 三个真实例子

#### 例 1：物理叶子 `第三章 > 1.重力与弹力`

教材叶子 1 个 → **拆为 4 个 KP**：

```
KP-1  重力的大小与方向          (conceptual + factual)
KP-2  重心的位置与判定          (conceptual)
KP-3  弹力的产生条件与方向        (conceptual)
KP-4  胡克定律 F=kx           (procedural,有公式应用)
```
- 判据：B1（每个能独立出题）、B2（KP-4 前置依赖 KP-3 而非 KP-1）、B3（KP-4 适配 `lecture-diagram`，KP-1/2/3 适配 `lecture-image`/`socratic-dialogue`）。

#### 例 2：数学叶子 `3 角的度量 > 角的度量`

教材叶子 1 个 → **保持 1 个 KP**（或拆为 2）：

```
KP-1  角的度量（用量角器读数）   (procedural)
[可选 KP-2  度的单位与换算]      (factual)
```
- 判据：B3 否（同 mode）；B1 弱（"度的单位"很少单独命题）。**默认 1:1**，仅在 LLM 强烈信号下拆。

#### 例 3：语文叶子 `第一单元 > 阅读 > 1 邓稼先`

教材叶子 1 个 → **拆为 4 个 KP**：

```
KP-1  本课生字词与多音字            (factual)
KP-2  文章结构与主要内容            (conceptual)
KP-3  小标题式结构的表达效果         (procedural / analyze)
KP-4  人物精神与时代背景的关联        (metacognitive)
```
- 判据：B1 + B3 全部满足。这条最能说明"叶子=KP" 的破产：一篇课文若不拆，`knowledgeType` 只能写多标签或主类型，下游 teachingMode 无法稳定决策。

### 2.4 KP 与叶子的关系

- **关系**：叶子 ⟶ KP 是 **1:N**（典型 N=1~5，极端复杂的语文/历史叶子可达 8~10）。
- **反向**：一个 KP **不跨叶子**。这是 v1 的硬约束，简化 sync/version。
- **跨教材重复**：同一 KP 可能在多本教材重复出现（如"勾股定理"在初二和高中复习册各一次）。引入 `canonicalKey`（学科 + 标准化标题）做去重统计，但**不强制合并**。

### 2.5 Schema 建议（不是落地代码）

```ts
// 新增：KP 实体（位置建议：packages/textbook-index/src/kp-types.ts）

export type KnowledgePointId = string  // ulid

export interface KnowledgePoint {
  id: KnowledgePointId
  /** 必属一个教材叶子；不跨叶 */
  leafChapterId: string
  /** 在叶子内的展示顺序（教学顺序，0-based） */
  orderInLeaf: number

  /** 人读标题，如 "胡克定律 F=kx" */
  title: string
  /** 一段话定义，供 LLM 下游消费 */
  summary: string

  /** 跨教材去重键：subject + slug(title)；非主键 */
  canonicalKey?: string

  /** 六个维度的标注；都走 Annotation<T> 容器 */
  annotations: KnowledgePointAnnotations
}

export interface KnowledgePointAnnotations {
  knowledgeType?: Annotation<KnowledgeType>            // v1
  difficulty?: Annotation<DifficultyLevel>             // v1 (枚举见 §3.2)
  learningObjectives?: Annotation<LearningObjective[]> // v1
  prerequisites?: Annotation<KnowledgePointId[]>       // v1, 同教材内
  misconceptions?: Annotation<string[]>                // v1, 自由文本短句
  assessability?: Annotation<AssessabilityLevel>       // v1 (high/medium/low)

  // v2 占位
  estimatedMinutes?: Annotation<number>
  examWeight?: Annotation<number>
  representations?: Annotation<RepresentationKind[]>
  transferDistance?: Annotation<'near' | 'far'>
  crossSubjectLinks?: Annotation<string[]>
  emotionalLoad?: Annotation<'low' | 'medium' | 'high'>
}

export type DifficultyLevel = 'easy' | 'medium' | 'hard'

export interface LearningObjective {
  /** Bloom 修订版动词层级 */
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'
  /** 行为化目标语句，如 "能用胡克定律 F=kx 求弹簧形变" */
  statement: string
}

export type AssessabilityLevel = 'high' | 'medium' | 'low'

export type RepresentationKind =
  | 'text' | 'static-image' | 'diagram' | 'animation'
  | 'simulation' | 'physical-object' | 'manipulative' | 'audio'
```

注：`ChapterAnnotations`（叶子级）保留并简化为"叶子的众数/汇总"快照，不再承担 KP 任务。下游若只需要叶子粒度的粗信号（如目录树着色），读叶子；若需要决策，必须下钻到 KP。

### 2.6 打标顺序

**单遍策略（推荐）**：每个叶子 1 次 LLM 调用，prompt 同时产出：
1. KP 切分（含 title / summary / orderInLeaf）。
2. 每个 KP 的六维标注。
3. 切分判据的简短理由（写入 `Annotation.reasoning`）。

理由：
- 切分与标注在同一上下文里更一致（避免"先切了再标，标的时候发现切错"）。
- 节省 token：避免叶子文本被加载两次。
- 缺点：一次 prompt 偏长，需要 GPT-4 级模型；置信度报告需要 prompt 强约束。

**反例（不推荐）**：先在叶子级粗标 `knowledgeType` 再细化到 KP——这会出现叶子标 conceptual 但 KP 实际有 procedural 的逻辑死锁。

---

## 3. 知识维度清单（问题 A）

每个维度按 7 项审视：**定义 / 取值 / 为什么必要 / 如何获取 / 打标可行性 / 删掉会怎样 / v1 还是 v2**。

### 3.1 knowledgeType（v1 · 已落地）

- **定义**：Anderson & Krathwohl (2001) 修订版布鲁姆"知识维度"四类之一。
- **取值**：`factual | conceptual | procedural | metacognitive`。
- **必要性**：`resolveTeachingMode()` 的输入；teaching-modes 注册表的 `goodForKnowledgeTypes` 直接消费。
- **获取**：LLM 单调即可（已在 `phase-a-implementation-plan.md` 验证）。
- **可行性**：高。叶子级 pilot 准确率 >85%（来自现有标注样本）。
- **删掉会怎样**：teachingMode 选择失去主输入，退回随机或人工——不可接受。
- **结论**：v1 必入。

### 3.2 difficulty（v1）

- **定义**：典型学习者掌握该 KP 的难度。
- **取值**：`easy | medium | hard` 枚举（**不要 0~1 数值**，理由见下）。
- **必要性**：IRT 难度参数 b 的先验；课中"是否跳过/补救"的阈值。
- **获取**：LLM 标，但需要"参照学段"——同一个 KP 在小学高年级是 hard，在初中是 easy。Prompt 必须固定"按教材所属学段评估"。
- **可行性**：中。LLM 跨学段一致性差，建议 v1 仅在 3 档枚举上要求一致性，不追求数值精度。
- **删掉会怎样**：AdaptiveController 退化为均匀难度推送，差异化教学失效。
- **为什么不用 0~1 数值**：标注一致性差（不同 LLM 给 0.62 vs 0.71 没意义）、下游消费方实际只需"高/中/低"分支、可后续在课中用 IRT 用户响应反馈估出真实 b。
- **结论**：v1 必入，枚举。

### 3.3 learningObjectives（v1）

- **定义**：该 KP 学完后学生能做什么，按 Bloom 修订版动词分类。
- **取值**：`LearningObjective[]`，每项含 `bloomLevel` + 行为化 `statement`。
- **必要性**：备课层产出每段课的"目标"语句；课后反思层判断"是否达成"。
- **获取**：LLM 标，prompt 强制行为化动词（"能…"、"会…"、"能解释…"）。
- **可行性**：高。但要警惕 LLM 产出空话目标（"理解重力"）——prompt 要求每条目标必须可被一道题验证。
- **删掉会怎样**：备课层只能用 KP 标题做目标，CurriculumDesigner 失去 sub-step 切分依据；课后反思无法对齐目标。
- **结论**：v1 必入。与 `assessability` 形成校验闭环（每个 high assessability 的 KP 至少有一个 apply/analyze 级目标）。

### 3.4 prerequisites（v1，但限制范围）

- **定义**：掌握该 KP 之前必须先掌握的 KP 列表。
- **取值**：`KnowledgePointId[]`，**v1 限制同教材内**（跨教材见 D2）。
- **必要性**：AdaptiveController 的 remediation；CurriculumDesigner 的 `hasPriorScaffold` 判断。
- **获取**：LLM 标，给定"本教材已出现的 KP 候选集"做选择。
- **可行性**：中-高。LLM 容易过拟合"父叶子内的所有兄弟"。Prompt 要求"列出 ≤3 个最关键的"；二次 LLM 复检过滤。
- **删掉会怎样**：失去前置图，差异化与补救退化为"看题做不出就跳"。
- **结论**：v1 入；v1.5 引入"跨教材引用"（先把同学段相邻教材建立 canonicalKey 索引）。

### 3.5 misconceptions（v1）

- **定义**：学习者在该 KP 上常见的错误观念/易混点。
- **取值**：`string[]`，每条一句话短句。
- **必要性**：课中"错误归因"——当学生答错，能映射到具体错误观念而不是简单"答错";课后反思的高价值输入。
- **获取**：LLM 标。LLM 在主流学科（物理、数学）的常见 misconception 知识较好；冷门学科需要老师人工补。
- **可行性**：中。容易"凑数"——prompt 要求每条 misconception 必须能写成一道选择题的干扰项。
- **删掉会怎样**：错误归因退化为题号对错统计；课后反思价值大幅降低。
- **结论**：v1 入，但允许为空数组（`[]`），不强制每个 KP 都有。

### 3.6 assessability（v1）

- **定义**：该 KP 能否通过客观题（选择/填空/计算）被检测。
- **取值**：`high | medium | low`。
- **必要性**：决定"课中即时检测"是否上 quiz mode；课后作业题挑选优先级。
- **获取**：LLM 标，但本质是简单规则可推断（procedural + apply 级目标 → 通常 high；metacognitive + evaluate 级 → 通常 low）。
- **可行性**：高。
- **删掉会怎样**：可推断（用 `knowledgeType` + `learningObjectives` 计算）。
- **为什么仍入 v1**：避免下游每次重新计算；同时 LLM 显式标比规则推断更准（语文阅读题的 assessability 与单纯按 Bloom 推断有偏差）。
- **结论**：v1 入。

### 3.7 estimatedMinutes（v2）

- **定义**：典型学习者在该 KP 上需要的有效学习时长（分钟）。
- **取值**：数值。
- **必要性**：备课层做总时长校验；自学情境下分层呈现（首学 vs 复习）。
- **删掉会怎样**：备课层用"每 KP 默认 N 分钟"占位，损失中等。
- **打标可行性**：低。LLM 估时长跨学段跨学生差异极大，没有 ground truth。
- **建议**：v2。先在课中用真实学习时长回流估，而非 LLM 标。

### 3.8 examWeight（v2）

- **定义**：在所属学段考试中的考点权重。
- **取值**：0~1。
- **必要性**：课后复习排序、毕业冲刺规划。
- **打标可行性**：极低。LLM 没有真实考试统计数据，估出来不可信。
- **建议**：v2，并改为基于真实题库统计（按 KP 在历年真题中出现频次估）。

### 3.9 representations（v2）

- **定义**：适合该 KP 的媒介表征类型。
- **取值**：`RepresentationKind[]`（见 schema）。
- **必要性**：进一步收窄 teachingMode 选择（同一个 conceptual KP，有的适合动画，有的适合实物操作）。
- **删掉会怎样**：仍可工作——`knowledgeType` 已经把媒介收窄到 3~4 个候选。
- **建议**：v2。v1 用 teaching-modes 的 `goodForKnowledgeTypes` 就够。

### 3.10 transferDistance（v2）

- **定义**：该 KP 的应用是近迁移（情境相似）还是远迁移（跨域）。
- **取值**：`near | far`。
- **必要性**：决定课中的练习设计——远迁移需要变式；近迁移需要重复。
- **建议**：v2 占位。v1 用 `learningObjectives` 的 Bloom 层级近似（apply 多为 near，create/evaluate 多为 far）。

### 3.11 crossSubjectLinks（v2）

- **定义**：跨学科关联的 KP 引用。
- **必要性**：项目式学习、综合实践活动课。
- **打标可行性**：低（需要全库 KP 已存在）。
- **建议**：v2。等所有教材打标完成后做一次全库 reindex 才有意义。

### 3.12 emotionalLoad（v2 占位，但保留质疑）

- **定义**：学习者面对该 KP 的典型情绪负担（畏难/趣味）。
- **必要性**：影响首段课的引入策略（畏难 KP 多给生活情境）。
- **删掉会怎样**：备课层用"全部一视同仁"的引入，损失小。
- **打标可行性**：低，主观性强。
- **建议**：v2，且要审视"是不是该删掉"。如果 v2 真要做，建议从用户行为（停留、回看）反推，而非 LLM 标。

### 3.13 维度推荐清单总结

| 维度 | v1 | v2 | 删除候选 |
|---|---|---|---|
| knowledgeType | ✅ | | |
| difficulty | ✅（枚举） | | |
| learningObjectives | ✅ | | |
| prerequisites | ✅（同教材内） | 跨教材 | |
| misconceptions | ✅（可空） | | |
| assessability | ✅ | | |
| estimatedMinutes | | ✅（学情回流） | |
| examWeight | | ✅（题库统计） | |
| representations | | ✅ | |
| transferDistance | | ✅ | |
| crossSubjectLinks | | ✅（全库 reindex） | |
| emotionalLoad | | ⚠️ 占位 | ✅（候选） |

---

## 4. v1 推进计划（问题 C）

### 4.1 v1 范围

- **粒度**：双层（叶子 + KP）。引入 `KnowledgePoint` 实体。
- **维度**：上表 6 个 v1 维度。
- **学科子集**（建议优先级）：
  1. **Pilot**：高中物理人教版必修第一册（22 叶子，预计 80~120 KP）——结构清晰、KP 切分需求强、misconceptions 资料丰富。
  2. **Wave 1**：高中数学 + 初中物理 + 初中数学（≈80 本教材，估 7K KP）。
  3. **Wave 2**：小学数学 + 语文（≈120 本，估 12K KP）。语文需要单独的 prompt 模板（KP 切分逻辑与理科不同）。
  4. **Wave 3**：其余学科（生物、化学、地理、历史、政治、英语）。
- **不打标的学科**（v1 阶段）：艺术、体育——教材结构与"知识点"概念错位，单独研究。

### 4.2 打标管线（与 `textbook-labeling-pipeline.md` 对齐）

```
for each leaf in textbook:
  → LLM call (single prompt):
      input: leaf.title + leaf.path + textbook.subject + textbook.grade + leaf 内附带文本（若有）
      output:
        - kps: [{title, summary, orderInLeaf}]
        - for each kp: {knowledgeType, difficulty, learningObjectives, prerequisites(候选), misconceptions, assessability, reasoning}
  → 二次 LLM 校验（不同模型）：仅校验 knowledgeType + prerequisites
  → 写入 DB（如分歧 → 标 needs-human-review）
人工抽检 5% + 高分歧 100%
```

### 4.3 v1 → v2 演进

- v1 跑通 Pilot 后：评估 KP 切分一致性（双 LLM 一致率目标 ≥80%，叶子内 KP 数量差 ≤1）。
- 通过后扩 Wave 1。
- 课堂上线 1 个月后：用真实学情回流校准 `difficulty` → 进入 v1.1。
- 三个月后：根据课后反思价值，决定 `representations`、`transferDistance` 是否进 v2。
- 半年后：全库 reindex 生成 `crossSubjectLinks` + `canonicalKey` 去重统计。

---

## 5. 待用户决策

| ID | 议题 | 选项 | 我的倾向 |
|---|---|---|---|
| **D1** | KP 是否引入新表/新实体？还是把 KP 数组塞进 `ChapterNode.annotations.knowledgePoints`？ | A 新实体 `KnowledgePoint` + 关联表；B 内嵌在叶子节点 | **A**。理由：KP 跨教材去重、Adaptive 引用稳定 id 都需要独立实体；内嵌会让叶子 JSON 膨胀难以版本化。但 A 要新 schema，落地成本更高。 |
| **D2** | `prerequisites` 是否允许 v1 跨教材引用？ | A 仅同教材；B 同学段相邻教材也可；C 全库 | **A**。理由：v1 跨教材 LLM 需要"候选集"过大、不可控。v1.5 再开放跨教材，前提是 `canonicalKey` 已建。 |
| **D3** | `difficulty` 用 3 档枚举还是 0~1 数值？ | A 枚举；B 数值；C 都存（LLM 给数值，规则映射到枚举） | **A**。理由见 §3.2。C 看似两全其实增加一致性维护成本。 |
| **D4** | KP 切分由 LLM 一次产出还是先人工定义 KP 字典再让 LLM 对齐？ | A 全 LLM；B 重点学科建字典再对齐 | **A**（v1）。理由：成本 + 学科覆盖速度。但 Pilot 后若一致性 <80%，应转为 B（至少对物理/数学建字典）。 |
| **D5** | `emotionalLoad` 留还是删？ | A 删；B 占位到 v2 | **A 删**。打标不可行 + 下游可用情境引入策略替代。若用户认为对自学场景重要再加回。 |
| **D6** | v1 是否打 `misconceptions`？还是直接放 v2（避免 LLM 凑数）？ | A v1 打；B v2 | **A**（v1 打，允许空数组）。理由：课后反思需求迫切；用"必须能成为选择题干扰项"作为 prompt 硬约束控制凑数。 |

---

## 6. 风险与未决

### 6.1 主要风险

1. **KP 切分一致性**：同一叶子在两次 LLM 调用下切出的 KP 数量/边界不同。
   - 缓解：固定 seed + temperature=0 + prompt 给 3~5 个切分示例 few-shot；Pilot 阶段双 LLM 投票。
2. **学科覆盖不均**：物理/数学 prompt 易写，语文/历史的"KP"概念模糊。
   - 缓解：为文科单独写 prompt 模板，明确区分"知识 KP"和"能力 KP"（如"概括文章主旨"是能力 KP）。
3. **`prerequisites` 形成环**：LLM 标错导致依赖图有环，AdaptiveController 死锁。
   - 缓解：写入时做 DAG 检测，发现环直接 reject 该字段进入 needs-human-review。
4. **打标版本变更回标成本**：升级 prompt 后 9K+ KP 重标 LLM 费用估算 USD ≈ ?
   - 缓解：`annotatorVersion` 严格 bump；只重标受影响维度，不重切 KP。

### 6.2 已知未决（不需要 v1 决策）

- KP 与课程标准（如"普通高中物理课程标准 2017 版"）的映射：v2 接入官方课标后做。
- KP 与中高考真题题库的关联：依赖第三方题库授权，时间未定。
- 跨语言/跨国教材的本体一致性：海外扩展时再议；当前 schema 设计已留 `canonicalKey`，便于未来按学科语义对齐。

---

## 附录 A：术语对照

| 术语 | 定义 | 来源 |
|---|---|---|
| Chapter Leaf（章节叶子） | 教材树的最末级节点 | 当前 `ChapterNode.child_nodes` 为空的节点 |
| Knowledge Point（KP，知识点） | 教学最小单元；属于一个叶子；可独立教、学、评 | 本文档引入 |
| Knowledge Type | Anderson & Krathwohl (2001) 修订版四类知识维度 | factual / conceptual / procedural / metacognitive |
| Bloom Level | Bloom 修订版认知过程维度 | remember / understand / apply / analyze / evaluate / create |
| Annotation | 标注通用包装，含 source/confidence/version | `tree-types.ts:28` |
| Annotator | 一个生产某维度 Annotation 的模块 | 如 `knowledge-type` annotator |
| canonicalKey | 跨教材去重键，`subject + slug(title)` | 本文档引入 |

## 附录 B：参考

- Anderson, L. W., & Krathwohl, D. R. (Eds.). (2001). *A taxonomy for learning, teaching, and assessing: A revision of Bloom's taxonomy of educational objectives*. Longman.
- Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. *Educational Psychologist*, 38(1), 23-31.
- 项目内部：`docs/pedagogy-v2-paper.md`、`docs/textbook-labeling-pipeline.md`、`docs/phase-a-implementation-plan.md`。
