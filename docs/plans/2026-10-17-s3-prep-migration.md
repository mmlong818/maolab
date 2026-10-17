# S3：备课栈迁入 maolab（实施计划）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** maolab 的 main 换成新工作区，从 maolab-ai-learning 搬入备课栈并依赖 maolab-core；本机老师能从选知识点走到导出 PPTX。

**Architecture:** 复制（不是移动）：自习室里的备课代码原样保留到 S5 再删。新工作区按拆分 spec 第 7 节 S3 行的布局，产品自有代码改包名，平台能力全部取 `@maolab-core/*`（本机 `file:` + injected）。数据库是独立的 `maolab_prep` 库，迁移链从 0000 重新编号。

**Tech Stack:** pnpm 11.18、Node 24（可擦除 TS 直跑）、Fastify、dsh 0.2.0-rc.2 + cordis、Next 15 静态导出、drizzle（仅迁移）、pg、Playwright、pptxgenjs、vitest。

**Spec:** maolab-ai-learning `docs/superpowers/specs/2026-10-16-product-split-architecture-design.md`（第 2、3、6、7 节）；S1 计划 maolab-core `docs/plans/2026-10-16-s1-core.md`。

## Global Constraints

- 旧代码先打 tag `legacy-2026-10-02`（指向 431d507），再在分支 `split-s3` 上换工作区，完成后快进 main。**不推送**（对外动作）。
- 布局：`apps/prep-web`、`apps/prep-api`、`apps/prep-harness`、`workers/render`、`packages/course`、`packages/pedagogy`、`packages/domain`；另加 `packages/shared-types`（课程域类型，原样）与 `packages/prep-bundle`（dsh 插件）。
- 包名：`@yunyi/course`→`@maolab/course`，`@yunyi/domain`→`@maolab/domain`，`@yunyi/bundle`→`@maolab/prep-bundle`，`@yunyi/render-worker`→`@maolab/render-worker`，api/harness/web 为 `@maolab/prep-api`、`@maolab/prep-harness`、`@maolab/prep-web`。
- 产品之间零运行时依赖：maolab 里不得出现 `@yunyi/*` 包、learner、tutor、kernels、publication 表、`/api/v2` Python 后端调用。
- core 依赖写法与 S2 相同：`file:../../../maolab-core/packages/<名>` + `dependenciesMeta.<名>.injected: true`。
- 数据库：库 `maolab_prep`、登录角色 `maolab_prep`（测试库 `maolab_prep_test`），与自习室的 `maolab` 库同一个 PG 实例（127.0.0.1:15433），连接串不同。schema：`account`（core/auth DDL）、`kp`（core/knowledge DDL + k12 导入）、`course`、`harness`。
- 环境变量名本步不改（core 自己读 `YUNYI_PG_URL`、`YUNYI_LLM_*`，只改产品一侧会造成前缀混用）；记 ISSUES。
- 发布（publication）不搬：S4 用课程包导出替代。`course` 里的 `publicationDraft` 留着作 S4 的输入。
- 小问题记 `docs/ISSUES.md`（沿用 core 的表格格式），不阻塞。

## Review Focus

1. 知识点在 k12 数据集里没有教材来源（`knowledge_point_sources` 不存在）：从 KP 建课、来源核查、整课审查必须照常走完，不报错（Task 3、Task 4 测试）。
2. 老师 A 不能读写老师 B 的课程、对话、产物：迁入的 `prep-isolation-e2e` 必须在新鉴权（core/auth）下照样通过（Task 6）。
3. 渲染页 `/prep/render/` 与 `/api/prep/render` 不对外：Nginx 与 api 都返回 404（Task 6、Task 7 的 nginx-mimic 测试）。
4. 迁移在空库上从 0000 跑到底，重复启动幂等；account 与 kp 的 DDL 先于课程迁移执行（Task 4）。
5. 知识点搜索的空查询、只选学段、跨学段学科、`limit` 超上限：返回稳定、不全表扫（Task 6）。

---

### Task 1: 打 tag、换工作区骨架

**Files:**
- 删除：`app/`、`packages/*`（旧）、`scripts/`、`tasks/`、`.collab/`、`AGENTS.md`、旧 `pnpm-lock.yaml`、`tsconfig.base.json`（重写）
- 保留：`LICENSE.md`、`NOTICE`、`.gitignore`（补 node_modules、dist、.next、out、data/private）；`docs/` 只留 `docs/README.md`（改写为指向 tag 的说明）、本计划、`docs/ISSUES.md`
- 新建：根 `package.json`（scripts：`test`、`typecheck` 递归）、`pnpm-workspace.yaml`（`apps/*`、`packages/*`、`workers/*`，allowBuilds 只放 esbuild）、`tsconfig.base.json`（取自自习室）、`CLAUDE.md`（产品边界、布局、与 core 的关系、命令）、`README.md`、`.env.example`

