# 从"流程导向"到"教学法导向"：maolab AI 自学课堂的诊断与重构

> 工作论文 v0.1 · 2026-05-24
> 关联文档：`docs/pedagogy-v2-roadmap.md` · `docs/persona-library.md`
> 状态：内部讨论稿，含设计 CHALLENGE 标注

---

## 摘要

本文报告一项 AI 自学课堂产品（maolab）的内部教学法诊断与重构设计。诊断从三层证据交叉确认开始：(i) 用户主诉"问题太多、还没教就开始问"；(ii) 代码层审计揭示——产品在备课层挂载了 Bloom 层级、知识类型四分类等教育学标签，但课堂渲染层几乎不消费这些字段，唯一真正承重的是 `teachingModeId`，且差异化控制器虽逻辑完整但未接通主播放流；(iii) 学术诊断将上述现象定位为同时违反认知负荷理论（Sweller）的范例铺垫原则、缺失自我调节学习（Zimmerman）支架、并落入 Kirschner-Sweller-Clark (2006) 所警告的"minimal-guidance 谬误"。

基于诊断，我们提出六条设计原则、一个贯穿全程的情感支持横切层、以及一个 A-B-C 三阶段路线图：阶段 A 让现有理论标签真正驱动渲染决策；阶段 B 引入 `worked-example` atom 类型与 SRL 元包夹；阶段 C 接入间隔重复与掌握度门控。设计中最具差异化的是 persona 库——不仅设计了一位"有缺点的老师"（猫叔），还设计了五位"心理声部"互补的同学（mirror / aspiration / lateral / anchor / applied-anxiety），以 Bandura (1977) 的替代性学习与 Vygotsky 的最近发展区为理论锚点。

本文同时是一份诚实的弱点清单。我们用 `[CHALLENGE]` 标注全文 18 处推理跳跃、未经证据的假设、以及可能站不住脚的设计赌注。其中最致命的三处是：(1) 我们将产品定位为"AI 自学课堂"，但 Cheng et al. (2026) 的 meta-analysis 显示 AI 教学代理在 teacher-directed 场景的效应显著大于 self-directed 场景；(2) 我们押注"同学 persona 提升代入感"，但目前没有任何 AI 同伴学习的对照研究；(3) 我们将 Khanmigo 列为标杆，但 Khanmigo 至今未完成 RCT，其经验对 maolab 的可迁移性比我们承认的要弱。

**关键词**：认知负荷理论、自我调节学习、worked example、AI 教学代理、persona、替代性学习

---

## 1. 引言

### 1.1 当代 AI 自学应用的共同困境

2023 年以来，基于大语言模型的 AI 教学产品迅速出现：Khan Academy 的 Khanmigo、Synthesis Tutor、Andrej Karpathy 的 Eureka Labs、Duolingo Max 等。它们共享一个隐含承诺：通过自然语言对话提供"个性化辅导"。但近两年的实证证据显示，这一承诺远未兑现——

Cheng et al. (2026) 对 27 项生成式 AI 教学代理研究做 meta-analysis，得到 g = 0.401 的中等效应，但**关键的调节变量是"教师在场 vs 学生独立使用"**：教师主导（teacher-directed）场景下的效应显著大于学生自主（self-directed）场景。Xu (2025) 对 35 项 AI-SRL 研究做 meta-analysis 得 g = 0.507，但效应集中在"任务执行阶段"（g = 0.574）而非"前期规划阶段"（g = 0.401）。一项 2025 年针对 Khanmigo 在大学物理课的混合方法研究则发现，Khanmigo 组、Google 搜索组、纸本组在学习产出上**没有显著差异**（Journal of Teaching and Learning, 2025）。Khan Academy 自身至今**未完成 Khanmigo 的随机对照试验**（K-12 Dive, 2025）。

更冷静的判断来自该领域的综述文献：hybrid human-AI workflows 比纯自主 AI tutor 产生更稳健的学习增益（多个 2025 综述）。

> `[CHALLENGE-A1: maolab 的产品形态是"无教师在场的纯 AI 自学课堂"，正是 meta-analysis 显示效应最弱的那一类。我们如何论证这条路线不是注定 underperform？要么承认这是赌注（教学法做到极致能否补回 teacher-directed 的差距），要么调整定位（引入异步人类辅助）。这是论文必须正面回答的第一个问题。]`

### 1.2 maolab 的具体痛点

用户在长期使用后给出一句话总结：

> "问题太多。还没教就开始问。用户在花大量精力判断对错，而不是在学习。"

