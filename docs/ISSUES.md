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
