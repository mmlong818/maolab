# maolab · 猫咪的教学研究室

把一个知识点，变成一节**真的能上的课**。

不是生成教案文档，是生成可以直接在教室里演出来的课堂——教师坐进导演椅，
AI 教研组在背后打磨每一幕。

## 这东西做什么

教师选定教材知识点，系统跑完整条管线产出一节课：

```
教材知识点(KP) → 教学计划 → 节目单 → 课堂原子(幕)
                                        ↓
                        备课工作台 ← 教师逐页改 → 上课舞台
```

- **备课**：三栏工作台（结构树 / 画面预览 / 检查面板）。教研简报把误概念预警、
  fact-audit 结果、班级薄弱点摊在教师面前——不是「AI 说这样好」，是「为什么这样设计」有据可查。
- **上课**：「老师 + 同学」人设演出（课堂 1 位同学，排练场按场景另选 1 位陪读），教师可切双师模式（`executor` 字段标明每一幕
  由教师亲授、AI 演示还是两人配合），舞台带批注画布。
- **闭环**：学生作答 → 掌握度 → 复习建议 → 下一节课的骨架加权。

## 与「AI 生成教案」的区别

三件事是刻意做的，也是这个项目的赌注：

1. **内容正确性是架构问题，不是审核问题。** 光路图这类确定性内容，LLM 只提供原始
   物理量（物距/焦距/入射角），光线路径由渲染器按几何光学定律算出——错误光路在
   架构上不可能被生成。见 `app/app/lib/mainline/presentation/optics.ts`。
2. **质量闸门会真的拦课。** `fact-audit` 检出事实错误即 `blocked`，课上不了。
   不是打分提示，是硬阻断。
3. **AI 素养长在学科课里。** 骨架层有 `ai-verify`（找 AI 的茬）/ `ai-inquiry`
   （问出让 AI 暴露边界的问题）/ `ai-collab`（评提示词质量而非答案）三种幕型，
   不是另开一门 AI 课。

## 快速开始

```bash
pnpm install
pnpm db:init      # 初始化 SQLite
pnpm dev          # 开发模式
```

```bash
pnpm build        # 构建
pnpm test         # 测试
pnpm typecheck    # 类型检查
```

## 仓库结构

pnpm workspaces monorepo，Next.js 15 + TypeScript + Drizzle ORM + SQLite。

```
app/                    # Next.js 前端 + API 路由
  app/(setup)/          #   创建流
  app/(classroom)/      #   备课工作台 / 上课舞台
  app/api/v2/mainline/  #   主线管线端点
  app/lib/mainline/     #   领域模型 / 生成管线 / 质量闸门 / 呈现系统
packages/
  shared-types/         # 核心类型（被全库引用）
  db/                   # SQLite 仓储层
  generator/            # 内容生成管线
  classroom/            # 课堂实时引擎
  presgen/              # 幻灯片生成与 PPTX 导出
  setup/                # 课程设置/规划设计器
  textbook-index/       # 教材目录索引 + KP 关系图
  llm-shared/           # LLM 共享工具
  user-profile/         # 用户档案/学情
docs/                   # 设计文档，入口见 docs/README.md
tasks/                  # PRD / 战略 review / 任务拆解 / lessons
```

## 质量体系

产品质量靠两层，缺一不可：

- **自动闸门**（`app/app/lib/mainline/quality-gates.ts`）：事实错误、结构违规、
  版式问题在生成期拦截，`blocked` 的课不允许上线。
- **真实检查**：以领域双专家身份走完整条真实使用路径，逐幕检查，小问题即时修。
  历轮报告在 `docs/real-check/`，是这个项目的质量宪法。

## 当前进度

现行方案 `docs/v5-master-plan-2026-07-20.md`「教师的排练剧场」：

| 里程碑 | 状态 |
|---|---|
| M1 导演椅（备课工作台 + 逐页编辑 + 教研简报 + PPTX 导出） | ✅ round13 验收 |
| M2 双师课（`executor` 分工 + 三个 AI 素养幕型） | ✅ round14 验收 |
| M3 排练场（模拟学生 + 排练报告 + 回改闭环） | 未开工 |

当前任务拆解见 `tasks/v5-m3-and-backlog-2026-07-27.md`。

## 文档入口

- **设计方案总索引**：`docs/README.md`
- **现行总方案**：`docs/v5-master-plan-2026-07-20.md`
- **最新质量基准**：`docs/real-check/2026-07-23-production/REPORT.md`
- **经验沉淀**：`tasks/lessons.md`

## AI 协作

本仓库由 Claude Code 与 Codex 共同开发，协议见 `.collab/README.md`
（单写多读信箱 + 路径认领）。两个 Agent 的项目指令分别在 `CLAUDE.md` 与 `AGENTS.md`。

## 许可

Maolab 以**非商用源码开放**形式发布，采用
[PolyForm Noncommercial License 1.0.0](LICENSE.md)。个人学习、研究、实验，以及许可证列明的
教育机构和其他非商用组织，可以按条款使用、修改和分发本软件。其他商业用途不在本许可证
授权范围内，需另行取得云一工作室书面授权。

项目依赖、字体和第三方素材仍分别适用其原有许可证或权利声明；本项目许可证不会扩大这些
第三方内容的授权范围。版权声明见 [NOTICE](NOTICE)。
