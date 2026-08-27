# maolab

## 启动必读：本仓库是双 Agent 协作

本项目**同时被 Claude Code 和 Codex 编辑，共享同一个工作树**。
开工前必须先读 `.collab/README.md`（协议正文），以及：

1. `.collab/LOCKS.md` —— 对方锁了哪些路径，锁住的不要碰
2. `.collab/mailbox-codex.md` —— 对方信箱（**只读**，不要编辑）

动手时往 `LOCKS.md` 追加一行认领路径，完工后删掉；
收工时只更新 `.collab/mailbox-claude.md`（自己的信箱）。给对方的提问用 `@codex:` 写在自己信箱里。

commit message 末尾加一行 `Agent: claude` 标身份。

---

猫咪的教学研究室——AI 课堂教学研究类应用。学生选教材知识点，系统生成完整课程（教学计划→节目单→课堂原子），在虚拟课堂中以「老师 + 同学」人设授课（语音/广播剧/互动）。

卡司规模（2026-07-28 核准，此前文档写「4 同学」与实现不符）：
- **课堂**：老师 + **1 位同学**（`cast-preset.ts` 每个学段×学科预设 1 师 1 生，同伴功能由这一位承担）
- **排练场**：课程同学 + **1 位按场景选出的陪读同学**，合计 1–2 人（`rehearsal/classmates.ts`）

颗粒小是有意的：课程本身幕数不多，4 个同学会互相稀释，每个人的反应都失去分量。
见 `docs/persona-library.md`「第一阶段：猫叔 + 一位同学，跑通模板；之后再扩」。

## 技术栈
- pnpm workspaces monorepo，Next.js 15 + TypeScript + Drizzle ORM + SQLite

## 结构
```
app/          # Next.js 前端 + API 路由（(setup) 创建流 / (classroom) 课堂 / api/v2）
packages/
  shared-types/    # 核心类型定义（被全库引用）
  db/              # SQLite 仓储层（Drizzle + 迁移）
  generator/       # 内容生成管线（教学计划 → 课堂原子）
  classroom/       # 课堂实时引擎（互动/测验/自适应）
  presgen/         # 幻灯片生成与导出
  setup/           # 课程设置/规划设计器
  textbook-index/  # 教材目录索引 + KP 关系图
  llm-shared/      # LLM 共享工具（提示词/客户端）
  user-profile/    # 用户档案/学情
scripts/init-db.ts # 数据库初始化
scripts/seed-rehearsal-mastery.ts # 排练场种子学情（分数由教材标注误区数推导，非随机；--clear 可撤销）
data/maolab.db     # SQLite 数据库（102MB，勿删）
docs/              # 设计文档，入口见 docs/README.md
tasks/             # PRD / 战略 review / lessons
```

## 启动
```
pnpm dev       # 开发模式
pnpm build     # 构建
pnpm test      # 测试
pnpm typecheck # 类型检查
pnpm db:init   # 初始化数据库
```

## 文档入口
- 设计方案总索引：`docs/README.md`（现行/规划/归档分类 + 待决事项）
- 当前版本方案：`docs/v4-master-plan-2026-07-13.md`（M1 教研资产层/M2 课程季/M3 学情闭环均已落地）
- 最新进度基准：`docs/real-check/2026-07-23-production/REPORT.md`
- 历史真检、旧方案与运行产物：见 `docs/project-archive.md` 的项目外归档说明
