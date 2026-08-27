# maolab 设计文档索引

> 最后整理：2026-08-21。状态标记：🟢 现行生效 · 🟡 规划/进行中 · 📦 已归档（见 [项目外归档说明](project-archive.md)）
>
> 当前任务拆解：[../tasks/v5-m3-and-backlog-2026-07-27.md](../tasks/v5-m3-and-backlog-2026-07-27.md)
> ——A 轨出品阻断 → B 轨收尾债 → C 轨 M3 排练场。
> **C 轨（M3 排练场）已于 2026-07-28 全部落地**：引擎 / 同学选型路由 / 排练室 /
> 报告 / 按幕回改闭环，另加 C-0'（零学情只演绎不出报告）与种子学情工具。

## 一、现行架构与产品方向（必读）

| 文档 | 状态 | 说明 |
|------|------|------|
| [v5-master-plan-2026-07-20.md](v5-master-plan-2026-07-20.md) | 🟢 | **v5 总方案：教师的排练剧场**——转向教师备课工具 + AI 时代课型：**M1 导演椅已落地**（round13 验收）/ **M2 双师课已落地**（round14 验收；`executor` 字段 + `ai-verify`/`ai-inquiry`/`ai-collab` 三幕型均在 `domain.ts`）/ **M3 排练场已落地**（2026-07-28；`app/app/lib/mainline/rehearsal/**` + `(classroom)/mainline/[courseId]/rehearse`，teacher/self-study 双场景，报告每条强制带 `evidence`） |
| [../tasks/STRATEGIC-REVIEW-2026-07-20-teacher-prep-landscape.md](../tasks/STRATEGIC-REVIEW-2026-07-20-teacher-prep-landscape.md) | 🟡 | v5 外部证据层：2026 教师备课 AI 竞品格局 + AI 时代教育共识 + 五大市场空白 |
| [v4-master-plan-2026-07-13.md](v4-master-plan-2026-07-13.md) | 🟢 | **v4 总方案：有记忆的课堂剧场**——M1 教研资产层 / M2 课程季 / M3 学情闭环 **均已落地**（PR #8-#11，真检 round09/10/11 验收） |
| [../tasks/STRATEGIC-REVIEW-2026-07-ACPF.md](../tasks/STRATEGIC-REVIEW-2026-07-ACPF.md) | 🟢 | 战略对标 ACPF 内容工厂：三大卖点(形态/引擎/闭环) + 三项借鉴(隐喻表/语气路由/事实分级) |
| [project-redesign-2026-06-30.md](project-redesign-2026-06-30.md) | 🟢 | 项目重启设计：从旧 v2 能力收拢到 Course / Scene / Stage / Quality Gate 新主线 |
| [product-quality-contract-2026-08-21.md](product-quality-contract-2026-08-21.md) | 🟢 | **课程品质统一契约**：教材知识点 → 学习目标 → 教学活动 → 学习证据 → 反馈与修正；统一教育学、认知心理学、美学、传播学与教育游戏化验收口径 |
| [CORE_VS_EXPERIMENTAL.md](CORE_VS_EXPERIMENTAL.md) | 🟢 | 重启执行边界：核心、支撑、实验、隔离、旧只读能力清单 |
| [architecture-v3-creation-flow.md](architecture-v3-creation-flow.md) | 🟢 | 当前架构：7 步创作流程显式化 + 节目单播放器 + Stepper UI，代码已落地 |
| [architecture-v2.md](architecture-v2.md) / [architecture-v2-COMPLETED.md](architecture-v2-COMPLETED.md) | 📦 | v2 全链路设计与交付总结（三关审批、8 种 atom、生成管线、课堂实时）。**2026-07-28 加了退役横幅**：全文的 ✅ 是历史事实不是现状，其列出的 `/api/v2/*` 端点除 `live`（410 桩）外目录均已删除。留档价值在当时的权衡记录 |
| [classroom-experience-design.md](classroom-experience-design.md) | 🟢 | 课堂体验三阶段升级：P1 语音（完成）→ P2 广播剧（完成）→ P3 被注视感（进行中） |
| [pedagogy-v2-roadmap.md](pedagogy-v2-roadmap.md) | 🟢 | 教学法迁移路线（流程导向→教学法导向），是 classroom-experience 的理论层 |
| [../tasks/PRD-textbook-source-v2.md](../tasks/PRD-textbook-source-v2.md) | 🟢 | 教材源集成 PRD v2：三层真理优先级 + 4 数据源（阶段 A 已完成） |