这是一句典型的"代码味道"——它不是单点 bug，而是产品形态层面的味道。它促使我们做一次彻底的内部审计。

### 1.3 本文贡献

1. **一份代码层 + 学术层交叉的诊断方法**——揭示"理论标签写入但渲染层不响应"这一类 AI 教学产品的隐疾；
2. **一套从诊断到落地的设计原则**——把 CLT / SRL / 多媒体学习从口号变成 atom 池结构与 worker 分发规则；
3. **一个 persona 库的 first-principle 设计**——把"缺点"作为承重字段、把"同学"作为差异化轴；
4. **一份诚实的弱点清单**——通过 `[CHALLENGE]` 标注让设计赌注显式化，便于后续打磨与实证检验。

---

## 2. 相关工作

### 2.1 认知负荷理论与 worked example effect

Sweller (1988, 1994) 提出认知负荷理论（Cognitive Load Theory, CLT），区分内在负荷（intrinsic）、外在负荷（extraneous）和相关负荷（germane）。CLT 的核心教学含义之一是 **worked example effect**：对于新手学习者，学习"已解出的例题"比直接解新题更有效——因为前者的外在负荷更低、留出更多工作记忆给"理解"本身（Sweller, van Merriënboer & Paas, 1998）。

Kirschner, Sweller & Clark (2006) 在 *Educational Psychologist* 发表的著名论文 *Why Minimal Guidance During Instruction Does Not Work* 中，把发现式学习、问题导向学习、探究式学习与纯苏格拉底法一并归为"minimal guidance"，并基于 CLT 论证：对新手而言，这些方法**违反认知架构的工作方式**。这是本文诊断 maolab"还没教就开始问"的核心理论锚点。

2024-2025 年，多项研究探讨了 LLM 时代 worked example 的新形态。Sun et al. (2024) 在 *Education Sciences* 比较 process-oriented 与 product-oriented worked example 的教学策略；Wang et al. (2025) 在 *Journal of Educational Computing Research* 验证 LLM 自适应机制能有效降低 cognitive load 并促进持续动机。

> `[CHALLENGE-A2: CLT 是基于工作记忆有限性的认知模型，主要在 STEM 领域（数学、物理、编程）的程序性知识上证据最强。我们要把 worked-example 作为"被教类"atom 的承重柱，但 maolab 的覆盖学科可能包括语文、历史、艺术——这些"非良构问题域"中 worked example 的迁移效应远不如 STEM 稳健（Renkl, 2014 review 已指出这一边界）。我们论文中"任何概念/程序型新知识至少一次完整 worked example"的强主张需要按学科分档，而不是一刀切。]`

### 2.2 自我调节学习

Zimmerman (2000, 2002) 的循环模型把自我调节学习（Self-Regulated Learning, SRL）分为三个阶段：forethought（目标设定 + 策略规划）→ performance（执行 + 自我监控）→ self-reflection（自我评估 + 归因 + 调整）。SRL 在自学场景尤为关键——没有教师在场时，学生必须自己承担元认知调度。

Xu et al. (2025) 对 35 项 AI-SRL 实证研究的 meta-analysis 显示，AI 支持 SRL 的总体效应中等（g = 0.507），但效应在三个阶段分布不均：performance 阶段最强（g = 0.574），forethought 阶段较弱（g = 0.401）。生成式 AI 表现优于早期规则式 / 数据驱动式系统，但异质性高。Xu et al. (2025) 在 BJET 另一篇论文中专门指出，**元认知支持是 GenAI 环境中 SRL 增益的关键中介**。

> `[CHALLENGE-A3: Xu 2025 的 forethought 阶段效应弱于 performance 阶段。我们的设计中，B2"课首 goal-setting" 是 forethought atom，"课尾 reflection"是 self-reflection atom。如果 Xu 的发现成立，我们投入两个 atom 的成本可能在 forethought 端被浪费——更应该把元认知钩子集中在 performance 阶段（如 worked-example 过程中插入 self-explanation 提示）。当前路线图的 B2 设计可能没踩在效应最强的位置。]`

### 2.3 多媒体学习

Mayer (2001, 2014) 的多媒体学习认知理论（CTML）总结出 12 项设计原则，其中与本文最相关的是：
- **modality principle**：图 + 旁白 优于 图 + 文字
- **signaling principle**：突出关键结构能降低外在负荷
- **redundancy principle**：屏幕文字与旁白重复反而增加负荷
- **personalization principle**：对话式表达优于正式表达

