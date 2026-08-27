# PRD v2 — 教材源 + 三层真理 + 专家思考流

> 版本: v2 (重写)
> 日期: 2026-05-21
> 触发: v1 完成阶段 A 后, 吸收"K12 专家备课思维流 v2.2"成熟设计
> 状态: 待评审

**关系**:
- PRD v1 (`PRD-textbook-source.md`) — 仅"教材作为内容源"，**结构上仍是单源 + LLM 自由发挥**
- **PRD v2 (本文)** — 升级为"**三层真理 + 4 类数据源 + 11 专家任务 + 5 阶段心法**"

---

## 1. 北极星升级

### v1 北极星
> 每页 atom 可追溯教材原文（或明确标"AI 拓展"）。

### v2 北极星 (修订 2026-05-21)
> **生成的每一页内容都遵守"三层真理优先级"**：
> 1. **课程标准** (教育部颁布,学业要求原文)
> 2. **教师参考** (出版社配套,板书设计/教学提示/课时建议)
> 3. **教材正文** (人教/统编)
> 4. AI 推理 (仅在前三层不足时启用,且强制标记 `isExtension`)

**为什么不单独列"素养教案"作为第一层**:
- 原参考设计 (PDF v2.2) 把"素养教案"定为最高基线
- 但**国家平台是否有这条独立数据未验证**,可能 (a) 真有 (b) 没有,需用教师参考+课标合成
- v2 决策: **不依赖单独的"素养教案"数据源**,改为
  > "**合成基线 = 课标条款 + 教师参考要点**" — 由 `专家思考: 课标筛选整合` 任务在线生成
- 若 B 阶段探查发现 CDN 真有素养教案,作为额外锦上添花,不阻塞主流程

凡是课标有的、教师参考有的、教材有的,**AI 不许改写、不许新增、不许举例**。

---

## 2. 数据源 (2026-05-21 CDN 实测重写)

**重大发现**: maolab 之前接的 `tch_material` 只是"教材文件"端点; 真正的备课金矿在 `national_lesson` 端点 (即国家平台"课程教学"页所用)。

### 实证 API 路径 (curl 已验证)

```
教材索引 (旧):
  s-file-1.ykt.cbern.com.cn/zxx/ndrs/resources/tch_material/version/data_version.json  ✅ A-1 已用

教材索引 (新, national_lesson 体系):
  s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/version/data_version.json

单本教材章节树 (★零 AI 成本):
  s-file-1.ykt.cbern.com.cn/zxx/ndrv2/national_lesson/trees/{textbookId}.json
  → 嵌套 child_nodes 树, 含 id/title/node_path

单本教材的配套资源清单:
  s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/{textbookId}/resources/parts.json
  s-file-1.ykt.cbern.com.cn/zxx/ndrs/national_lesson/teachingmaterials/{textbookId}/resources/part_*.json
  → 每条是 1 节"国家课"(national_lesson), 关联 chapter_ids/chapter_paths
  → 含 teacher_list(主讲) + faculty_advisor_list(教研顾问,正高级) + provider_list(出版社)

每节国家课的 5 类子资源 (national_lesson.relations.national_course_resource[]):
  micro_lesson_video      微课视频
  coursewares             课件 (PPT)
  lesson_plandesign       ★教学设计 (= 素养教案等价物)
  learning_task           学习任务
  after_class_exercise    课后练习

lesson_plandesign 实际内容:
  custom_properties.preview = { Slide1, Slide2, ... } 逐页 JPG
  URL: r{1,2}-ndr.ykt.cbern.com.cn/edu_product/esp/lesson_plandesign/{id}.t/zh-CN/{ts}/transcode/image/N.jpg
  一页 ~500KB jpg; PDF 直链 403 (必须 vision OCR)
```

### 数据源新映射

| 真理层 | 数据源 | 位置 | 当前状态 |
|---|---|---|---|
| 第一基线 | **教学设计** (lesson_plandesign) | 每节国家课的子资源 | ✅ 路径验证 / 待 OCR |
| 第二基线 | **课件** (coursewares) | 每节国家课的子资源 | ✅ 路径验证 / 待 OCR |
| 第三基线 | **教材正文** | tch_material 或 national_lesson teachingmaterials | ✅ tch_material 已入 188 本 |
| 锦上添花 | 学习任务 / 课后练习 / 微课视频 | 同上 | ✅ 可用 |
| AI 推理 | (前四层不足时) | — | 强制标 `isExtension` |

