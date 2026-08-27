# 知识本体 v1.1 · 多来源 + 跨课程体系延展

> 状态：草案 · 待用户审议
> 日期：2026-05-24
> 作者：本体设计师（自动起草）
> 前置：`docs/knowledge-ontology-v1.md`
> 关联代码：`packages/classroom/src/adaptive/controller.ts`、`packages/textbook-index/src/tree-types.ts`、`packages/shared-types/src/teaching-modes.ts`

---

## 0. TL;DR

1. **v1 的"KnowledgePoint"被拆成两层：`KnowledgePointCluster`（跨课程体系的同概念簇）+ `KnowledgePoint`（某一课程体系内的具体表达）**。v1 文档里所称 "KP" 在 v1.1 体系下**精确对应 KP 本身**（仍属于单一教材/单一课程体系），而 cluster 是新增的更上一层抽象。
2. **教材叶子不再内嵌 KP**，而是**引用** KP id 数组（`knowledgePointIds: string[]`）。KP 表独立存在，可被多教材、多体系引用，承载 `provenance`。
3. **学生掌握度（mastery）从今往后绑 `clusterId`**，而非具体 KP id。换教材体系（如中→日）时，学情通过 cluster 续延。`AdaptiveController` 的 `masteryMap` 语义重定义：键空间 = clusterId（旧代码字段名 `conceptId` 暂时复用，等迁移完成后改名）。
4. **provenance 推荐用"内容哈希 + UUID + aliases"混合**：内部主键用 ULID（稳定、可生成、可排序），稳定语义键用 `canonicalHash = sha1(subject + grade_band + canonicalName_normalized)`，外部别名走 `aliases[]`。
5. **新增 5 个 v1.1 决策点 D1.1~D1.5**，最该先拍的是 **D1.4（Pilot 阶段是否同步建 cluster）**——它直接决定后续半年的迁移路径是不是要补一次大规模回填。

---

## 1. 新增约束的来源与含义

### 1.1 用户硬约束（原话）

> "D1 以后可能来源广泛甚至被替换（假设我们改服务日本的教材）"

这条约束在 v1 里没有被讨论。v1 假定 KP 来自"中国人教/统编/沪教等若干官方教材"，结构上把 KP 视为**教材叶子内的子结构**。这个假设在以下两种场景下会破：

- **场景 A · 来源扩展**：同一中国教材体系下，KP 不再只来自 LLM 自动抽取，还会来自老师手工补、外部知识图谱（如学科课标库）、教研协作平台导入。
- **场景 B · 体系替换**：产品落地日本市场时，整套底层教材换成日本文部省检定教材；落地美国市场时换成 NGSS/Common Core 体系。如果学情绑在"中国教材的 KP id"上，所有历史学情作废。

### 1.2 v1.1 的设计目标

| 目标 | 含义 |
|---|---|
| **多来源可追溯** | 每个 KP 必须能说清"它从哪来"——来自哪本教材、哪次 LLM 调用、哪位老师确认。 |
| **可替换** | 整套课程体系（教材集合）能被替换，不污染上层学情/能力模型。 |
| **跨体系对齐** | 中国"勾股定理"和日本"ピタゴラスの定理"能在同一 cluster 下对接；学生在 A 体系下学过的内容，到 B 体系自动识别。 |
| **不破坏 v1** | v1 已设计的 6 维标注、双层粒度、Pilot 计划继续有效；v1.1 只在"上方加一层 cluster + 下方加 provenance 字段"。 |

### 1.3 v1.1 并未改变的事情

- 教材叶子仍是索引锚点，与教材一一对应。
- 6 维标注（knowledgeType / difficulty / learningObjectives / prerequisites / misconceptions / assessability）继续存在。
- KP 仍然"不跨叶子"——一个 KP 只属于一个叶子，跨教材的概念关系靠 cluster 承载。

---

## 2. 三层 ER：Cluster ↔ KP ↔ 教材叶子

### 2.1 概念定义