这些原则直接约束 maolab 中 `narrated-explanation` atom 的实现细节。

### 2.4 替代性学习与最近发展区

Bandura (1977) 的社会学习理论指出，**人类学习的相当部分来自观察他人**——替代性学习（vicarious learning）。学生看见"另一个学生"挣扎、卡住、突破，比看老师演示更容易代入。Vygotsky 的最近发展区（ZPD）理论进一步说明，比学习者**稍微领先**的同伴是最有效的脚手架。

这两条理论是本文设计"同学 persona"的核心依据。但需要严肃说明：

> `[CHALLENGE-A4: Bandura 与 Vygotsky 的理论是基于真人同伴的研究。AI 模拟出的"同学"是否能触发同样的替代性学习效应，目前没有任何严格的对照证据。教育心理学研究者可能合理地质疑："AI 假装的同学和真实同伴产生的心理代入是否同源？"我们必须承认，同学 persona 是 maolab 最大的设计赌注——价值锚点真，但产品形态的有效性未经证实。]`

### 2.5 学业情绪

Pekrun (2006) 的控制-价值理论（control-value theory of achievement emotions）指出，学业情绪不是学习的副产品，而是直接影响认知资源可用量的变量——焦虑会挤占工作记忆、兴趣能扩大注意带宽。Pekrun (2024) 在最近的综述中重申，positive activating emotions（兴趣、希望、自豪）对学习产出有稳定正向效应。

Deci & Ryan (1985, 2000) 的自我决定理论（SDT）补充情绪外的动机机制：自主感、胜任感、联结感是内在动机的三个心理需求。Dweck (2006) 的成长型思维理论强调表扬"努力"而非"天赋"。

这三条共同构成本文"情感支持横切层"的理论基础（详见 §4）。

### 2.6 检索练习与间隔重复

Roediger & Karpicke (2006) 的检索练习效应（testing effect）证明，主动从记忆中提取信息比被动复读更能形成长期记忆。Bjork (1994) 的 desirable difficulties 框架解释了为什么这些"反直觉"的方法有效。SuperMemo / Anki 系列工具将这些原理工程化为间隔重复算法（SM-2）。

这是本文阶段 C 设计的理论基础。

### 2.7 当代 AI 教学产品的实证状态

如 §1.1 所述，2024-2025 年的实证证据揭示出三个反直觉事实：

1. **Khanmigo 至今没有完成 RCT**——Khan Academy 公开承认 RCT 在规划中（K-12 Dive, 2025）。现有相关研究（Journal of Teaching and Learning 2025 的物理课研究）显示 vs 传统方法无显著差异。
2. **生成式 AI 教学代理的总体效应中等**，约 g = 0.4（Cheng et al., 2026 meta-analysis）。
3. **teacher-directed 显著优于 self-directed**——这是对所有"AI 自学课堂"形态的根本性挑战。

> `[CHALLENGE-A5: 我们路线图 §6 把 Khanmigo / Synthesis / Eureka 列为"全部放弃 AI 即兴生成整堂课"的证据。但 Synthesis 和 Eureka Labs 都没有公开的实证数据，我们的引用更接近"行业判断"而非"学术证据"。论文必须把这一段降级表述为"行业观察"，而不是 evidence-based 论断。]`

---

## 3. 问题诊断

### 3.1 现象层：用户主诉的解码

"还没教就开始问"——这句话拆开有三层含义：

1. **时序错位**：提问发生在教学之前
2. **承重错位**：判断"对错"的认知负担落在学生身上
3. **角色错位**：AI 像考官而非教师

这三层都指向一个共同的诊断假设——atom 池的结构性偏斜。

### 3.2 代码层：内部审计

我们对 maolab 的核心字段做了"理论传导链"审计，结果如下：

| 概念 | 备课层是否写入 | 课堂渲染层是否消费 | 结论 |
|---|---|---|---|
| `bloomsLevel` | ✅ | ❌（仅审批页一行文字） | **装饰** |
| `primaryType`（知识类型四分类） | ✅ | ❌（零消费） | **装饰** |
| `role`（hook/develop/recap） | ✅ | △（仅入 LLM prompt，不影响渲染 switch） | 半装饰 |
| `teachingModeId` | ✅ | ✅（决定 atom worker 分发） | **真承重** |
| `AdaptiveController` | ✅（差异化逻辑完整） | ❌（`ClassroomV2Client.atoms` 是静态数组） | 已建未通 |

