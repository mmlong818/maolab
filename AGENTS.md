# AGENTS.md — 给 Codex 的项目指令

## 0. 启动必读：本仓库是双 Agent 协作

本项目**同时被 Codex 和 Claude Code 编辑，共享同一个工作树**。
两个 Agent 之间的通信契约在 `.collab/README.md`，**开工前必须先读它**。

最短版本的三条硬规则：

1. **每个会话的第一件事**，跑一次：

   ```
   node .collab/brief.mjs --text
   ```

   它一次性输出当前路径锁 + Claude Code 的信箱。要动的路径已被锁定 → 不要动，
   改做别的或在自己信箱里提问。（Claude Code 侧由 SessionStart hook 自动执行同样的事。）
2. **动手时往 `.collab/LOCKS.md` 追加一行**认领路径，完工后自己删掉：
   `codex | app/app/api/v2/live/** | 07-27 15:00 | 重写 sse route`
3. **收工时只更新 `.collab/mailbox-codex.md`**（你自己的信箱）——
   「正在做」段覆盖写，「流水」段追加一行，写清对方需要知道的**后果**。

不要编辑 `.collab/mailbox-claude.md`（那是对方的信箱，你只读）。
给对方的提问写在自己信箱里，用 `@claude:` 开头。

## 1. 项目上下文

项目说明、技术栈、目录结构、启动命令、文档入口，见根目录 **`CLAUDE.md`**。
那份文件对你同样有效——它描述的是项目本身，不是某个 Agent 的私有配置。

一句话：maolab 是 AI 课堂教学研究应用，pnpm workspaces monorepo，
Next.js 15 + TypeScript + Drizzle ORM + SQLite。

## 2. 改动纪律

- 只做被要求的事，不扩展未被请求的功能；每一行修改都应能追溯到用户请求
- 编辑现有代码时匹配现有风格，不「顺手改进」相邻代码/注释/格式
- 因本次改动产生的孤儿导入/变量负责删除；预先存在的死代码提及但不删
- `data/maolab.db`（102MB）勿删
- 不硬编码任何密钥或凭证

## 3. 提交

- 提交前确认改动范围，不跳过 pre-commit hooks，推送前询问确认
- commit message 用中文，格式参照 `git log` 现有风格（`feat(mainline): ...`）
- 在 commit message 末尾加一行标明身份，便于事后区分两个 Agent 的产出：
  ```
  Agent: codex
  ```

## 4. 学生投影片文字下限

所有课堂页、备课预览页和导出投影片都必须遵守同一套投影可读性标准：

- 页面标题不低于 `36px`
- 正文不低于 `28px`
- 图表标签、坐标、单位不低于 `22px`
- 辅助说明和元信息不低于 `20px`
- 内容放不下时拆成更多投影片，禁止继续缩字

学生可见文字必须使用 `presentation/tokens.ts` 的类型音阶或
`projectionFontSize()`，不得在页面组件里另写更小字号。字号回归测试失败属于
阻断问题，不能以“只在备课预览里较小”为理由跳过。