## 二、规划中 / 待落地

| 文档 | 状态 | 说明 |
|------|------|------|
| [presentation-system-design.md](presentation-system-design.md) | 🟡 | **演示内容呈现系统**：排版多样化/标准化/模板化/媒体节点入课内（P1 已完成，混合方向已拍板） |
| [classroom-script-design.md](classroom-script-design.md) | 🟡 | **课堂导演场本**：解决师生割裂感——谁说什么/起什么作用/发生什么的全课剧本层（2026-06-13 草案） |
| [content-presentation-design.md](content-presentation-design.md) | 🟡 | atom 语义呈现器（9 种）+ 课程视觉主题，部分被 presentation-system-design 吸收推进 |
| [media-remix-design.md](media-remix-design.md) | 🟡 | 课后演绎工坊（歌谣/漫画/播客版），概念阶段 |
| [knowledge-ontology-v1.md](knowledge-ontology-v1.md) | 🟢 | 知识本体 v1 现行设计（双层粒度 + 六维打标，KP 数据集已发布） |
| [knowledge-ontology-v1.1.md](knowledge-ontology-v1.1.md) + [knowledge-ontology-migration-plan.md](knowledge-ontology-migration-plan.md) | 🟡 | v1.1 多来源/跨课程规划 + 迁移路线，均未启动 |
| [open-decisions.md](open-decisions.md) | 📦 多数失效 | D1–D8 待决策矩阵。**D1/D2 已于 2026-07-28 核销**——不是拍了板，是前提不成立（三档梯度从未落地、三阶段计划已被 v4/v5 取代），依据写在该文 §0。D3–D8 同源自已退役的 pedagogy-v2 路线图，**未逐条核实，别当活决策直接执行** |

## 三、专题与支撑文档

- [persona-library.md](persona-library.md) / [persona-scheduling.md](persona-scheduling.md) — 老师与同学人设定义（猫叔 + 林小满/阿哲/小渔三位同学草案）与实时调度
- [pedagogy-v2-paper.md](pedagogy-v2-paper.md) — 教学法学术论证（roadmap 的前置研究）
- [sample-dialogue-perspective.md](sample-dialogue-perspective.md) — 对话样本设计
- [textbook-labeling-pipeline.md](textbook-labeling-pipeline.md) — 教材标注管线
- [phase-a-implementation-plan.md](phase-a-implementation-plan.md) / [phase-a-test.md](phase-a-test.md) — 阶段 A 教材选择器（已完成，留作记录）
- [pilot-reports/](pilot-reports/) — KP 抽取试点验证（高中物理）
- [superpowers/](superpowers/) — plans / specs
- [../tasks/STRATEGIC-REVIEW-2026-05.md](../tasks/STRATEGIC-REVIEW-2026-05.md) — 战略对标（Khanmigo / Magicschool）
- [../tasks/lessons.md](../tasks/lessons.md) — 经验沉淀（活文档）
- [code-review-2026-06-13.md](code-review-2026-06-13.md) — 代码质量审查留档（2 项已修，H-2/H-3/H-4/H-6 等待处理）

## 四、真实检查（real-check/）

- [real-check/2026-07-23-production/](real-check/2026-07-23-production/) — **当前状态基准**：正式出品级全科目 × K12（8 门真课）。初判 3/8 blocked，即时修正后 7/8 passed；物理光路课因缺渲染器仍 blocked → 待决①「typed-content P0 渲染器」（已于 2026-07-27 落地首枚光路渲染器）、待决②「fill 后无自动修复回路」
- round01–round14 的截图、PPTX 解包文件与阶段报告已移到[项目外归档](project-archive.md)。里程碑结论仍保留在现行总方案和任务复盘中，需要原始证据时按清单恢复。

## 五、项目外归档

- [project-archive.md](project-archive.md) — 记录项目外专用归档的位置、范围、保留规则和恢复方式。旧方案、历史真检、数据库备份、日志、可重建缓存与无引用生成图不再占用主项目目录。