**结论：唯一真正驱动课堂渲染决策的是 `teachingModeId`，且 LLM 在生成时对它的选择相当自由。**

进一步地，我们清点 atom type 池，发现一个结构性问题：

> **atom type 池中只有"提问类"（quiz / socratic）和"呈现类"（slide / video），缺少"被教类"（worked-example / narrated-explanation / demonstration）。**

这就是用户"感觉没被教就被考"的代码层根因。

> `[CHALLENGE-A6: 我们把"atom 池缺被教类"作为根因，但这是基于一次内部代码审计的结论，没有量化数据支撑——例如"实际课堂中提问类 atom 占比 X%，呈现类 Y%，被教类 Z%"。我们路线图 §5 的验收标准里也只是写"当前估计 < 15%"。论文应该补一次客观统计（采样 N 节课实际 atom 分布），把"估计"换成"测量"。否则诊断本身可被质疑为印象主义。]`

### 3.3 学术层：三重违反

把现象层与代码层映射到学术框架：

1. **违反 CLT 的 worked example principle**：新手在没有 worked example 铺垫的情况下被直接抛入提问，外在负荷过高。
2. **缺失 SRL 的元认知钩子**：自学场景没有 goal-setting 与 reflection atom，学生不知道"我学到没"。
3. **落入 KSC 2006 的 minimal-guidance 陷阱**：零基础 atom 序列对苏格拉底式提问的依赖过高。

### 3.4 一句话诊断

> **maolab 在"备课层"挂载了完整的教育学语义，但在"课堂层"几乎不消费这些语义——它表面是教学法导向，实际是流程导向。**

---

## 4. 设计原则

基于诊断，我们确立六条原则。这些原则在迁移期间不动摇——它们是产品的硬骨架。

**P1. 教学法 ↔ 知识类型强绑定**——不再让 LLM 即兴决定教学法。`knowledgeType` → `teachingModeId` 走规则映射，LLM 仅在边界情况下建议。

**P2. 先教后问**——任何概念型或程序型新知识，至少一次完整 worked example 在前。

**P3. 讲述是头等公民**——atom 类型池中 `worked-example` / `narrated-explanation` 与 `quiz` 同级，不是 quiz 的"前置准备"。

**P4. 元认知钩子前后包夹**——课首 goal-setting + 课尾 reflection，强制存在。

**P5. 删装饰、留承重**——装饰性教育学标签（Bloom 层级、知识类型四分类）从产品宣称层移除，代码可保留为 LLM 内部参考。

**P6. 明确不做的事**——学习风格匹配（VARK，证据为零）、零基础纯苏格拉底（违反 KSC 2006）、AI 即兴生成整堂课、过度游戏化作主激励、"个性化即灵药"话术。

> `[CHALLENGE-A7: P1 的"教学法 ↔ 知识类型强绑定"在路线图中给出了一张映射表（事实/定义 → slide-narrated；程序/规则 → worked-example；概念理解 → socratic；判断/迁移 → case-comparison）。这张表没有引用任何文献——它是基于"常识直觉"做的映射。例如"概念理解 → socratic"实际违反了 KSC 2006（新手的概念学习应先 worked example，再过渡到 socratic）。我们的映射表本身需要做一轮文献回溯校验，否则原则 P1 在执行层是错的。]`

> `[CHALLENGE-A8: P5"删装饰"是一个产品决策，但删除可见的 Bloom 标签是否会损失某些有价值的"学习元数据透明性"？有些研究（如 OECD 的 assessment literacy 文献）认为让学生看见学习目标的层级有助于元认知。我们简单"删掉"可能扔掉孩子。更稳妥的做法是 A/B 测试：留与删两组对比 SRL 指标。]`

---

## 5. 横切层：情感支持

情感支持不是一个 atom，而是渗透在每个 atom 语气、时机、回应方式中的一层。

### 5.1 理论锚点

- **Pekrun 控制-价值理论**：情绪直接影响认知资源可用量
- **Deci & Ryan 自我决定理论**：自主 / 胜任 / 联结
- **Dweck 成长型思维**：表扬努力而非天赋
- **AI tutor warmth 研究**：Khanmigo / Synthesis 均做了显式人格调校

### 5.2 六个落点（E1-E6）

详见 `pedagogy-v2-roadmap.md` §2。核心反例如下：

- ❌ "错了。正确答案是 X。" → ✅ "你这一步用了 X 思路，方向对——只是 Y 这里多数人都会卡。"
- ❌ "你真棒！" → ✅ "刚才那一步你绕开了 X 陷阱。"
- ❌ "我懂你，这真的太难了。" → ✅（沉默 + 切换 persona）