| 层 | 实体 | 唯一性 | 跨度 |
|---|---|---|---|
| 1（顶层抽象） | `KnowledgePointCluster` | 全局唯一 | 跨语言、跨课程体系、跨教材 |
| 2（课程体系内具体表达） | `KnowledgePoint` | 一个 cluster 下，每个 curriculum-system 至多一个 KP | 单一 curriculum-system（如"中-人教"） |
| 3（教材实际承载） | `ChapterNode`（教材叶子） | 教材内唯一 | 单一教材版本 |

### 2.2 ER 图（ASCII）

```
KnowledgePointCluster (1) ────< KnowledgePoint (N)
        │                            │
        │                            │  (KP 属于一个 curriculum-system)
        │                            ▼
        │                       CurriculumSystem (e.g. pep-中国人教)
        │
        └─ 学生学情 (student_responses.knowledgePointClusterId) ◀── AdaptiveController.masteryMap

KnowledgePoint (1) ────< ChapterNode 引用 (M)
        ▲                            │
        │ (knowledgePointIds: string[])
        │                            │
ChapterNode (教材叶子) ──────────────┘
```

关键箭头：

- **教材叶子 → KP**：叶子持 `knowledgePointIds: string[]`，**引用方向是叶子指向 KP**。这与 v1 的内嵌方向相反，是 v1.1 的关键改动。
- **KP → Cluster**：KP 持 `clusterId: string`，每个 KP 必须归属一个 cluster（cluster 可以单成员，即孤立 KP）。
- **学情 → Cluster**：`student_responses.knowledgePointClusterId` 是主，`knowledgePointId` 是冗余记录（用于排错与 audit）。

### 2.3 三个真实跨体系例子

#### 例 1 · 数学："勾股定理"

| 课程体系 | KP canonicalName | KP 所属叶子（示例） |
|---|---|---|
| pep-中国人教（八年级下） | 勾股定理 | 第十七章 > 17.1 勾股定理 |
| kokutei-日本文部省（中学三年生） | ピタゴラスの定理 / 三平方の定理 | 第3章 > 3.1 三平方の定理 |
| ccss-美国 Common Core（Grade 8） | Pythagorean theorem | Geometry > 8.G.B.6 |

→ **1 个 cluster，3 个 KP**。Cluster 的 `canonicalNameEn = "Pythagorean theorem"`，`aliases = ["勾股定理", "ピタゴラスの定理", "三平方の定理"]`。三个 KP 的 difficulty / misconceptions 可以略有不同（中：常见错记 a²+b²=c 而非 c²；日：与"相似三角形"绑得更紧；美：与坐标几何距离公式同节）。

#### 例 2 · 物理："牛顿第二定律"

| 课程体系 | KP canonicalName |
|---|---|
| pep-中国人教（高中物理必修一） | 牛顿第二定律 F=ma |
| kokutei-日本（高校物理基础） | ニュートンの運動方程式 ma=F |
| ngss-美国 NGSS（HS-PS2-1） | Newton's second law |

→ **1 个 cluster，3 个 KP**。注意中日 KP 在公式写法与变量名习惯上略有差异，但概念同。

#### 例 3（反例）· 语文："邓稼先"

| 课程体系 | KP |
|---|---|
| 统编-中国语文（七下） | 课文《邓稼先》的内容理解、结构、人物精神 |
| 日本国语 | （无对应概念） |
| 美国 ELA | （无对应概念） |

→ **1 个 cluster，1 个 KP（仅中文体系）**。本国典籍/本国历史/特定文化文本天然不跨体系。cluster 退化为"单成员簇"。这种 cluster 占语文/历史/思政的多数。v1.1 不强求 cluster 必须跨语言，**单成员 cluster 是合法常态**。

> 推论：cluster 的价值密度在**理科 > 文科**。在物理/数学/化学/生物中预期 60%+ 的 KP 能跨体系成簇；语文/历史/思政预期 <10%。这影响 Pilot 阶段的优先级（见 §5）。

### 2.4 建立 cluster 的来源与成本

| 来源 | 成本 | 可靠度 | 适用面 |
|---|---|---|---|
| **人工对齐**（学科专家拍板） | 高 | 高 | 理科核心概念（数物化生），约 5K~10K cluster |
| **LLM 跨语言对齐**（GPT-4 级 + 双语 prompt） | 中 | 中（需人工 verify） | 大规模初稿，先建草案 |
| **双语术语词表**（如 IEC、IUPAC、ISO 学科术语库） | 低 | 高（但覆盖窄） | 物理化学单位、生物分类、数学符号 |
| **用户/教研员手工合并**（运营后台 merge UI） | 中 | 高 | 长尾、产品上线后增量 |

