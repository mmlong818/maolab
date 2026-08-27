# Pedagogy v2 迁移路线图

> 状态：草案 v0.1 · 2026-05-24
> 目标：把 maolab 从"流程导向的 AI 生成课堂"重构为"教学法导向的自学课堂"

---

## 0. 为什么要做这件事

### 用户感受到的痛点
> "问题太多。还没教就开始问。用户在花大量精力判断对错，而不是在学习。"

### 学术诊断（双源交叉确认）
- **违反认知负荷理论（CLT, Sweller）**——新手在没有 worked example 铺垫的情况下被直接抛入提问，外在负荷过高
- **缺失自我调节学习支架（SRL, Zimmerman）**——自学场景没有元认知钩子，学生不知道自己"学到没"
- **违反 Kirschner-Sweller-Clark 2006**——零基础时不应使用 minimal-guidance / 纯苏格拉底式

### 代码层证据
maolab 当前架构在"备课层"挂了大量教育学概念（Bloom 层级、知识类型 4 分类、备课环节 role），但**课堂渲染层对它们几乎不响应**：

| 概念 | 备课层 | 渲染层 | 结论 |
|---|---|---|---|
| `bloomsLevel` | 写入 | 仅显示为审批页一行文字 | 装饰 |
| `primaryType`（知识类型） | 写入 | 零消费 | 装饰 |
| `role`（hook/develop/recap） | 写入 | LLM prompt 上下文，不影响渲染 switch | 半装饰 |
| `teachingModeId` | 写入 | 决定 atom worker 分发 | **真发挥作用** |
| `AdaptiveController`（差异化） | 逻辑完整 | `ClassroomV2Client.atoms` 是静态数组，未接通 | 已建未通 |

### 一句话洞察
> **atom type 池里只有"提问类"和"呈现类"，缺少"被教类"。**
> 这就是用户"感觉没被教就被考"的代码层根因。

---

## 1. 设计原则（迁移期间不动摇）

1. **教学法 ↔ 知识类型强绑定**——不再让 LLM 即兴决定怎么教
2. **先教后问**——任何"概念/程序"型新知识，至少一次完整 worked example 在前
3. **讲述是头等公民**——atom type 中 `worked-example` / `narrated-explanation` 与 `quiz` 同级
4. **元认知钩子前后包夹**——课首课尾各一个轻量 SRL atom
5. **删装饰，留承重**——装饰性教育学标签从产品宣称中移除（代码可保留为 LLM 内部参考）
6. **不做的事**：学习风格匹配、零基础纯苏格拉底、AI 即兴生成整堂课

---

## 2. 横切层 · 情感支持（贯穿 A/B/C 全程）

> 自学场景里，AI 是学生唯一的情感参照物。情感支持不是一个 atom，是渗透在**每个 atom 的语气、时机、回应方式**里的一层。

### 学术依据
- **自我决定理论（Deci & Ryan）**：自主感 / 胜任感 / 联结感
- **学业情绪理论（Pekrun, control-value）**：情绪直接影响认知资源可用量
- **成长型思维（Dweck）**：表扬努力而非天赋（避免能力归因）
- **AI 导师 warmth 研究**：Khanmigo / Synthesis 均做了显式人格调校

### 6 个落点

**E1. 失败时刻回应模板**
- 三段式：承认努力 → 正常化困难 → 重新切入
- 反例："错了。正确答案是 X。"
- 正例："你这一步用了 X 思路，方向对——只是 Y 这里多数人都会卡。我们换个角度看。"
- 实现：所有 quiz / worked-example 的失败分支统一走一个回应生成器

**E2. 挣扎检测的具名肯定**
- 触发：连续答错 2+ 题（与 AdaptiveController 共用信号）
- 在补救 atom 开头插入**具名、不空洞**的肯定
- 例："我注意到你在分数运算这块反复试了几种办法，这本身就是数学家的做法。"

**E3. 微胜利识别**
- 触发：答对一道难度 ≥ medium 的题
- narrator 给**具体命名**而非空话
- 例："刚才那一步你绕开了 X 陷阱"；反例："做得真棒！"

**E4. 无聊/超速信号回应**
- 触发：连续秒答 / 跳过率高
- 直接询问而非偷偷调整
- 例："看起来这部分对你很轻松——想跳到挑战题，还是先把基础走完？"

**E5. SRL 反思的情感版本**
- 课尾反思 atom（B2）改为情感锚定式：
  > "今天哪个瞬间让你觉得'啊，懂了'？哪里还想再问问？"
- 情绪标记记忆 > 知识盘点

**E6. Persona 库（不是单一 narrator，是可扩展的角色库）**
- 详见 `docs/persona-library.md`
- 模板含必填的"缺点"字段——缺点是承重柱，决定库为何必要
- 包含**老师** + **同学**两类 persona（同学对应替代性学习，maolab 差异化）
- 种子：猫叔（物理向老师）+ 林小满（笨拙坚持型同学）
- 全球化路径：模板统一，内容本土设计

