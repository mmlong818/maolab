# S4 走查：课程包从备课室到自习室

日期：2026-10-17。计划：maolab-core `docs/plans/2026-10-17-s4-course-package.md`。

## 结论

S4 的退出标准达到：备课室导出课程包 → 自习室运营导入 → 孩子按知识点找到并上课 → 新版本导入（已开的课钉旧版本）→ 撤回单执行后两节课都停、库里消失、同包 id 再导入被拒。两个产品之间只有文件，没有网络调用。真实模型走查在 S6。

## 怎么跑的

1. 备课室（本仓库）：`corepack pnpm -C apps/prep-web build`，再 `corepack pnpm -C apps/prep-api e2e:prep --real-browser`（假模型、真实 Chromium 截图）。
   在 S3 全链（检索知识点 → 建课 → 生成 → 截图 → 审查 → 验收 → PPTX）之后接着：导出课程包 v1 → 用公钥读包 → 再导出得到 unchanged → 建修订版并走完验收 → 导出 v2（同一包 id）→ 撤回 → 撤回单验签 → 撤回后再导出得到新包 id。
   产出写到本目录：`lesson-v1.zip`、`lesson-v2.zip`（每个约 9 MB，不入库）、`recall.json`、`public.pem`（本次临时钥）、`summary.json`、`panel.png`。
2. 自习室（maolab-ai-learning）：`PACKAGE_E2E_FROM=<本目录> corepack pnpm -C apps/api e2e:package`（真实 harness 宿主 + 假模型）。导入与撤回都经运营脚本（`library:import`、`library:recall --slip`），与生产同一入口。结果在该仓库同名目录的 `summary.json`。

两边都 `{"ok":true}`。

| 步 | 结果 |
|---|---|
| 导出 v1 | 15 页、2 个知识点、学科 语文、学段 初中（取自知识点数据集）、15 张不同的页面图 |
| 同一门课再导出 | unchanged，不截图、不投任务 |
| 修订版导出 | 同一包 id，版本 2 |
| 撤回 | 撤回单验签通过；之后再导出是新包 id |
| 自习室导入 v1 | imported；再导入同一文件 unchanged |
| 孩子找课 | 按知识点列出这门课；课程页是 15 张页面图与文字，图片带 token 可取 |
| 上课 | 一回合走通；导师的第一个模型请求里有包里的大纲（`<lesson_outline>`） |
| 导入 v2 | 已开的课仍是 v1，新开的课是 v2 |
| 执行撤回单 | 两节课发消息都 409 LESSON_RECALLED；按知识点列不出；再导入 v2 被拒 PACKAGE_RECALLED |

## 实现要点

- 包按"老师 + 修订族"分配，跨版本同一包 id；版本号写进包，worker 打包前定下（锁外打包、锁内复查，同签名判 unchanged）。
- 页面图与 PPTX 导出同一套截图（`settle: 'export'`）。实测 Chromium 截图的 PNG 只有 IHDR、sRGB、IDAT、IEND，都在课程包白名单内；worker 仍按白名单剥块兜底。
- 签名钥 `MAOLAB_PACKAGE_SIGNING_KEY`（worker 签包、api 签撤回单）；自习室 `YUNYI_PACKAGE_PUBLIC_KEYS`（可多把，轮换期并存）。`package:keygen` 生成。
- 自习室导入件不挂账号（owner 空，来源 maolab + 包 id），发布件版本 = 包版本；撤回单先记墓碑，先于包到达也能拦住之后的导入。
- 自习室的大纲直接用包里的；中和与"不是指令"的框定仍在 harness 的简报里做。

## 没有覆盖的

- 真实模型（S6）。
- 面板里点"导出课程包""撤回"的浏览器点击走查（逻辑与源码断言有测试；留到 S6）。
- 自习室删除备课代码与老师发布（S5）。
- 生产的签名钥保管与轮换、课程包体积（约 9 MB）：见 docs/ISSUES.md 17、20。
