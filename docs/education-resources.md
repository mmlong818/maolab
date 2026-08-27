# K12 教育资源库接入

maolab 以只读方式使用项目外资源库 `maolab-k12-2026-08-21`。资源文件不复制进 Git 工作树，避免把约 1.55 GiB 的教材图、地图和学科符号重复提交到仓库。

## 当前资源

- 424 张经视觉审核并绑定教材章节、知识点的教材图像。
- 1 张正式教材历史地图、92 张自然资源部标准地图、45 张开放许可专题地图。
- 494 个生物图标、126 个电路符号、9 个实验安全符号。
- 497 份教材章节树；当前内容与 `packages/textbook-index/data` 中的项目索引一致。
- 完整来源、许可、审图号和 SHA-256 清单保留在外部资源库中。

## 配置

本机目录结构符合标准位置时，应用会自动找到：

```text
E:\CC\education-resources\maolab-k12-2026-08-21
```

移动目录或部署到其他机器时设置：

```text
MAOLAB_EDUCATION_RESOURCES_ROOT=<资源库绝对路径>
```

资源目录是只读事实源。应用不得覆盖其中的图片、目录、来源记录或校验清单。

## 接口

- `GET /api/v2/education-resources`：返回资源库状态和资源列表。
- `GET /api/v2/education-resources?q=秦朝&subject=历史`：按关键词和学科检索。
- `GET /api/v2/education-resources?knowledgePointId=<id>`：按知识点精确查找教材资源。
- `GET /api/v2/education-resources?id=<resource-id>`：读取单项资源及来源信息。
- 返回的 `assetUrl`：通过只读文件接口显示资源；文件访问被限制在教材图、地图和符号目录内。

教材图保留 `revealPolicy=explanation-only`。课程生成或备课功能接入这些资源时，必须继续遵守答后讲解边界，不得在提问阶段提前泄露答案，也不得裁切、改写或遮挡正式地图和教材原图。