**推荐路径**：LLM 出初稿 → 双语词表交叉验证（理科）→ 学科专家最终 verify。语文/历史等本国文化内容默认单成员簇，不进 LLM 对齐流程，避免凑数。

---

## 3. Provenance 设计

### 3.1 `KnowledgePointSource` 取值空间

```ts
type KnowledgePointSource =
  | 'pep-cn'          // 中国人教版
  | 'tongbian-cn'     // 中国统编
  | 'huji-cn'         // 中国沪教
  | 'kokutei-jp'      // 日本文部省检定
  | 'ccss-us'         // 美国 Common Core
  | 'ngss-us'         // 美国 NGSS
  | 'cambridge-uk'    // 英国剑桥
  | 'ib'              // 国际文凭
  | 'manual'          // 教师/教研员手工录入
  | 'llm-extracted'   // LLM 抽取
  | 'external-kg'     // 外部知识图谱（学科课标库等）
```

设计原则：**source 标识"内容来自哪个权威体系或抽取方式"**，而 curriculum-system 标识"这个 KP 属于哪个课程体系"。两者**通常一致但不必然**——例如一个 KP 内容来自 `llm-extracted`，但被人工归入 `pep-cn` 课程体系；再如来自 `external-kg` 的 KP 可能被同时引入多个课程体系（少见）。

### 3.2 多来源证据：`sourceRefs[]`

同一 KP 可被多个权威来源支持，每个支持记录为一条 `SourceRef`：

```ts
interface SourceRef {
  source: KnowledgePointSource
  /** 该来源内的稳定 ID（教材 chapterId、外部知识图谱 URI、LLM 调用 trace id） */
  externalId?: string
  /** 该来源给出的证据原文摘要（用于审计） */
  evidenceSnippet?: string
  /** 录入时间 */
  ingestedAt: string  // ISO datetime
  /** 该来源对此 KP 的置信度 */
  confidence?: number  // 0..1
}
```

例：某物理 KP "胡克定律 F=kx"，`sourceRefs = [人教版必修一 sec 3.1, llm-extracted gpt-4 trace #abc, manual teacher@xxx verified]`。

### 3.3 稳定 id 策略（推荐：UUID + canonicalHash + aliases）

**三种方案对比：**

| 方案 | 优点 | 缺点 |
|---|---|---|
| **A · 纯 ULID/UUID** | 简单、生成廉价、可排序 | 同概念在不同入库会得到不同 id，去重靠 cluster |
| **B · 内容哈希**（`hash(canonicalName + subject + grade_band)`） | 同概念天然同 id；幂等入库 | 改名/规范化算法升级会换 id；冲突需要解决；多语言导致同 cluster 不同语言 KP 必拿不同 hash |
| **C · UUID 主键 + canonicalHash 索引 + aliases** | id 稳定不变；同概念可被 hash/alias 检测；改名只更新 canonicalName，id 不动 | schema 字段更多 |

**推荐 C**。具体：

- `KnowledgePoint.id`：ULID（主键，永久不变）
- `KnowledgePoint.canonicalHash`：`sha1(curriculumSystem + ":" + subject + ":" + gradeBand + ":" + normalize(canonicalName))`。**用于幂等入库**——LLM 再次抽出同概念时，先按 canonicalHash 查重，命中则 update sourceRefs，不新建。
- `KnowledgePoint.aliases[]`：包含此概念在该体系内的所有曾用名（用于搜索、回填、变更追溯）。
- `KnowledgePointCluster.id`：ULID。
- `KnowledgePointCluster.canonicalNameEn`：跨体系规范名（英文优先，便于全球对齐）。

注意 cluster id 不用 hash，因为 cluster 的成员构成会变化（运营增删 KP），hash 不稳定。

---

## 4. 学生掌握度绑 Cluster（决策 B 落地）

### 4.1 学情表 schema 改动

**新表 `student_responses` 关键字段：**