### 5.3 红线

- 空洞表扬、过度共情、拟人陷阱（AI 假装有情绪）、情感绑架。

> `[CHALLENGE-A9: 我们把"AI 假装有情绪"列为红线，理由是"长期会被识破"。但事实上 persona 库本身就让 AI"扮演角色"——比如猫叔会"笑一下""自嘱"，柳颂会"眉头微皱"。这条红线和 persona 设计存在内在张力。论文需要给出更精确的区分：哪些情绪表达是"角色的一部分"（可接受），哪些是"AI 共情玩家"（不可接受）。当前没区分清楚。]`

### 5.4 验收

- 主观：3 位真实自学者上 5 节课后访谈："AI 老师让你感觉它在听你说话吗？"
- 客观：失败回应中"承认+正常化"句式占比 ≥ 80%，空洞表扬出现率 ≤ 5%

> `[CHALLENGE-A10: N=3 的访谈样本不足以构成"验收"。这只是一次质性 pilot。论文应明确这是 formative evaluation，不是 summative。同时"≥ 80%"的客观指标缺少 baseline——当前的失败回应中这个比例是多少？我们要测量的是"提升幅度"还是"绝对达标"？]`

---

## 6. Persona 库

### 6.1 三个底层判断

**a. 缺点是承重柱，不是装饰。** 没有缺点的老师 = AI 味、说教味、家长味。缺点必须是真的会影响教学行为的具体约束——它决定 persona 在某些场景"会怎么走偏"。

**b. 缺点决定了为什么需要库。** 单一 persona 不可能在所有场景表现都好。当 persona 进入自己的弱项场景，它应主动退位，由库中另一位顶上。库不是修辞，是缺点系统的必然结果。

**c. 同学 persona 是 maolab 真正的差异化。** 老师 persona 是行业标配（Khanmigo / Synthesis 都做了）。同学 persona 对应替代性学习——这是 maolab 比头部 AI 教学产品多走的一步。

> `[CHALLENGE-A11: 判断 c 是论文最关键的差异化主张，但其论证完全依赖 Bandura (1977) 的间接推断（详见 §2.4 的 CHALLENGE-A4）。更尖锐的反驳是：Khan Academy 和 Synthesis 没有做"同学 persona"不一定因为他们没想到，可能因为他们做过 internal test 发现效果不佳。我们没有任何证据排除"他们做过且放弃"这一可能。这是论文必须诚实标注的设计赌注。]`

### 6.2 老师 persona：猫叔的设计

猫叔的设计核心选择如下：

1. **50 多岁，影视和美术背景**——避开"知识专家"叙事，建立"带你看世界"叙事。
2. **必须有缺点**——五条缺点（废话多、知识广但不深、易沉浸、抗拒标准答案、不擅长情绪安抚）每一条都对应一个"退位规则"。
3. **forbidden 字段强约束**——禁说"你真棒""加油""相信自己""我懂你"。
4. **不端老师架子**——这是中文教育产品中相当稀有的人设位置。

> `[CHALLENGE-A12: 猫叔的设计是基于产品创始人的直觉与审美判断，不是基于"中国学生最有效的导师人设"的实证研究。一个可质疑的点：50 多岁的"老画师"对中国 14 岁学生是否有足够的代入触发？柳颂的设计已经隐含承认了张力（应试焦虑型同学对猫叔的抗拒）。如果 80% 的目标用户更像柳颂，那猫叔可能是错的主 persona——更稳妥的应该是"应试老师 + 猫叔副"，而不是反过来。这是产品定位的赌注。]`

> `[CHALLENGE-A13: "缺点是承重柱"的设计哲学很迷人，但工程实现上极难——LLM 在 prompt 中收到"该 persona 容易跑题"的指令后，是否能稳定地"恰当跑题"而不是"过度跑题"？目前没有 LLM persona controllability 的可靠测量方法。这条原则可能在落地后退化为"prompt 写了，但模型不一定遵守"。需要在 §10 局限中明确。]`

### 6.3 同学 persona：五个心理声部

五位同学不是变体，是不同的**心理功能**：