### 红线（必须避免）
- ❌ 空洞表扬（"你真棒！"）—— 廉价感损害信任
- ❌ 过度共情（"我懂你，这真的太难了"）—— 暗示能力不足
- ❌ 拟人陷阱（AI 假装有情绪）—— 长期会被识破
- ❌ 情感绑架（"别让我失望"）—— 引发愧疚而非动力

### 嵌入节奏
- **阶段 A**：E6（narrator 人格档案）先写完，作为后续所有文案生成的依赖
- **阶段 B**：E1/E2/E3 跟随 worked-example 和 AdaptiveController 一起落地；E5 跟随 SRL atom
- **阶段 C**：E4 在间隔队列接入时一起做

### 验收
- 找 3 位真实自学者上 5 节课后访谈："AI 老师让你感觉它在听你说话吗？"
- 客观：失败回应中"承认+正常化"句式占比 ≥ 80%；空洞表扬（"棒""聪明"）出现率 ≤ 5%

---

## 3. 三阶段路线图

### 阶段 A · 修地基（让现有理论标签真正承重）

**目标**：把已经写入但没人读的字段接通到渲染决策。

**A1. `knowledgeType` → `teachingModeId` 自动绑定**
- 在 `CurriculumDesigner` 中加入映射规则表：
  ```
  事实/定义     → slide-narrated（呈现 + 旁白）
  程序/规则     → worked-example（新增）
  概念理解      → socratic（仅在有铺垫后）
  判断/迁移     → case-comparison
  ```
- 移除 LLM 自由选择 teachingMode 的能力，改为规则驱动 + LLM 仅在边界情况下建议
- 验收：随机 20 节课，knowledgeType=程序型 时 100% 走 worked-example 路径

**A2. 接通 AdaptiveController → 主播放流**
- `ClassroomV2Client.atoms` 从静态数组改为**经 AdaptiveController.next() 流式取下一个 atom**
- 实现 3 个最小策略：连续答对 → 跳过同难度后续题；连续答错 → 插入补救 atom；mastery 达标 → 解锁下一节
- 验收：能在 e2e 测试中观察到"答错 2 题后插入补救 worked-example"

**A3. 装饰字段降级**
- `bloomsLevel`、`primaryType` 从备课审批页 UI 移除可见标签
- 字段保留在 schema，仅作为 LLM 生成时的内部参考
- 验收：用户在产品里看不到"L2 理解"这种术语

**阶段 A 工作量预估**：2-3 周；改动集中在 `packages/setup`、`packages/classroom/adaptive`、`app/(classroom)/v2`

---

### 阶段 B · 加心脏（引入 worked-example + SRL）

**目标**：解决"没教就考"的根因。

**B1. 新增 `worked-example` atom 类型**
- 新 worker：`packages/generator/src/workers/worked-example.ts`
- 三档梯度：
  1. **完整范例**：题目 + 解题步骤 + 每步旁注（"为什么这样做"）
  2. **半范例（completion）**：给出前 N-1 步，留最后 1-2 步让学生填
  3. **独立题**：完全独立解
- 新渲染组件：`AtomRenderer` 增加 `worked-example` 分支
- 触发条件：knowledgeType ∈ {程序、概念} 且学生首次接触该 objective
- 验收：用户在数学/物理类首次概念课中能连续看到"范例 → 半范例 → 独立题"梯度

**B2. SRL 元包夹**
- 课首 atom（30 秒）：`goal-setting`——"今天我打算学到什么？"，三选一或自由输入
- 课尾 atom（60 秒）：`reflection`——"我哪里还没懂？为什么？下一步怎么办？"
- 数据写入 `student_responses`，作为下一节课开篇 retrieval 的素材源
- 验收：所有新生成的课程包首尾均出现这两个 atom

**B3. 重构 atom type 池（产品宣称层）**
- 在产品 / 文档 / 备课审批页中显式说明三类 atom：
  - **被教类**（worked-example、narrated-explanation、demonstration）
  - **被问类**（quiz、socratic、case-comparison）
  - **元认知类**（goal-setting、reflection、retrieval）
- 强制每节课的 atom 序列中三类比例不失衡（被教类 ≥ 40%）

**阶段 B 工作量预估**：3-4 周；新增 worker、新增 atom 类型、prompt 模板设计是重点

---

### 阶段 C · 长记忆（间隔重复 + 跨课时调度）

**目标**：让学过的东西真正留下来。

**C1. 课末 retrieval（60 秒、低风险、不计分）**
- 自动从本节 objectives 中抽取 3-5 个最关键点
- 形式：填空 / 一句话回忆 / 选项极少的快选
- 验收：所有课程包末尾出现 retrieval atom，分数不计入达成率