### 结论
- **不再需要找"课标 CDN / 教师参考 CDN / 素养教案 CDN"** — 这三个之前以为缺,实际都在 national_lesson 资源包里
- national_lesson 是"国家级专家做的全套备课材料",**每章节对应一个完整资源包**,由特级 / 正高级教师团队制作 — 天然就是第一真理基线
- B 阶段从"接 3 套独立数据源"简化为"**接 1 套 national_lesson + 写 OCR pipeline**"

### lesson_plandesign 覆盖率分布 (2026-05-21 实测,6470 节国家课)

| 覆盖度 | 学段/学科 |
|---|---|
| **100%** | 艺术(舞蹈/影视/戏剧/音乐/美术) 小学+初中、小学数学 |
| **60-74%** | 主科 (初中物理/化学/数学/语文/历史/英语, 高中历史) |
| **24-67%** | 中等 (初中道德与法治、小学道德与法治、高中地理) |
| **0-16%** | 体育与健康各学段、高中美术 |

**B-2 OCR pipeline 设计含义**:
- 主科有 60-100% 教学设计可用 → 主路径
- 缺失时回退 coursewares (课件,82.7% 总覆盖) 作第二基线
- 全无时回退 learning_task + after_class_exercise 拼接
- 仍无 → 退到 AI 推理 + `isExtension=true` 标记

---

## 3. 五阶段心法 + 16 步骤

```
核心心法: 想一想 (Assess) → 动手做 (Execute) → 看一眼 (Verify)
```

替换 maolab 当前 7 步 (内容/完整度/目标/教法/提纲/讲稿/内容页)。

### 阶段零 准备
- **0.1 调整状态** — 检查 API/Token，载入专家人设包

### 阶段一 需求摸底
- **1.1 搞清要求** — 六大要素 [学科, 学段, 年级, 版本, 学期, 单元]
  - 缺学科/年级 → 硬门槛阻塞,必须问
  - 缺版本 → 静默补人教版 (与现有 A-3 UI 一致)

### 阶段二 搜集素材
- **2.1 翻教材查教参** (并发执行 3 个检索)
  - `textbook_catalog_search` ✅ 已有 (A-1)
  - `teaching_reference_search` ❌ 待接
  - `literacy_lesson_plan_search` ❌ 待接
- **2.2 划重点** → 调用「专家思考: 关键词提取」(3-8 个词)
- **2.3 对标国家标准** → `knowledge_keyword_search` ❌ 待接

### 阶段三 备课思考 (Deep Thinking)
- **3.1 定调子** → 调用「专家思考: 课标筛选整合」
  - 规矩: 素养教案为基线，**不许编造课标，不许改写术语**
- **3.2 吃透教材和学生**
  - 「专家思考: 教材内容解析」→ 四栏 (地位 / 核心问题 / 逻辑 / 知识结构图)
  - 「专家思考: 学情分析四栏」→ 预判 3-5 个具体坑 + 填坑策略
- **3.3 定目标抓重难点** → 调用「专家思考: 学习目标&重难点」
  - 红线 1: **严禁举例** (不得出现"如/例如/比如/括号/引号")
  - 红线 2: 素养标签 4-7 个

### 阶段四 设计教案
- **4.1 搭架子** → 调用「专家思考: 教学活动结构」
  - 死规矩: 大任务名称 = 教材目录小节标题**一字不差**
- **4.2 分课时** → 调用「专家思考: 课时安排推断」(一般 8-12 课时, 整数, 留复习考试)
- **4.3 想怎么考** → 调用「专家思考: 评价方案设计」(过程性 + 终结性 + Rubric)
- **4.4 课后复盘** → 调用「专家思考: 教后反思模板」(三问框架)

### 阶段五 完稿交付
- **5.1 安检** → 「专家思考: 整合模板检查」
  - 查漏: 阶段三/四 7 个模块少一个都不行
  - 修补: 数学公式自动加 `$$`
