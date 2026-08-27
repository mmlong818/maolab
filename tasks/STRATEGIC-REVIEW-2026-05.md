# 战略审视: maolab 对标世界顶级 AI 教育平台

> 日期: 2026-05-22
> 触发: 三轮真检 + 6 大问题修复完成 (`d3a06bc`) 后的全局重新定位
> 目标: 让 maolab 成为"世界顶级教师 AI 备课平台 + 学生 AI 辅助自学平台"

---

## 1. 标杆扫描

### 教师 AI 备课侧

| 产品 | 核心能力 | 用户量级 |
|---|---|---|
| **Khanmigo for Teachers** | 学生进度分析 / 课件生成 / IEP / 家长沟通 | 200k+ 教师 |
| **Magicschool.ai** | 60+ AI 工具: 差异化、IEP、邮件、评语、问答 | 4M 教师 |
| **Curipod** | 互动课件 (实时投票/自由问答/AI 反馈) | 800k 教师 |
| **Brisk Teaching** | Chrome 插件,从任意网页生成课件/测验/反馈 | 600k 教师 |
| **Diffit** | 文本难度自适应 (同一文本生成 K-12 各年级版本) | 300k+ 教师 |
| **Newsela** | 资深玩家,新闻类内容多难度版本 | 国际 |

### 学生 AI 自学侧

| 产品 | 核心能力 | 用户量级 |
|---|---|---|
| **Khanmigo (学生)** | 苏格拉底式辅导,不直接给答案 | 200k+ 学生 |
| **Photomath** | 拍照解数学题,步骤化讲解 | 1.5 亿下载 |
| **Socratic by Google** | 拍照搜题 (多学科) | 国际 |
| **Duolingo Max** | 角色扮演 + 错题解释 (语言) | Pro 用户高粘性 |
| **Synthesis Tutor** | 1-on-1 数学辅导,情境化 | 高端付费 |
| **学而思九章 / 作业帮 / 猿辅导** | 国内拍照解题 + 视频讲解 | 千万级用户 |

---

## 2. maolab 当前定位与能力梳理

### 已建立的能力 (截至 2026-05-22)

**真理基线层** (独家护城河):
- 国家智慧教育平台教材索引 (302 本 K12 / 6470 节国家课)
- lesson_plandesign vision OCR 流水线 (qwen-vl-max → 结构化基线)
- coursewares 第二基线
- baseline-resolver 自动 grounding
- B-6 真实验证: 28/28 atoms 引用 baseline 原文 (周口店/灰烬层/直立人)

**专家备课流水线** (11 模块):
- audit / plan / method-plan / rundown / script / atoms 6 阶段闭环
- 8 个专家子任务: keyword-extractor / lesson-design-integrator / material-content-analyst / student-situation-analyst / objectives-keypoints-expert / lesson-time-planner / evaluation-designer / reflection-template
- 6 大硬规矩 (R1-R6) 注入全链路 SYSTEM
- 自动化系统审计 (7 模块完整性)

**学生侧执行能力**:
- 8 atomType: 图/论断/题/案例/对话/推导/演示/总结
- 教师授课模式 + 学生自学模式双轨
- 演出层 (beats) 时间轴
- 6 种教学方法 (lecture / interactive / socratic / flipped / case-study / quest)
- 互动题型: MCQ / 判断 / 简答 / 填空 + 即时反馈

### 用户验证 (真检数据)

| 维度 | R1 历史 (北京人) | R2 物理 (声音) | R3 体育 (羽毛球) |
|---|---|---|---|
| Baseline 注入 | 缓存命中 | 自动 OCR + 缓存 | 无 baseline 兜底 |
| grounded 比例 | 28/28 | (未跑 atoms) | 全 isExtension |
| audit 内容质量 | 高 (周口店 1921 年/裴文中/灰烬层 6 米) | 高 (4 个 critical 学情坑) | 中 (泛化问题已修) |
| experts 输出 | ✅ | ✅ | ✅ |

---

## 3. 对标后的优势 (3 个壁垒)

### 优势 1: 国家教材源真理基线 (中国市场独家)
- Khanmigo 用 Khan Academy 内部内容 (英文/美式课纲)
- Magicschool / Curipod 是"工具集合",不绑定特定教材
- **maolab 独家**: 直接对齐人教/统编/北师大 K12 教材原文 + 国家教学设计 OCR
- 战略意义: **进校刚需**,合规 + 教研可信 + 一线老师不需要"教 AI 我们用的教材"

### 优势 2: 完整专家备课流水线 (非工具集合)
- Magicschool / Brisk 是"工具货架": 60 个独立工具,老师自己拼
- **maolab**: 5 阶段心法 16 步骤 + 11 专家任务**串成一条线**,从选教材到内容页全程对齐
- 战略意义: **省时**,老师"开始做新课"到"可上课"端到端覆盖

### 优势 3: 学生执行实时性 (近"AI 上课")
- Khanmigo / Curipod 是"AI 助手 + 老师讲",学生侧是文本对话
- **maolab**: 直接生成可播放的内容页 (图/题/对话/推导),学生进入即可上课
- 战略意义: **完整使用闭环**,不依赖老师每节课二次加工

---

## 4. 对标后的缺口 (12 项,按战略价值排序)

### 教师备课侧 (P0-P2)

