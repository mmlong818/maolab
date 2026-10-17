# maolab：猫叔备课室

老师备课的产品：选知识点 → 备课对话（prep 智能体）→ 逐页生成与审查 → 截图门禁 → 教师验收 → 导出 PPTX；S4 起再导出课程包给云一自习室。

与云一自习室（maolab-ai-learning 仓库）是两个独立产品：各自注册账号、各自的数据库，之间只靠课程包文件。本仓库里不得出现学生、家长、学习会话、导师、公共库的代码与表。两边都用、且与产品无关的模块在 `maolab-core` 仓库（harness 底座、鉴权、知识点、课程包格式），本机用 `file:../../../maolab-core/...` + injected 依赖。

架构与搬迁计划：maolab-ai-learning `docs/superpowers/specs/2026-10-16-product-split-architecture-design.md`。10-02 之前的旧代码（SQLite、虚拟课堂等）在 tag `legacy-2026-10-02`，不再作为实现参考。

## 结构

```text
apps/prep-web/      Next 静态导出 + Nginx：备课工作台 /prep/、截图用的渲染页 /prep/render/
apps/prep-api/      Fastify：登录、课程、备课对话、知识点检索、产物与导出
apps/prep-harness/  dsh 宿主：preset prep（插件在 packages/prep-bundle）
workers/render/     Playwright 渲染 worker：截图门禁、PPTX
packages/course/    备课域：课程文档、规划、逐页生成、质量审查、渲染契约
packages/domain/    PG 仓储与迁移（course schema；account、kp 的 DDL 来自 core）
packages/prep-bundle/ dsh 插件：备课服务、备课工具、回合收尾、skills
packages/pedagogy/  教学法常量
packages/shared-types/ 课程域类型
docs/plans/         实施计划；docs/ISSUES.md 小问题与缺省决定
```

## 数据库

PG 库 `maolab_prep`（登录角色 `maolab_prep`）；测试库 `maolab_prep_test`。schema：`account`、`kp`（k12-knowledge-points 只读副本，用 maolab-core 的 `import-k12.ts --schema kp` 导入）、`course`、`harness`。迁移在 `packages/domain/migrations`，api 启动时执行。

## 命令

```text
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test
corepack pnpm -C apps/prep-api dev
corepack pnpm -C apps/prep-harness start   需先设 YUNYI_INTERNAL_KEY、YUNYI_PG_URL、DSH_HOME=apps/prep-harness/.dsh-home
corepack pnpm -C apps/prep-web dev
corepack pnpm -C workers/render start
```

本机：PG 在自习室仓库的 docker compose（127.0.0.1:15433）；连 127.0.0.1 要设 `NO_PROXY=127.0.0.1,localhost`（有 HTTP_PROXY）；内存紧张，不要并行跑多个 Node 重任务。本机全链：先 `corepack pnpm -C apps/prep-web build`，再 `corepack pnpm -C apps/prep-api e2e:prep [--real-browser]`。

pnpm 版本固定为 `package.json` 的 `packageManager`（11.18.0）。环境变量名暂沿用 `YUNYI_*`（core 读这些名字），见 docs/ISSUES.md。