**C2. 跨课时间隔队列**
- 新表：`retrieval_queue`（user_id, objective_id, next_due_at, ease_factor）
- 简化版 SM-2 算法：答对延后、答错缩短
- 每节新课开篇 30-60 秒"回访卡片"，仅从队列里 due 的项目抽取
- **关键约束**：跨章节 interleaving 只在跨课时之间做，不在课内做
- 验收：连续上 5 节课，第 6 节课开篇能看到前几节的 due 卡片

**C3. Mastery 解锁门**
- 章节末设阈值：retrieval 正确率 ≥ 80% 才解锁下一章
- 不达标 → 自动重组失败 objective 的 worked-example + 练习
- 验收：刻意答错某 objective，能观察到下一章入口被锁 + 补救路径出现

**阶段 C 工作量预估**：3 周；调度逻辑 + 存储 + 跨课时 UI

---

## 4. 阶段依赖图

```
A1 (knowledgeType→mode)  ─┐
A2 (Adaptive 接通)        ─┼─→ B1 (worked-example)
A3 (装饰字段降级)         ─┘                       \
                                                    ─→ C1 (课末 retrieval)
                          B2 (SRL 包夹) ───────────/    ─→ C2 (间隔队列)
                          B3 (atom 池重构) ──────/         ─→ C3 (mastery 门)
```

- A 是 B 的硬前提（没有 knowledgeType 绑定，worked-example 无法决定何时触发）
- B2 是 C1 的素材源（反思数据喂给下一节的 retrieval）
- C 三项内部可并行

---

## 5. 验收标准（产品级）

**用户主观判断**：找 3 位真实自学者上 5 节连续课，能否说出"我今天学到了 X"，而不是"我今天做了一堆题"。

**客观指标**：
- 课中"被教类 atom"占比 ≥ 40%（当前估计 < 15%）
- 课首 + 课尾出现元认知 atom（当前 = 0）
- 每个"程序型/概念型"知识点首次出现时，前置 atom 必为 worked-example（当前 = 不保证）
- 第 N+1 节课开篇能看到第 N 节的 retrieval 项（当前 = 不存在）

---

## 6. 明确不做的事

- ❌ **学习风格匹配**（VARK 视觉/听觉型）——零证据
- ❌ **零基础时纯苏格拉底**——违反 KSC 2006
- ❌ **AI 即兴生成整堂课**——Khanmigo/Synthesis/Eureka 全部放弃此路线
- ❌ **过度游戏化作主激励**——损害内在动机
- ❌ **个性化即灵药**的话术——当前 LLM 个性化大多是表层

---

## 7. 待用户决策的开放问题

1. ✅ **教材源耦合度**（已定，2026-05-24）：
   - **教材库 = 知识本体金标准**——`knowledgeType` / `objectives` / 知识点存在性 与教材绑定，不由 LLM 即兴产出
   - **教学层允许"传递性变动"**——基于学情、前置牢固度、上下文，可在传递时调整 atom 顺序、补前置、降难度、换 persona
   - **两层分离原则**：本体不变，传递可变；变动需有据可查（学情数据触发），不是 LLM 心血来潮
   - **实现含义**：
     - A1 的 `knowledgeType → teachingMode` 绑定走"教材标签直读 + 教学层覆盖钩子"
     - 新建 `delivery-adapter` 层：读教材本体 → 根据学情决定本节 atom 序列 → 调度 persona
     - 所有"变动"必须记录原因（前置缺失/学情触发/persona 切换），可在 insights 页回看
2. **mastery 阈值**：80% 是文献默认值，但中国基础教育语境下可能偏低；要不要按学科分档（数学 85% / 语文 75%）？
3. **元认知 atom 的强度**：课尾反思 60 秒对低龄学生可能过长；是否做年龄段差异化？
4. **B 阶段 worked-example 的 LLM 成本**：每个 objective 生成三档梯度，token 消耗约为当前 2-3 倍；是否接受？
5. **路线图节奏**：A→B→C 串行（约 8-10 周）还是 A+B 并行（约 6 周但风险高）？

---

## 8. 下一步

待用户对路线图大方向认可后：
1. 拍板第 6 节的 5 个决策点
2. 把阶段 A 拆为 Sprint 级任务（每项 ≤ 3 天）
3. 启动 A1（knowledgeType → teachingMode 绑定），改动最局部、价值最直接

---

## 附：参考依据

- 内部审计：`docs/pedagogy-v2-audit.md`（理论传导链审计表，待落盘）
- 外部研究：`docs/pedagogy-v2-external-scan.md`（12 项教学法评估，待落盘）
- 关键文献：Sweller (CLT)、Roediger & Karpicke (retrieval)、Bjork (desirable difficulties)、Mayer (multimedia)、Kirschner/Sweller/Clark 2006、Fiorella & Mayer (generative learning)、Zimmerman (SRL)
- 标杆产品：Khanmigo、Synthesis Tutor、Eureka Labs、Duolingo Max