| 优先级 | 缺口 | 标杆 | maolab 现状 |
|---|---|---|---|
| **P0** | **差异化教学** | Diffit / Magicschool | 一份课对所有学生 |
| **P0** | **课中实时学情** | Curipod (实时聚合学生回答) | 课中只播放,无回流 |
| **P0** | **学情数据闭环** | Khanmigo (学生练习历史回灌) | 无学生侧持久化 |
| P1 | **教研社区/课件共享** | Curipod / Magicschool 内 | 无 |
| P1 | **家校沟通** | Magicschool / Brisk (家长邮件/会议) | 无 |
| P2 | **IEP / 特殊学生** | Magicschool | 无 |
| P2 | **多模态备课素材** | Curipod (整合视频/PPT) | 仅文本 + 生图 |

### 学生自学侧 (P0-P2)

| 优先级 | 缺口 | 标杆 | maolab 现状 |
|---|---|---|---|
| **P0** | **苏格拉底式真实对话** | Khanmigo | dialogue-turn 是预生成台词 |
| **P0** | **错题本 + 个性化路径** | 国内题库平台 | atoms 固定线性 |
| P1 | **拍照解题** | Photomath / Socratic | 无 |
| P1 | **学习记录 + 知识图谱** | Khanmigo / 九章 | 无 |
| P2 | **语音对话** | Khanmigo Voice / ChatGPT Voice | 无 |
| P2 | **手写公式识别 + 步骤校验** | Photomath / Mathlex | 仅文字 MCQ |

---

## 5. 战略选择 (建议路线)

### 短期 (3 个月) — 巩固教师侧主战场
打透"国家教材源真理基线 + 完整备课流水线"两大壁垒,**不分散**到学生拍照解题等红海。

**P0 三连击**:
1. **差异化教学引擎** — 同一份课程,生成 3 个难度版本 (基础/标准/进阶)
   - 实现路径: 复用 atom-worker,加 `difficultyLevel` 参数,在 SYSTEM 注入难度规则 (词汇/句长/题目梯度)
   - 价值: 直接打 Diffit,一线老师"备课一遍出三份"
2. **课中实时学情回流** — 学生答题数据 → 老师后台聚合
   - 实现路径: 已有 single-question 互动,加 `studentResponses` DB 表 + 教师 Dashboard
   - 价值: 直接打 Curipod 核心功能
3. **学情闭环 v1** — 课后自动生成"达成率/补救清单"
   - 实现路径: 已有 reflection-template,加学生答题数据进 prompt
   - 价值: 让 reflection 从静态模板变为数据驱动

### 中期 (3-6 个月) — 开始学生侧自学
学生侧选**与已有能力强协同**的方向:
4. **错题本 + 个性化路径** — 学生答错的 atom 自动归档,下节课优先复习
   - 强协同: 已有 atom-validator + atoms 序列
5. **真·苏格拉底对话** — 学生卡住时 AI 引导 (不直接给答案)
   - 强协同: 已有 dialogue-turn,加实时 LLM 接管模式

### 长期 (6 个月+) — 选择性扩展
6. 教研社区 / 课件共享市场
7. 多模态备课 (视频/PPT 集成)
8. 拍照解题 (可考虑接 Photomath API 或自研)

### 战略 NO
- ❌ 不做 IEP / 特殊儿童 (中国市场规模小)
- ❌ 不做家校沟通邮件 (国内 IM 是微信/钉钉,邮件场景弱)
- ❌ 不做语音对话 v1 (依赖 ASR 质量,投入产出比低)
- ❌ 不直接卷拍照解题 (红海,猿辅导/九章已是巨头)

---

## 6. 立刻行动项

### 本周内可启动 (基于已有代码)
1. **PRD: 差异化教学 v1**
   - atom-worker 加 `difficultyLevel: 'basic' | 'standard' | 'advanced'` 参数
   - audit 阶段产出 3 套 objectives (默认 standard, 同步生成 basic/advanced 候选)
   - UI: AtomsReview 页加"切换难度"开关

2. **PRD: 学情数据 schema v1**
   - 新表 `student_responses`: courseId / atomId / studentId / response / correct / submittedAt
   - 新接口 `/api/v2/student-response`: 学生提交答案时记录
   - 新页面 `/teacher/[courseId]/insights`: 课后聚合视图

3. **PRD: 错题本 v1**
   - 新表 `student_mistakes`: studentId / atomId / wrongAnswers[] / firstWrongAt
   - 学生自学模式答错时自动入库
   - 学生侧新页面"我的错题"

### 不立即做但需占位
- 教师 dashboard (P1)
- 课件分享/社区 (P1)

---

## 7. 北极星指标 (新)

旧北极星: "每页 atom 可追溯教材原文"

**新北极星 (双线)**:
1. 教师侧: **"老师 1 小时备完一节课,生成 3 个难度版本,课后看到学情聚合"**
2. 学生侧: **"学生在 maolab 自学 N 节课后,错题率下降 X%,系统能说出他薄弱的 3 个知识点"**

衡量:
- 教师端: 一节课从创建到 ready 用时 / 老师自评分 / 学情 dashboard 使用率
- 学生端: atom 完成率 / 错题二刷通过率 / 30 日复购率

---

## 8. 结论

maolab 不是"再造一个 Khanmigo / Magicschool",而是借**国家教材源**这条独家供应链 + **完整流水线**这条架构优势,在中国 K12 进校市场建立护城河。

短期不分散到学生拍照解题等红海,集中资源做"差异化教学 + 课中学情 + 课后闭环"三件事,把"教师 AI 备课平台"做到中国第一。

学生侧自学功能,基于已有 atoms 序列做"错题本 + 苏格拉底兜底"两件,**复用 80% 现有能力**。
