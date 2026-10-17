# 小问题与缺省决定

不阻塞工作、按缺省处理的事项。需要用户确认的标"待确认"。S1、S2 的记录在 maolab-core `docs/ISSUES.md`。

| # | 日期 | 步 | 事项 | 处理 |
|---|---|---|---|---|
| 1 | 10-17 | S3 | 旧代码的 docs/（设计文档、真检记录）随旧代码一起只留在 tag `legacy-2026-10-02` | 新工作区不带旧文档 |
| 2 | 10-17 | S3 | 环境变量名沿用 `YUNYI_*`：core 自己读 `YUNYI_PG_URL`、`YUNYI_LLM_*`，只改产品一侧会两种前缀混用 | 等 core 改名（加 `MAOLAB_CORE_*` 或由宿主传参）后两边一起换 |
| 3 | 10-17 | S3 | 插件与服务名（`yunyi-prep`、`yunyiPrep`、`yunyi-finalize`、请求头 `X-Yunyi-Internal`）沿用 | 内部标识，不影响产品边界；随 2 一起改 |
| 4 | 10-17 | S3 | 知识点只取 github.com/mmlong818/k12-knowledge-points（用户 10-17 确认）；该数据集没有教材章节树与教材正文证据 | 知识点选择改为"学段 + 学科 + 关键词检索"；备课的来源摘录在没有证据时按空处理 |
| 5 | 10-17 | S3 | 发布（publication）不搬进备课室 | S4 改成课程包导出；`publicationDraft` 留作导出输入 |
| 6 | 10-17 | S3 | 从旧 SQLite 导入课程的脚本（import-maolab-courses/assets，`origin='maolab-import'`）不搬 | 旧库不在本机，开发期库可重建 |
| 7 | 10-17 | S3 | **已证实**：k12 数据集没有课标原文与教材原文（旧库的 knowledge_point_sources），整课审查的确定性证据门（先于模型调用）一律给出两条 insufficient-evidence（add-source），课程走不到验收与导出。假模型全链在"整课审查"处停住；同一流程带夹具来源时通过 | 用户裁决（10-17）：先降级，后补数据。课程一条权威原文都没有时缺原文不阻断，审查记录 unverifiedSources，工具结果与验收面板提示"未核对课标原文与教材原文"；补上任何权威原文后恢复证据门。**待办**：课标与教材原文资源包的来源 |
| 8 | 10-17 | S3 | 教育资源库（MAOLAB_EDUCATION_RESOURCES_ROOT，教材插图、地图、符号）本机没有，课程的候选资源为空（resourceCatalogAvailable=false） | 与自习室开发环境一致，不阻塞；上线前随部署配置资源包 |
| 9 | 10-17 | S3 | 投影舞台里课堂组件（LearningCycleCheckIn、useClassroomSessionProgress）仍调用旧 maolab 的 /api/v2/mainline/response，备课的预览与渲染页不触发它 | 原样保留（迁入组件不改）；以后删课堂交互组件时一起清 |
| 10 | 10-17 | S3 | 各镜像的 Dockerfile 构建上下文里没有 maolab-core（同 core ISSUES 10） | 开发期不构建镜像；core 远端建好、改成 git tag 依赖后再验证镜像 |
| 11 | 10-17 | S3 | 公式朗读文本 chinese-math-speech（20 行）原在自习室的 kernels 包，投影舞台的无障碍朗读要用 | 复制到 apps/prep-web/app/lib/，不引入 kernels 包 |
| 12 | 10-17 | S3 | prep-harness 里 chatter.ts 的工具名表是导师工具（剥离旁白与伪调用用），备课定稿另剥 prep 工具名 | 原样保留，对备课回复无害 |
| 13 | 10-17 | S3 | S3 的改写脚本把 2 个文件误写到自习室仓库 `apps/maolab/apps/prep-web/`（nginx 模板是自习室旧版、sync-mathjax 脚本与本仓库相同），未跟踪 | 已删（10-17，权限放开后） |
| 14 | 10-17 | S3 | 根 package.json 的 `pnpm -r` 在本机找不到 pnpm（只有 corepack） | 改成 `corepack pnpm -r`；test 顺序执行，省内存 |
| 15 | 10-17 | S3 | 源码扫描的剩余命中：`learner` 在 shared-types 的 `LearnerGender`/`LearnerType`（课程生成的个性化参数）与 plan-store 的 `learner.gender`；`tutor` 只在测试（断言 tutor preset 被拒）与 DeepTutor 借鉴注释；`publication` 是 `publicationDraft`（S4 导出输入）与 harness 测试环境变量 | 不是学生侧代码，保留；S4 把 publication 改名为课程包导出时一起清 |
| 16 | 10-17 | S4 | 拆分 spec 6 写 `export` schema，实际表放在 course schema（`package_exports`、`package_export_versions`），同 S3 的 render、prep | 单一迁移链、测试按 schema 整体替换；要拆时再加迁移 |
| 17 | 10-17 | S4 | 真实截图的课程包每个约 9 MB（15 页 1920×1080 PNG） | 全链产出的 zip 不入库（.gitignore），跨产品全链读本机文件；上线前看是否要压缩或降为 JPEG（core 现只收 PNG，要改格式就是 core 的次版本变更） |
| 18 | 10-17 | S4 | 课程包下载列表里的文件名用 `<packageId>-v<n>`（导出表不存标题），面板下载时带课程标题 | 直接用接口下载的文件名不友好，不影响导入 |
| 19 | 10-17 | S4 | 面板的课程包区块只有逻辑与源码断言测试，没有浏览器里的点击走查 | 留到 S6 真实走查 |
| 20 | 10-17 | S4 | 签名钥只有本机临时钥；生产的私钥保管、轮换（自习室多把公钥并存）没有落地 | 上线前定：私钥放部署平台的密钥存储，`package:keygen` 生成，公钥交自习室运营 |