| 代号 | 声部 | 教学功能 | 理论依据 |
|---|---|---|---|
| 林小满 | 镜像 | 让学生代入"普通的我" | Bandura 1977（vicarious learning） |
| 阿哲 | 领跑 | 稍快一点的够得着的榜样 | Vygotsky ZPD |
| 小渔 | 跳跃 | 激发联想、跨学科类比 | Mayer signaling / generative learning |
| 周屿 | 稳锚 | 不焦虑的存在 | Pekrun 情绪传染 |
| 柳颂 | 应试焦虑 | 平衡猫叔抗拒标准答案 | 中国应试现实补丁 |

**林小满**的杀手锏：worked-example 中她**不是讲解者，是同时听讲的人**。她在猫叔讲快时举手说"等等等等"——给学生一个"代为提问"的代理人。

**阿哲**的杀手锏：worked-example 的**半范例环节由他来填**——示范"差一点的同学是怎么补完最后那步的"。学生看他答错→修正比看老师演示更能学到"思维修正"本身。

**小渔**的设计约束：只在开课激发兴趣 / 跨学科类比 atom 调度她。她和猫叔是"两个跑题大王"——会有失控风险。

**周屿**的设计约束：课尾反思 atom 由他先开口示范。他的存在让"反思"不变成抒情。

**柳颂**的特别价值：她代表大多数中国学生。她的焦虑不是要被治好，而是被看见。她和猫叔之间的张力让课堂真实。

> `[CHALLENGE-A14: 五个声部的划分（mirror / aspiration / lateral / anchor / applied-anxiety）是一个有美感的分类，但它是 ad hoc 的——既没有从已有的同伴学习文献中导出，也没有做过经验验证。教育心理学领域有更系统的同伴角色框架（如 Damon & Phelps 1989 的 peer collaboration / peer tutoring / cooperative learning 三分），我们的五声部框架与之关系如何？论文应明确这是设计假设，不是文献综合。]`

> `[CHALLENGE-A15: 五个同学加一位老师 = 六位 persona 同时在场，这本身就违反多媒体学习的 cognitive load 原则——屏幕上人物太多会分散注意。即使不是同时出场，学生认知中需要追踪六个角色关系。论文需要论证这个数量级的合理性：为什么是 5 而不是 2 或 3？阈值依据何在？]`

### 6.4 调度机制

- 课开始前：根据学科 / atom 序列 / 知识类型，选定主 persona + 副 persona
- 课进行中：遇到主 persona 的 avoid 场景或触发 flaw.mitigation → 自动切换或叠加副 persona
- 情绪信号优先：检测到强情绪卡点时立即切到情感型角色

一致性约束：同一节课主 persona 切换 ≤ 2 次；切换时显式交接动作（"猫叔我有个问题——"）。

---

## 7. 三阶段实施路线

详见 `pedagogy-v2-roadmap.md` §3。摘要：

**阶段 A · 修地基**（2-3 周）：让现有理论标签真正承重。
- A1：`knowledgeType` → `teachingModeId` 自动绑定
- A2：接通 `AdaptiveController` → 主播放流
- A3：装饰字段降级

**阶段 B · 加心脏**（3-4 周）：解决"没教就考"的根因。
- B1：新增 `worked-example` atom 类型（完整范例 → 半范例 → 独立题）
- B2：SRL 元包夹（课首 goal-setting + 课尾 reflection）
- B3：重构 atom type 池（被教类 ≥ 40%）

**阶段 C · 长记忆**（3 周）：让学过的东西留下来。
- C1：课末 retrieval（60 秒、不计分）
- C2：跨课时间隔队列（简化版 SM-2）
- C3：Mastery 解锁门（≥ 80% 才进下一章）

> `[CHALLENGE-A16: C2 的 SM-2 算法是为长期记忆设计（典型间隔从天到月）。但 maolab 的使用频率假设是"每日一节"或"每周三节"——这种密度下 SM-2 的间隔计算需要重新调参，否则会出现"算法说今天该复习，但学生今天没来"的失配。当前路线图没有讨论这个工程现实。]`

---

## 8. 教材本体 vs 教学层分离

这是 2026-05-24 已定的架构决策（路线图 §7.1）：

- **教材库 = 知识本体金标准**：`knowledgeType` / `objectives` / 知识点存在性与教材绑定，不由 LLM 即兴产出
- **教学层允许"传递性变动"**：基于学情、前置牢固度、上下文，可在传递时调整 atom 顺序、补前置、降难度、换 persona
- **两层分离原则**：本体不变，传递可变；变动必须有据可查（学情数据触发），不是 LLM 心血来潮