- [ ] `git tag legacy-2026-10-02 431d507`；`git switch -c split-s3`
- [ ] 删旧、建骨架；`corepack pnpm install` 成功（此时还没有包）
- [ ] Commit：`chore(split S3): 旧代码留 tag legacy-2026-10-02，main 换成新工作区骨架`

### Task 2: pedagogy、shared-types、course

**Files:** 从自习室原样复制 `packages/pedagogy`、`packages/shared-types`、`packages/course`（含 tests、tests-pg、scripts），全仓 sed `@yunyi/course`→`@maolab/course`、`@yunyi/domain`→`@maolab/domain`。

- [ ] 复制、改名；`course` 的 devDependency `@maolab/domain` 先保留（tests-pg 用，Task 4 后能跑）
- [ ] `pnpm -C packages/course typecheck`、`vitest run`：数量与自习室一致（自习室里先跑一遍记基线）
- [ ] Commit：`feat(split S3): 迁入 course、pedagogy、shared-types`

### Task 3: domain（只留课程、渲染、备课对话）

**Files:**
- 保留：`pg.ts`、`secret.ts`（若被用）、`migrate.ts`、`course-documents.ts`、`course-artifacts.ts`、`course-knowledge.ts`、`render-jobs.ts`、`prep-conversations.ts`、`schema/course.ts`、`schema/account.ts`（仅 users 表引用）、对应测试
- 不搬：learner、learning、teaching、memory、turns、harness-log、knowledge.ts、publications、course-import / course-asset-import 与 import-maolab-* 脚本、library-recall
- 迁移：`migrations/0000_course.sql`（原 0005，去掉 `origin='maolab-import'` 以外不变；origin 只留 `prep`）、`0001_render.sql`（原 0006）、`0002_prep.sql`（原 0007）；`drizzle.config.ts` 只列 `course`；跟踪表 `course.__drizzle_migrations`

**Interfaces:**
- Produces：`runMigrations(pool): Promise<void>`（先执行 `accountDdl()`（core/auth）与 `knowledgeDdl('kp')`（core/knowledge），再跑 drizzle 迁移）；`PgCourseKnowledge(pool, { schema = 'kp' })`，`knowledgePoints(ids)` 列名不变（annotations 由 jsonb 转 text），`knowledgePointSources(ids)` 恒返回 `[]`（k12 无来源表，注释写明）；其余类沿用原签名。

- [ ] 写测试 `course-knowledge.test.ts`：kp schema 里插两条知识点 → `knowledgePoints` 返回原列且 annotations 是 JSON 文本；`knowledgePointSources` 为 `[]`
- [ ] 写测试 `migrate.test.ts`：空库跑两遍 `runMigrations` 不报错，`account.users`、`kp.knowledge_points`、`course.documents`、`course.render_jobs`、`course.prep_runs` 都在
- [ ] 建库与角色（`maolab_prep`、`maolab_prep_test`），`MAOLAB_TEST_PG_URL` 写进本机 `.env`（不提交）
- [ ] 实现、迁入的 domain 测试全过；回到 Task 2 跑 `packages/course` 的 tests-pg 通过
- [ ] Commit：`feat(split S3): domain 只留课程、渲染、备课对话；迁移链从 0000 重编；知识点改读 kp`

### Task 4: workers/render

- [ ] 原样复制 `workers/render`，改依赖名；schema 检查改用新 domain
- [ ] `tests`、`tests-pg` 通过；`tests-browser` 若本机 Chromium 可用则跑，否则记 ISSUES
- [ ] 增补测试（Review Focus 1）：在 course tests-pg 或 domain 测试里，以无来源的知识点走 `course-from-kps` 建课 → 成功且来源核查结果为"无教材依据"类的非阻断提示（按 course 现有行为断言，先跑出实际值再固定）
- [ ] Commit：`feat(split S3): 迁入渲染 worker`

### Task 5: prep-bundle 与 prep-harness

**Files:**
- `packages/prep-bundle`：`src/prep/{service,model,course-loader,finalize}.ts`、`src/tools/prep-tools.ts`（去掉发布类工具）、`src/finalize.ts`（**新写，只含备课**：插件名 `yunyi-finalize` 不变，不注入 `yunyiLearning`，只调 `createPrepFinalizer`）、`src/chatter.ts`、`src/plan-store.ts`、`src/session-policy.ts`（无学习者 preset）、`src/skills/provider.ts`、`src/tools/whoami.ts`、`skills/prep-quality-contract`、`skills/prep-review-standards`；package `exports` 只列这些
- `apps/prep-harness`：`src` 四个转出、`profile/cordis.patch.yml` 只留 `preset-prep` 与它需要的全局插件（无 tutor、kernels、memory、learning、library）、`yunyi-prep` 配置去掉 publicationSchema/publish、`knowledgeSchema: kp`；测试只搬 prep 相关与通用宿主测试，`whitelist.ts` 的 `PREP_TOOLS` 去掉发布工具

