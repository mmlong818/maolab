# S3 走查：备课栈迁入 maolab 后的本机全链

日期：2026-10-17。计划：`docs/plans/2026-10-17-s3-prep-migration.md`。

## 结论

本机（假模型）老师能从"检索知识点"走到"导出 PPTX"：S3 的退出标准达到。真实模型的走查放在 S6。

## 怎么跑的

`corepack pnpm -C apps/prep-web build` 之后：

- `corepack pnpm -C apps/prep-api e2e:prep`：假模型 + 固定截图度量
- `corepack pnpm -C apps/prep-api e2e:prep --real-browser`：假模型 + 真实 Chromium 截图（apps/prep-web 的静态导出）

两次都通过（`{"ok":true,"problems":[]}`）。`e2e/summary.json` 是真实浏览器那次的结果，`e2e/panel.png` 是面板截图。

| 步 | 结果 |
|---|---|
| 知识点目录（/api/prep/knowledge/facets）→ 按学科检索 | 夹具两条初中语文知识点 |
| 建课 → 确认计划 | 15 页，plan-approved |
| 对话逐页生成（prep 智能体经 dsh 调工具） | 15 页全部生成 |
| 截图入队 → render worker 排空 | 15 个截图任务全部成功；已在队列的页不重复入队 |
| 对话：整课审查 | 通过，结果注明"未核对课标与教材原文"（见下） |
| 逐页验收 → 整课验收 → 导出 PPTX → 下载 | 导出成功，文件是 zip，按附件下载 |
| 渲染数据路径 /api/prep/render 及其编码变体 | "Nginx"与 api 上都是 404 |
| 浏览器面板冒烟 | 课程列表、计划、预览（无溢出）、质量、导出链接都在，没有请求渲染数据路径 |

## 走查中发现并处理的

1. **整课审查被证据门挡住**（ISSUES 7）：k12 数据集没有课标与教材原文，证据门先于模型调用给出两条 insufficient-evidence，课程走不到验收。用户裁决"先降级，后补数据"：课程一条权威原文都没有时，缺原文不阻断，审查记录带 `unverifiedSources`，工具结果与验收面板提示"未核对课标原文与教材原文"；补上任何权威原文后自动恢复原来的证据门。
2. 面板冒烟写的 localStorage 键还是自习室的 `maolab-token`，备课室改成了 `maolab-prep-token`，已改。
3. 排空脚本里静态导出的路径还是 `apps/web/out`，已改成 `apps/prep-web/out`。

## 没有覆盖的

- 真实模型（S6）。
- 浏览器里用 KpPicker 实际点选检索结果建课：检索接口由全链脚本与 api 测试覆盖，KpPicker 的取数与选择逻辑由单测覆盖；界面点选留到 S6 走查。
- 镜像构建（ISSUES 10）。