- **5.2 生成文档** → 当前的 atoms-only + scripts (无损,不许缩写)
- **5.3 收工** → terminate

---

## 4. 11 个"专家思考"任务

把当前粗放的 `analyze / method-plan / rundown / script / atom` 5 个 worker，**重构为 11 个细分任务**：

| # | 任务 | 当前 maolab 对应 | 改造点 |
|---|---|---|---|
| 1 | 起始信息确认 | (无) | 新增,六大要素门槛 |
| 2 | 关键词提取 | (无) | 新增,从教材+教参+素养教案提取 3-8 词 |
| 3 | 课标筛选整合 | (无) | 新增,**第一真理基线** |
| 4 | 教材内容解析 | 部分在 analyze | 改造,四栏结构 |
| 5 | 学情分析四栏 | 部分在 analyze | 改造,3-5 个坑 + 策略 |
| 6 | 学习目标&重难点 | 在 material-audit | **加红线: 严禁举例** |
| 7 | 教学活动结构 | rundown | **加死规矩: 名称=目录原文** |
| 8 | 课时安排推断 | (隐式) | 显式化,整数 + 留复习 |
| 9 | 评价方案设计 | (无,B3 进度审计算半个) | 新增 Rubric |
| 10 | 教后反思模板 | (无) | 新增三问框架 |
| 11 | 整合模板检查 | (无) | 新增 System Audit |

---

## 5. 六大硬规矩 (Hard Rules)

**直接抄进 atom-worker / script-worker SYSTEM_BASE prompt**:

| # | 规矩 | 适用对象 | 强制度 |
|---|---|---|---|
| R1 | 学习目标**严禁举例**: 不得出现 "如/例如/比如/括号/引号" | 学习目标 / 重难点 | 红线 |
| R2 | 教学活动**大任务名称必须 = 教材目录小节标题** (一字不差) | rundown segments | 红线 |
| R3 | 公式必须用 `$$` 包裹 | 所有 payload 字段 | 红线 |
| R4 | 课时是整数,含复习+考试 | 课时安排 | 硬约束 |
| R5 | 素养标签 4-7 个 | 学习目标 | 硬约束 |
| R6 | 学段术语/句长匹配学段 (小/初/高中/大学分级) | 所有面向学生文本 | 已有 (`fix(atom-gen): 学段约束`) |

---

## 6. 兜底与重试

### 兜底机制
```
IF 素养教案为空 OR 待补充 OR 关键字段缺失 > 50%
THEN web_search 检索:
  1. 国家中小学智慧教育平台
  2. 出版社官网
  3. 省市教研院
  4. 权威校本资源
```

### 关键词简化重试 (上限 3 次)
```
尝试 1: 原关键词
尝试 2: 去修饰词 ("二元一次方程组的应用" → "二元一次方程组")
尝试 3: 用单元序号
全失败 → 标"待补充"继续 (不中断流程)
```

### 异常处理
```
工具调用失败 → 重试 (现有 atom-worker 已有 MAX_RETRIES=2) → 标"待补充" → 继续
单 segment 失败 → 跳过,继续下一段 (现有 generate-pipeline 已有)
```

---

## 7. 重新规划阶段 A/B/C

### **阶段 A (已完成 3/4, 修订口径)**
- ✅ A-1 教材索引同步 (188 本)
- 🚧 **A-2 章节树拉取 (重写)**: 用 `ndrv2/national_lesson/trees/{id}.json` 直接拉,**零 AI 成本**, 同时引入"单元"维度
- ✅ A-3 /create 教材选择器 UI (含 Tab)
- ✅ A-4 textbookSource 类型字段

### **阶段 B (大幅简化, 1.5 周)**
- B-1 国家课资源索引: 拉每教材的 `national_lesson/teachingmaterials/{id}/resources/part_*.json`, 索引到章节
- B-2 lesson_plandesign vision OCR pipeline: 拉 JPG → 调 GPT-4o-vision → 缓存到 `data/lesson-design-cache/{lessonId}.json`
- B-3 (可选) coursewares OCR (PPT 课件,可作为补充基线)
- B-4 重构 audit 为 3 个专家任务: 关键词提取 / 教学设计整合 (替代"课标筛选整合") / 教材内容解析
- B-5 重构 plan 为 2 个专家任务: 学情分析四栏 / 学习目标&重难点
- B-6 **真理注入**: atom-worker 接收 `lessonPlanBaseline = OCR(lesson_plandesign)` 强制 grounded