- [ ] 迁入的单测（unit-prep-*、unit-skills、diagnostic-gate）与宿主测试（prep-host、prep-final、prep-isolation、prep-course-loader）通过
- [ ] 新测试：profile 里只存在 preset `prep`（读 patch 断言 preset 列表等于 `['prep']`）
- [ ] Commit：`feat(split S3): 迁入备课 harness 与 prep-bundle`

### Task 6: prep-api

**Files:**
- `apps/prep-api/src`：`server.ts`、`main.ts`、`config.ts`、`shutdown.ts`、`auth/*`（`PgCredentialStore` 直接用 core/auth，不带学习者档案规则）、`harness/{client,frames,ndjson,queue}.ts`（从 `learning/` 拆出 prep 用到的：`HarnessClient`、`HarnessError`、`turnFinalOf`、`textDeltaOf`、`pipeNdjson`、`FrameQueue`、`inputHash`）、`harness/credential.ts`（只留 `resolvePrepCredential`）、`prep/*`、`routes/{account,prep,prep-courses,prep-artifacts,prep-chat}.ts`
- 新增 `routes/prep-knowledge.ts`：`GET /api/prep/knowledge/search?q&gradeBand&subject&limit` → `PgKnowledge.search`（limit 缺省 20、上限 100），`GET /api/prep/knowledge/facets` → `{ datasetVersion, gradeBands: [{ gradeBand, subjects: string[] }] }`（`select distinct grade_band, subject`）
- 不搬：learner、learning（除上面拆出的）、library、prep-publications、publishAllowed

- [ ] 迁入测试通过：prep-artifacts、prep-chat-e2e、prep-chat-routes、prep-config、prep-course-writes、prep-courses、prep-gate、prep-isolation-e2e、prep-nginx-mimic、prep-revise、prep-turn、account 相关
- [ ] 新测试 `prep-knowledge.test.ts`：未登录 401；空 q 只给学段 → 返回该学段条目且 ≤ 20；limit=500 截到 100；facets 列出导入的学段学科
- [ ] Commit：`feat(split S3): 迁入备课 api，知识点检索接 core/knowledge`

### Task 7: prep-web

**Files:** 按闭包（`split-tools/closure.mjs`，入口 `app/prep/**`、`login-callback`、`layout.tsx`、`page.tsx`、`not-found.tsx`）复制 78 个 web 文件及其测试；`@/lib/mainline/*` 别名指向 `../../packages/course/src/mainline/*`；`next.config.ts` 只 transpile `@maolab/course`、dev 只反代 `/api/prep` 与 `/api/account`（按现有 auth 路径）；`AccountMenu` 去掉自习室链接；首页 `/` 直接进 `/prep/`；Nginx 模板只留 prep 规则；`KpPicker` 改为学段/学科下拉 + 关键词搜索（调 Task 6 两个接口），选中结果仍是 KP id 列表，`kp-selection.ts` 接口不变

- [ ] 迁入测试通过（prep 六个、render-page、mainline 三个）；KpPicker 的测试改为对新接口断言（facets 渲染下拉、输入关键词发起 search、勾选后 selection 含 id）
- [ ] `next build` 静态导出成功
- [ ] Commit：`feat(split S3): 迁入备课前端，知识点选择改为检索`

### Task 8: 本机全链路与收尾

- [ ] 导入 k12 数据集到 `maolab_prep`（core 的 import-k12 脚本，`--schema kp`）
- [ ] 迁入并改造 `apps/prep-api/scripts/{prep-flow,prep-stack,prep-e2e}.ts`：假模型全栈（api + harness + render worker + web 静态页）跑通 选知识点（经 search）→ 计划 → 生成 → 截图门禁 → 验收 → 导出 PPTX，PPTX 可下载且页数与课程一致
- [ ] 浏览器冒烟：Playwright 打开 `/prep/`，用检索选一个知识点建课，截图存 `docs/real-check/2026-10-17-s3-prep/`，写 REPORT.md
- [ ] 全仓 `typecheck`、`test`；源码扫描 `@yunyi/`、`learner`、`tutor`、`/api/v2`、`publication` 无命中（注释白名单）
- [ ] 更新 core 的拆分 spec 进度、ISSUES；`git switch main && git merge --ff-only split-s3`
- [ ] Commit：`docs(split S3): 全链路走查报告与进度`

## 进度

- 2026-10-17：Task 1–7 完成并提交；测试：course 1133（+ PG 6）、domain 41、render 43（+ PG 4、浏览器 13）、prep-harness 84、prep-api 88、prep-web 97。
- 2026-10-17：Task 8 本机全链（假模型，固定度量与真实浏览器两种截图）通过，报告 `docs/real-check/2026-10-17-s3-prep/REPORT.md`。走查中发现 k12 无课标与教材原文会让整课审查阻断，按用户裁决降级为提示（ISSUES 7）。
- 偏离计划：Task 4 计划里"无来源知识点建课"的测试放在 course 的 services 测试与新的 tests/prep-no-source.test.ts；浏览器里实际点选 KpPicker 留到 S6。