```ts
interface StudentResponse {
  id: string
  studentId: string
  sessionId: string
  /** v1.1 主字段：clusterId 是学情的稳定锚点 */
  knowledgePointClusterId: string
  /** 冗余记录：本次响应对应的具体 KP（用于审计/排错） */
  knowledgePointId: string
  /** 本次响应时所处的课程体系，用于跨体系迁移追溯 */
  curriculumSystem: string
  /** 响应数据：是否正确、用时、错误归因到的 misconception 等 */
  isCorrect: boolean
  responseMs: number
  misconceptionTagged?: string
  createdAt: string
}
```

**`AdaptiveController.masteryMap` 语义重定义**（代码层）：

- 现状（v1，见 `controller.ts:30`）：`masteryMap: Record<string, number>`，键是 "conceptId"。`conceptId` 取自 `SlideContent.conceptIds` 与 quiz `question.concepts`。
- v1.1：键空间正式定义为 `clusterId`。**短期不改字段名**（保留 `conceptId` 字符串，避免大面积重构），但语义文档化为 cluster。等所有上游数据源（slide / quiz）都吐 clusterId 之后，再统一改名为 `clusterId`。
- `setMastery(conceptId, value)` / `suggestRemediation(conceptIds)`：参数 `conceptId` 在 v1.1 文档里等价于 `clusterId`。新增接口 `setMasteryByCluster(clusterId, value)` 作为正式 API（与旧 API 同义，仅命名更清晰）。

### 4.2 跨教材体系切换 step-by-step

**场景**：学生 Alice 在"中文 / pep-cn / 八年级下数学"学过勾股定理，掌握度 0.78。教师把她的班级整体切换到"日文 / kokutei-jp / 中学 3 年生数学"。

1. **切换前**：`masteryMap` 含 `{ "cluster-pythagoras-uuid": 0.78, "cluster-real-numbers-uuid": 0.62, ... }`。`student_responses` 历史记录的 `knowledgePointClusterId = cluster-pythagoras-uuid`，`knowledgePointId = kp-pep-勾股定理-id`，`curriculumSystem = pep-cn`。
2. **切换动作**：教师/管理员在后台把 Alice 的"当前 curriculum-system"从 `pep-cn` 改为 `kokutei-jp`。**学情不动**——masteryMap 完全不变。
3. **新课堂开课**：CurriculumDesigner 拉取 kokutei-jp 教材叶子，叶子的 `knowledgePointIds` 指向 `kp-jp-三平方の定理-id`。
4. **课堂渲染**：备课层把 KP 转成 slide 时，**slide.conceptIds 不再放 kp id，而是放 cluster id**（这是 v1.1 的硬约束，见 §4.4）。
5. **AdaptiveController 调用 `shouldSkip(scene)`**：scene 的 conceptIds 含 `cluster-pythagoras-uuid`，masteryMap 命中 0.78（≥ 0.85 阈值则跳过，否则继续）。**学情自动续延，未经任何回填**。
6. **新的 student_responses**：写入时 `clusterId = cluster-pythagoras-uuid`（同 Alice 在中文体系下学时的 clusterId），`knowledgePointId = kp-jp-三平方の定理-id`，`curriculumSystem = kokutei-jp`。后续审计可看到 Alice 在两个体系下都学过此 cluster。

### 4.3 边界：cluster 内 KP 的非对称难度

**问题**：同一 cluster 下，pep-cn 的 KP 难度评估为 medium，kokutei-jp 的 KP 难度评估为 hard（例如日本体系强调更深的几何推导）。Alice 在 pep-cn 拿到 0.78 mastery，切到 kokutei-jp 后这个分数还代表"接近掌握"吗？

**v1.1 处理方案：**

1. mastery 数值**不做难度归一化**，保持原值（不损失信息）。
2. AdaptiveController 在调用 `shouldSkip` 时引入新逻辑（v1.1 新增）：若当前 KP 的 difficulty 比"该 cluster 上历史响应平均 difficulty"高 ≥1 档，**临时把 MASTERY_THRESHOLD 提高 0.1**（从 0.85 → 0.95）。Alice 0.78 → 不跳过，仍要走一遍内容。
3. 反向：若难度更低，阈值降低 0.05 但不低于 0.7。
4. 这条规则的目的：cluster 续延学情，但下游对"难度不对称"有补偿措施，避免误判跳过。