实现含义：
- A1 的 `knowledgeType → teachingMode` 绑定走"教材标签直读 + 教学层覆盖钩子"
- 新建 `delivery-adapter` 层：读教材本体 → 根据学情决定本节 atom 序列 → 调度 persona
- 所有"变动"必须记录原因（前置缺失 / 学情触发 / persona 切换），可在 insights 页回看

> `[CHALLENGE-A17: 两层分离假设"教材本体是稳定的金标准"。但 maolab 的教材入库流程是"302 本扫描 + LLM 提取 6470 节国家课"（项目状态 memory）——这意味着教材本体本身也是 LLM 产出的。所谓"金标准"的可靠性取决于入库管线的质量，而非真正的人工金标准。论文必须诚实说明：我们的"教材本体"是 LLM 生成 → 人工抽检的混合产物，不是 ground truth。]`

---

## 9. 讨论

### 9.1 与 Khanmigo / Synthesis 路线的对比

| 维度 | Khanmigo | Synthesis Tutor | maolab |
|---|---|---|---|
| 形态 | 单一 AI 导师 | 单一 AI 导师 | 老师 + 同学 persona 库 |
| 课堂结构 | 内容 + chat | 自适应 quest | 教学法驱动的 atom 序列 |
| 教材依赖 | Khan Academy 自有内容 | 自研课程 | 公共教材本体 + 教学层分离 |
| 元认知支架 | 隐式 | 隐式 | 显式（课首/课尾 atom） |
| 实证状态 | RCT 未完成 | 无公开数据 | 内部 pilot 待启动 |

maolab 的差异化主要在两点：(1) atom-level 的教学法强约束（而非 LLM 即兴）；(2) 同学 persona 作为替代性学习载体。

> `[CHALLENGE-A18: 这张对比表把 Khanmigo / Synthesis 放在弱项一栏（隐式元认知、单一导师）。但更可能的真相是：他们经过取舍后**故意**选择简单——简单的产品更容易迭代、用户认知成本低、A/B 测试快。我们的"复杂"（多 persona、显式元认知、严格 atom 池）可能不是优势而是负担。论文必须诚实标注：我们押注"复杂有理"，但行业头部押注"简单胜出"，目前我们没有任何实证证据说明哪种押注更对。]`

### 9.2 全球化路径

模板统一（结构 + 字段）/ 内容本土设计（不是翻译）。第一阶段：中文区猫叔 + 林小满跑通模板；之后扩展。这一路径的合理性在于：教学法骨架可跨文化迁移，但 persona 必须本土设计——日本的"先生型"老师和中国的"猫叔"在情感语义上不可互译。

### 9.3 同学 persona 作为可辩护性

如果未来有竞争对手做出更强的"AI 老师"，maolab 仍有"AI 同伴学习"的差异化空间。但这只有在 §6.1 CHALLENGE-A11 提出的实证赌注成立时才成立。

---

## 10. 局限与未来工作

**理论局限**：
1. 同学 persona 的有效性基于 Bandura 1977 的间接推断，无 AI 同伴学习的直接证据（CHALLENGE-A4, A11）
2. AI 自学课堂是 meta-analysis 显示效应最弱的形态（CHALLENGE-A1）
3. 五声部分类是 ad hoc 设计而非文献综合（CHALLENGE-A14）

**工程局限**：
1. LLM persona controllability 没有可靠测量（CHALLENGE-A13）
2. 教材本体是 LLM 生成 + 人工抽检的混合产物，非真正 ground truth（CHALLENGE-A17）
3. SM-2 算法对 maolab 的使用频率假设需重新调参（CHALLENGE-A16）

**实证局限**：
1. 当前的内部审计是质性的，atom 池分布缺客观统计（CHALLENGE-A6）
2. 验收指标 N=3 访谈构成 formative evaluation，非 summative（CHALLENGE-A10）
3. 教学法 ↔ 知识类型映射表未经文献校验（CHALLENGE-A7）

**未来工作**：
1. 先导研究：N=20 学生，比较"有同学 persona"vs"仅老师 persona"两组的代入感量表与学习产出
2. 在 worked-example 中插入 self-explanation 提示，比较 forethought-heavy vs performance-heavy 的元认知设计
3. 与某个有"教师 + AI 助手"配置的真实学校合作，做 teacher-directed vs self-directed 对照
4. 量化 LLM 在 persona prompt 下的行为漂移：N 次生成中，"猫叔说话风格"在量化指标上的稳定性

---

## 11. 结论