## 已知待决事项（截至 2026-07-28）

完整拆解见 [../tasks/v5-m3-and-backlog-2026-07-27.md](../tasks/v5-m3-and-backlog-2026-07-27.md)，此处只列长期悬置项：

1. ~~open-decisions D1/D2 未拍板~~ **已核销 2026-07-28**（前提不成立，依据见 open-decisions §0）。
   ~~核销时发现的悬空项：「间隔重复 + 跨课时调度」~~ **最小闭环已于 2026-08-21 落地**：
   现用既有掌握度与 `last_reviewed_at` 按 1/3/7/14 天安排下一次提取，课程库区分
   已到期与未到期项目，未到期时不允许立即重复；到期入口会明确生成 `review`
   学习时期课程，并先进入备课。复习课开场改为“闭卷提取→对照纠错→变式再答”，
   内容模型收到同一课级硬约束，不再把新授课换皮重讲。仍未实现的是通知推送、基于
   多次作答历史的个体化间隔估计和跨设备多用户调度；现阶段保持可解释的规则型方案。
   练习学情已同步升级为“揭晓前把握度 + 反馈后结果”：作答证据与掌握度同事务落库，
   规则区分稳定掌握、低估自己、已觉察困难和高把握误答，后者会优先进入修正与复习。
2. ~~高中数学教材尚未入库（v3 真检 R6 发现，至今未解）~~ **已解决 2026-07-28**：
   711 KP / 720 章节链接 / 822 关系边，误区与学习目标覆盖 100%，与初中数学同档。
   根因不在抽取环节——版本标签是 `人教A版` 而非 `人教版`，被同步白名单**静默**切掉，
   所以从 R6 一路活到今天。过滤器现在会打印被挡了什么。
   **连带发现一条需拍板的数据质量问题**：既有九个学科的 2 万余条 KP 关系边全部
   产自旧 UUID 回显协议，该协议会静默丢弃对不上号的边（新协议下高中数学 1.16 边/KP，
   旧协议下初中数学仅 0.70）。少算比例无法反推。选项见
   `tasks/v5-m3-and-backlog-2026-07-27.md` D-7：全量重跑 / 逐科重跑 / 维持现状。
3. 课堂体验 P3「被注视感」（学情插话/开小灶/同桌）进行中
4. `code-review-2026-06-13.md` H-2/H-3/H-4/H-6 未处理
5. **本文档曾停更两周**（07-13 → 07-27），期间 M2 已落地却仍标「进行中」。
   索引失真会直接误导后续判断，每轮真检收尾请顺手校准本文件。

## 已退役 / 文档与代码不符（2026-07-27 起核查）

- **「老师 + 4 同学」已作废**（2026-07-28 用户拍板）。实际是:课堂老师 + **1 位同学**；
  排练场再按场景选 **1 位陪读**，合计 1–2 人。理由是课程颗粒小，4 人互相稀释。
  `v5-master-plan-2026-07-20.md` §4 仍写「4 个虚拟学生」——**该文是 07-20 的方案留档，
  不改其正文**，以本条与 `tasks/v5-m3-and-backlog-2026-07-27.md` 的 C-1'/C-1'' 为准。

- `architecture-v2.md` §5.1 列为已完成的 `/api/v2/live/[sessionId]/sse` 等旧 live
  实时课堂端点**已于 2026-07-27 整体退役**（7 个路由统一返回 410，页面 307 导向
  Mainline）。**2026-07-28 复核发现不止 Sprint 5**：Sprint 0–4、6 的
  `analyze`/`plan`/`method-plan`/`rundown`/`showscript`/`script-only`/`atoms-only`/
  `course-state`/`backfill-images`/`narrate`/`script`/`lint`/`migrate-legacy`
  端点目录也全部已删。已在 `architecture-v2.md` 与 `-COMPLETED.md` 顶部加退役横幅
  ——写在索引里救不了直接打开那两个文件的人。
- ~~`app/scripts/run-new-design-two-course-check.cjs` 已是死代码~~
  **已删除 2026-07-28**。删前逐个核实过：它调用的 11 个端点中 10 个目录已不存在，
  仅剩的 `/api/v2/live` 也已是 410 桩，脚本确在 `/api/v2/analyze` 处即死。
