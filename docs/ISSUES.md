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