### 4.4 `AdaptiveController` 接口改动

**先确认现状**（来自 `packages/classroom/src/adaptive/controller.ts`）：

- `masteryMap: Record<string, number>`，键是 `conceptId`（来自 SlideContent.conceptIds、quiz question.concepts）。
- 旧"conceptId"的实际所指：**目前是 KP id（或更早的、未严格定义的"概念字符串"）**——这是 v1.1 要修正的语义。**conceptId 在 v1.1 中正式等价于 clusterId**。

**改动清单**：

| 接口 | v1（现状） | v1.1 |
|---|---|---|
| `setMastery(conceptId, value)` | 键空间未定义 | 键空间 = clusterId；保留方法名兼容 |
| `recordQuizResult(scene, result)` | 用 `result.conceptsCovered` | `result.conceptsCovered` 改为返回 clusterId 数组（由 quiz/grader 转换） |
| `shouldSkip(scene)` | 用 `scene.content.conceptIds` | 同字段名，语义为 clusterId 数组 |
| `suggestRemediation(conceptIds)` | 同上 | 同上 |
| `extractConceptIds(scene)` | 返回 string[] | 返回 clusterId[]，由 slide 渲染层保证 |

**结论**：现有代码不必立即改类型签名（字符串就是字符串）。**改的是语义契约和文档**。在 Pilot 阶段同步加：
- `extractConceptIds` 输出添加运行时断言："每个 id 必须是合法 clusterId 格式"。
- slide / quiz 内容生成层确保填的是 clusterId。

---

## 5. v1 → v1.1 diff（含维度归属表）

### 5.1 v1 中的"KnowledgePoint" 对应 v1.1 哪一层？

**v1 §2 的 KP = v1.1 的 KP**（不是 cluster）。

理由：
- v1 KP "属于一个叶子、不跨叶子" → 与 v1.1 KP 一致（KP 属于 curriculum-system 内的叶子）。
- v1 KP 持 `prerequisites: KnowledgePointId[]`（同教材内引用）→ v1.1 KP 同此约束。
- v1 KP 的 `canonicalKey = subject + slug(title)` 是去重统计键 → **这正是 v1.1 cluster 的雏形**。v1.1 把 canonicalKey 升级为正式的 cluster 实体。

可以认为：**v1 的 canonicalKey 在 v1.1 实体化为 KnowledgePointCluster**。

### 5.2 6 维标注的归属层（cluster vs KP）

| 维度 | 挂 cluster | 挂 KP | 同时挂 | 理由 |
|---|---|---|---|---|
| `knowledgeType` | | ✅ | | 不同体系对同概念的"知识类型"判定可能不同（中：胡克定律重 procedural；美：可能更偏 conceptual）。挂 KP 更保守。 |
| `difficulty` | | ✅ | | 显然依赖学段与体系。 |
| `learningObjectives` | | ✅ | | 不同体系的课标行为动词不同；中国强调"会用"，IB 强调"evaluate"。 |
| `prerequisites` | | ✅ | | v1 已约束"同教材内引用"，v1.1 保持。**跨体系前置图未来由 cluster.prerequisitesClusterIds 表达，但 v1.1 不强制**。 |
| `misconceptions` | ✅（主） | ✅（补） | ✅ | 大量 misconception 跨体系相同（"勾股定理只用于直角三角形"是普遍误解）。挂 cluster，KP 可追加本体系特有 misconception。 |
| `assessability` | ✅（主） | | | 是否可客观题检测，主要由概念本身决定，不太依赖体系。 |

**新增维度（v1.1 cluster 层）：**

- `cluster.canonicalNameEn`（英文规范名，强制）
- `cluster.aliases`（多语言别名，强制）
- `cluster.crossSystemNotes`（体系间差异说明，可选）

### 5.3 v1 Pilot 计划的更新

v1 §4.1 Pilot：高中物理人教版必修第一册（22 叶子 → 80~120 KP）。

**v1.1 更新后的执行顺序：**