### **阶段 C — 专家任务 7-11 + 硬规矩 + 安检 (1.5 周)**
- C-1 重构 rundown 为 "教学活动结构" 专家任务 + R2 死规矩
- C-2 课时安排专家任务 (隐式 → 显式)
- C-3 评价方案设计 (Rubric + 形成性 + 终结性)
- C-4 教后反思模板
- C-5 整合模板检查 (System Audit, 7 模块完整性)
- C-6 6 大硬规矩注入 atom-worker / script-worker prompt

### **阶段 D — 兜底 + 重试 (1 周)**
- D-1 关键词简化重试 (3 次,标准化逻辑)
- D-2 web_search 兜底 (素养教案缺失时)
- D-3 isExtension 字段 + UI "AI 拓展"标签 (从 v1 阶段 C 移过来)
- D-4 教师审阅页"剔除拓展" 操作

**总时长**: 阶段 B (2 周) + C (1.5 周) + D (1 周) = **4.5 周**, 比 v1 (6 周) 反而更聚焦。

---

## 8. 立刻可做 (无需等接三源)

**5 个改动可在 1 天内做完,无需等 B/C/D**:

| # | 改动 | 文件 | 工作量 |
|---|---|---|---|
| Q1 | atom-worker prompt 加 R1 "严禁举例" | atom-worker.ts | 5 行 |
| Q2 | atom-worker prompt 加 R3 公式 `$$` 包裹 | atom-worker.ts | 3 行 |
| Q3 | TextbookPicker 加"单元"下拉 (依赖 A-2 数据) | TextbookPicker.tsx + chapters.json | 半天 |
| Q4 | rundown 生成校验 R2: 大任务名 ∈ 目录章节列表 | rundown.ts | 半小时 |
| Q5 | course-state UI 加 "六大要素就绪" 红黄绿灯 | audit 页 | 1 小时 |

---

## 9. 风险与权衡

| 风险 | 缓解 |
|---|---|
| 教师参考 / 素养教案 / 课标 CDN URL 未知 | B 阶段第一周做探查 (类似 A-1 教材) |
| 素养教案覆盖度不全 (新教材可能没) | web_search 兜底 + isExtension 标 |
| 11 个专家任务串联,Token 成本上涨 | 任务并发 + 中间结果缓存 |
| 现有课程数据迁移 | textbookSource 字段已加 (A-4),旧课程仍跑老流程,新课程走新流程 |

---

## 10. 决策 (v2)

1. ✅ **真理优先级** (2026-05-21 修订): 课标 > 教师参考 > 教材正文 > AI 推理
   - 不依赖独立"素养教案"数据源,改为由"课标筛选整合"专家任务**合成基线**
   - 若 B 阶段探查发现 CDN 有素养教案,作为锦上添花,不阻塞
2. ❓ 是否同意把 maolab 7 步流程**重命名**为 5 阶段 16 步骤?
   - 替代方案: 内部仍 7 步, UI 仅展示新名称
3. ❓ 11 个专家任务是用 **prompt 模板** 实现 (轻量) 还是建独立的 expert-worker 模块 (重)?
4. ✅ **B 阶段顺序** (2026-05-21): 课标 (B-1) → 教师参考 (B-2) → 素养教案探查 (B-3 可选)
5. ❓ 立刻可做 Q1-Q5 是否现在做 (1 天) 还是合并到 B/C?

---

## 附录: 致谢

本 PRD 设计大量借鉴 "K12 专家备课思维流 v2.2" (D:/桌面)，三个核心 PDF:
- 《完整信息》— 工具/规则/决策点详尽列表
- 《什么是专家思考》— 黑盒分析模块定位
- 《K12 专家备课思维流 v2.2》— 5 阶段心法 + 6 硬规矩

这套设计已在另一个项目验证可行,maolab 直接吸收其架构。