maolab 的诊断揭示了 AI 教学产品的一类共性问题——理论标签写入但渲染层不消费。重构的核心是把"教学法"从备课层的装饰下降到 atom 池与渲染决策的承重位置：worked example 与 narrated explanation 与 quiz 同级；课首课尾元认知钩子强制存在；persona 库以"缺点"为承重柱。

我们诚实承认这是一组**赌注**：(1) 同学 persona 的替代性学习效应能在 AI 形态中复现；(2) 复杂的教学法约束在产品层不会输给"简单 AI 导师"；(3) 严格的 atom 池结构对自学场景的增益能补回 self-directed vs teacher-directed 的 effect-size 差距。

这些赌注每一条都可能错。本文用 18 处 `[CHALLENGE]` 标注让赌注显式化，是因为我们认为：在 AI 教育这个证据稀薄、产品形态尚未收敛的领域，**诚实标注赌注比掩盖赌注更接近科学态度**。下一步的工作不是辩护这些赌注，而是把它们逐一转换为可验证的实证设计。

---

## 参考文献

- Bandura, A. (1977). *Social Learning Theory*. Englewood Cliffs, NJ: Prentice Hall.
- Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In J. Metcalfe & A. Shimamura (Eds.), *Metacognition: Knowing about knowing*.
- Cheng, L., Shi, H., Wu, Y., & Li, F. (2026). Do Generative AI-Powered Pedagogical Agents Improve Learners' Academic Performance Effectively? Evidence From Meta-Analysis. *Journal of Educational Computing Research*.
- Damon, W., & Phelps, E. (1989). Critical distinctions among three approaches to peer education. *International Journal of Educational Research*, 13(1).
- Deci, E. L., & Ryan, R. M. (1985). *Intrinsic Motivation and Self-Determination in Human Behavior*. Plenum.
- Deci, E. L., & Ryan, R. M. (2000). The "what" and "why" of goal pursuits: Human needs and the self-determination of behavior. *Psychological Inquiry*, 11(4).
- Dweck, C. S. (2006). *Mindset: The New Psychology of Success*. Random House.
- Fiorella, L., & Mayer, R. E. (2016). Eight ways to promote generative learning. *Educational Psychology Review*, 28.
- Journal of Teaching and Learning (2025). Leveraging "Khanmigo" Generative AI-Powered Tool for Personalized Tutoring to Learn Scientific Concepts. Vol. 19, No. 4.
- K-12 Dive (2025). 3 questions for K-12 leaders to consider amid the AI tutoring boom.
- Khan Academy Blog (2024). Khan Academy Efficacy Results, November 2024.
- Kirschner, P. A., Sweller, J., & Clark, R. E. (2006). Why minimal guidance during instruction does not work. *Educational Psychologist*, 41(2).
- Mayer, R. E. (2014). *The Cambridge Handbook of Multimedia Learning* (2nd ed.). Cambridge University Press.
- Pekrun, R. (2006). The control-value theory of achievement emotions. *Educational Psychology Review*, 18(4).
- Pekrun, R. (2024). Achievement emotions: A control-value theory perspective. *Annual Review of Psychology*.
- Renkl, A. (2014). Toward an instructionally oriented theory of example-based learning. *Cognitive Science*, 38(1).
- Roediger, H. L., & Karpicke, J. D. (2006). Test-enhanced learning: Taking memory tests improves long-term retention. *Psychological Science*, 17(3).
- Sun, et al. (2024). Enhancing Teaching Strategies through Cognitive Load Theory: Process vs. Product Worked Examples. *Education Sciences*, 14(8).
- Sweller, J. (1988). Cognitive load during problem solving. *Cognitive Science*, 12.
- Sweller, J., van Merriënboer, J. J. G., & Paas, F. (1998). Cognitive architecture and instructional design. *Educational Psychology Review*, 10.
- Vygotsky, L. S. (1978). *Mind in Society: The Development of Higher Psychological Processes*. Harvard University Press.
- Wang, M., Zhang, D., Zhu, J., & Gu, H. (2025). Effects of Incorporating a Large Language Model-Based Adaptive Mechanism Into Contextual Games. *Journal of Educational Computing Research*.
- Xu, et al. (2025). AI support in self-regulated learning: A decade of technological evolution and meta-analysis. *British Journal of Educational Technology*.
- Xu, et al. (2025). Enhancing self-regulated learning and learning experience in generative AI environments: The critical role of metacognitive support. *British Journal of Educational Technology*.
- Zimmerman, B. J. (2002). Becoming a self-regulated learner: An overview. *Theory Into Practice*, 41(2).