1. **Step 1（同 v1）**：先建 KP——单 LLM 调用 per 叶子，产出 KP + 6 维。**此时 KP 的 clusterId 字段先留空**或写入临时占位簇。
2. **Step 2（v1.1 新增）**：Pilot 范围内 KP 全部建完后，跑一次 cluster 对齐：
   - 由于 Pilot 只有 pep-cn 物理一本书，cluster 暂时是"1 cluster = 1 KP"的单成员簇。
   - 把每个 KP 的 `canonicalKey` 升格为 cluster id（生成 ULID + 写入 cluster 表）。
   - 这一步几乎零成本，但建立了后续接日本/美国教材时的对接点。
3. **Step 3**：当第二个课程体系（如 kokutei-jp 高校物理）入库时，跑跨体系 cluster 合并：
   - LLM 出对齐草案（"日本'ニュートンの第二法則' ↔ 中国'牛顿第二定律'"）。
   - 学科专家 verify。
   - 合并：删除日本侧的临时 cluster，把 KP.clusterId 指向中国侧已有的 cluster。

**关键**：Pilot 阶段是否同步建 cluster，决定后续要不要回填 student_responses（见 D1.4）。

---

## 6. TypeScript schema 草案（仅文档）

```ts
// ────────────────────────────────────────────────────────────────
// 1. Cluster：跨课程体系的同概念簇
// ────────────────────────────────────────────────────────────────

export type KnowledgePointClusterId = string  // ULID

export interface KnowledgePointCluster {
  id: KnowledgePointClusterId
  /** 跨体系规范名，强制英文（便于全球对齐与搜索） */
  canonicalNameEn: string
  /** 学科（数学/物理/...）：cluster 不跨学科 */
  subject: string
  /** 学段范围（如 "中学" / "高中" / "K-12"）。跨学段可空 */
  gradeBandHint?: string

  /** 多语言别名（不限语言、不限正式性） */
  aliases: Array<{ lang: string; name: string }>

  /** 跨体系差异/教学要点的简短说明 */
  crossSystemNotes?: string

  /** cluster 层 misconception（跨体系通用） */
  commonMisconceptions?: Annotation<string[]>
  /** cluster 层 assessability */
  assessability?: Annotation<AssessabilityLevel>

  /** 建立来源 */
  createdBy: 'manual' | 'llm-aligned' | 'term-dictionary' | 'auto-singleton'
  /** 是否被学科专家 verify 过 */
  verified: boolean
  /** 时间字段 */
  createdAt: string
  curatedAt?: string
  /** annotator 版本（用于 cluster 维度回标） */
  annotatorVersion?: string
}

// ────────────────────────────────────────────────────────────────
// 2. KP：单一课程体系内的具体表达
// ────────────────────────────────────────────────────────────────

export type KnowledgePointId = string  // ULID

export type KnowledgePointSource =
  | 'pep-cn' | 'tongbian-cn' | 'huji-cn'
  | 'kokutei-jp'
  | 'ccss-us' | 'ngss-us'
  | 'cambridge-uk' | 'ib'
  | 'manual' | 'llm-extracted' | 'external-kg'

export interface SourceRef {
  source: KnowledgePointSource
  externalId?: string
  evidenceSnippet?: string
  ingestedAt: string
  confidence?: number
}

export interface KnowledgePoint {
  /** ULID，永久稳定 */
  id: KnowledgePointId
  /** 归属 cluster；单成员 cluster 也必须有（自动生成） */
  clusterId: KnowledgePointClusterId

  /** 所属课程体系 */
  curriculumSystem: KnowledgePointSource
  /** 该体系内的规范名（如"勾股定理"或"ピタゴラスの定理"） */
  canonicalName: string
  /** 该 KP 在本课程体系下的别名（旧名、缩写） */
  aliases: string[]
  /** 内容哈希，用于幂等入库；sha1(curriculumSystem + subject + gradeBand + normalize(canonicalName)) */
  canonicalHash: string

  /** 与教材叶子的引用方向：叶子持 knowledgePointIds[]，KP 不反向持叶子 id（避免循环） */

  /** 学科/学段：与所属叶子的 textbook 元数据冗余一份，方便不 join 直接查 */
  subject: string
  gradeBand: string

  title: string
  summary: string

  /** 6 维标注（v1 同款） */
  annotations: KnowledgePointAnnotations

  /** Provenance */
  sourceRefs: SourceRef[]
  /** 整体质量信号 */
  confidence?: number
  /** 是否人工 verify */
  verified: boolean

  /** 时间字段 */
  labeledAt: string
  curatedAt?: string
  annotatorVersion: string
}

export interface KnowledgePointAnnotations {
  knowledgeType?: Annotation<KnowledgeType>
  difficulty?: Annotation<DifficultyLevel>
  learningObjectives?: Annotation<LearningObjective[]>
  prerequisites?: Annotation<KnowledgePointId[]>  // 同 curriculumSystem 内
  /** 本体系特有 misconception；cluster 层有 commonMisconceptions */
  misconceptions?: Annotation<string[]>
}

// ────────────────────────────────────────────────────────────────
// 3. 教材叶子：引用 KP，而非内嵌
// ────────────────────────────────────────────────────────────────

export interface ChapterAnnotations {
  /** v1.1 关键变化：叶子持 KP 引用数组，不再内嵌 KP 对象 */
  knowledgePointIds: KnowledgePointId[]
  /** 叶子级粗粒度信号（v1 保留）：用于目录树着色、教研概览 */
  primaryKnowledgeType?: Annotation<KnowledgeType>
  estimatedKpCount?: number
  /** 叶子层 annotator 版本 */
  annotatorVersion?: string
  /** 时间 */
  labeledAt?: string
}
```

### 字段分工说明

| 关注点 | cluster | KP |
|---|---|---|
| id 策略 | ULID | ULID + canonicalHash 索引 |
| 命名 | `canonicalNameEn`（强制英文）+ `aliases[{lang, name}]` | `canonicalName`（本体系语言）+ `aliases[]`（同体系内别名） |
| 与叶子关系 | 无（cluster 不见叶子） | 被叶子引用（叶子持 KP id 数组） |
| 多语言 | 必须多语言（aliases 跨 lang） | 单语言（属于单一体系） |
| 质量信号 | `verified`, `createdBy` | `verified`, `confidence`, `sourceRefs[].confidence` |
| 时间字段 | `createdAt`, `curatedAt` | `labeledAt`, `curatedAt` |

---

## 7. 待用户决策 D1.1 ~ D1.5

| ID | 议题 | 选项 | 倾向 |
|---|---|---|---|
| **D1.1** | cluster id 用 ULID 还是稳定 hash？ | A · ULID（推荐）；B · hash(canonicalNameEn + subject)；C · 复合 | **A**。cluster 的成员构成会随运营变化，hash 不稳定。ULID + canonicalHash 索引（在 KP 上）已能覆盖幂等需求。 |
| **D1.2** | 多来源 KP 概念冲突（例如难度评估不一致）时，用哪个？ | A · 最新 sourceRef 覆盖；B · 人工 verify 优先；C · 按 source 优先级（manual > pep-cn > llm > external-kg） | **C**。优先级表显式可调，可审计；A 容易被低质量来源污染。同时记录所有 sourceRefs，不丢历史。 |
| **D1.3** | cluster 建立流程：人工优先还是 LLM 草案 + 人工 verify？ | A · 全人工；B · LLM 草案 + 学科专家 verify；C · 先单成员 cluster，后跨体系入库时再 LLM 对齐 | **C**。Pilot 阶段不存在跨体系合并需求，强行做 LLM 对齐是浪费。第二个体系入库时一次性 LLM 对齐 + verify 效率最高。 |
| **D1.4** | Pilot 阶段先建 KP 不建 cluster（晚绑定）？还是 KP+cluster 同步建？ | A · 先建 KP，cluster 字段留空；B · 同步建（每 KP 自动归入单成员 cluster） | **B**。理由：①避免后续大规模回填 student_responses；②AdaptiveController 从 Day 1 就用 clusterId 语义，不需要中途切换；③单成员 cluster 几乎零成本（写一行 cluster 记录 + 一个 id 引用）。**这是最该优先拍的决策**——它决定后续半年的迁移路径。 |
| **D1.5** | 学情迁移：旧 student_responses 没有 cluster id，是否回填？ | A · 强制回填（影响范围：所有历史响应）；B · 不回填，只在新数据上用 cluster；C · 增量懒回填（旧数据查询时按 KP→cluster 映射动态补） | **C**。回填存量是高风险操作（cluster 映射可能错）；懒回填能在查询时按需补充并写回缓存，错了好回滚。**前提是 D1.4 选 B**——若 Pilot 没建 cluster，这条 D1.5 选 A 是死路（cluster 都不存在），只能选 B 放弃续延。 |

---

## 8. 风险与未决

### 8.1 v1.1 新增风险

1. **cluster 对齐错误的"病毒式传播"**：把"中国导数"和"日本微分"错合为一簇，会让所有跨体系的学情数据互相污染。
   - 缓解：跨体系合并必须经学科专家 verify；合并操作有审计日志和 unmerge 能力；mastery 数据保留 `curriculumSystem` 冗余字段，便于事后按体系拆分回滚。
2. **provenance 字段膨胀**：长期运行后，热门 KP（如"二次函数"）可能积累几十条 sourceRefs，单条记录变大。
   - 缓解：sourceRefs 超过 20 条后归档到独立 audit 表，KP 主表只保留最新 5 条。
3. **canonicalHash 与 normalize() 算法绑定**：normalize 算法升级会让所有 canonicalHash 失效。
   - 缓解：把 normalize 版本号编入 hash 前缀（如 `nv1:sha1...`），算法升级时新版 hash 与旧版并存一段时间。
4. **AdaptiveController 在 conceptId/clusterId 语义混用期的二义性**：迁移期既有 KP id 也有 cluster id 进 masteryMap，逻辑出错难调。
   - 缓解：加运行时格式断言（cluster id 用统一前缀 `clst_`，KP id 用 `kp_`），格式不符直接 throw。

### 8.2 已知未决（不需要 v1.1 决策）

- cluster 之间的关系（如"代数 cluster 是 几何 cluster 的姐妹"）：v1.1 不引入 cluster 间关系，留到 v2。
- cluster 跨学科链接（"勾股定理" cluster ↔ "力的合成" cluster 都用向量加法）：与 v1 的 `crossSubjectLinks` 一起进 v2。
- 课标官方映射（cluster ↔ 中国课程标准条目 / 美国 Common Core code）：v1.1 schema 留 `sourceRefs[].externalId` 已可容纳，但映射表建设独立项目。
- cluster 的"语义合法性校验"机制（防止运营把不相干 KP 合并）：v2 引入"cluster 内 KP 相似度阈值"自动校验。

---

## 附录 A · v1 → v1.1 字段映射

| v1 | v1.1 | 备注 |
|---|---|---|
| `KnowledgePoint.canonicalKey` | `KnowledgePointCluster.id` + `KnowledgePoint.canonicalHash` | canonicalKey 实体化为 cluster；canonicalHash 接管幂等入库 |
| `ChapterAnnotations.knowledgePoints[]`（内嵌） | `ChapterAnnotations.knowledgePointIds[]`（引用） | 关键改动 |
| `KnowledgePoint.leafChapterId` | （不变，KP 仍归属一个叶子） | |
| `AdaptiveController.masteryMap` 键 = "conceptId" | 键语义 = clusterId，名称暂保留 | 等数据源全切完再改名 |
| `Annotation<T>.source`（v1：`'manual' | 'llm-extracted' | ...`） | 升级为 `KnowledgePointSource`（含课程体系） | |

## 附录 B · 与 v1 决策 D1~D6 的关系

- **D1（KP 是否独立实体）**：v1.1 强化 A 选项——KP 必须独立，且新增 cluster 实体。
- **D2（prerequisites 跨教材）**：v1.1 不开放跨体系 prerequisites（仍同体系内引用）。跨体系前置关系未来由 cluster 间关系承载。
- **D3（difficulty 枚举/数值）**：v1.1 保持 v1 决策（枚举）。
- **D4（KP 切分由 LLM）**：v1.1 保持。
- **D5（emotionalLoad）**：v1.1 不变。
- **D6（misconceptions 入 v1）**：v1.1 拆为 cluster.commonMisconceptions（主） + KP.misconceptions（补）。
