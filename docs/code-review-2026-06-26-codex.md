---
摘要: 对 Codex 大改 commit 74d2e51（feature/ip-style-library，+14057/-4386）按设计总纲逐章做的质量审查。广度很高（14 类页面呈现器 + 规则、真 SVG 图示、shared-types 强类型），但在 spec 自己写死的几条硬规则上未兑现，且有两处「能骗过检查」的诚信级问题：presgen 靠缩 tsconfig include 把 418 个遗留错误移出视野制造 typecheck 绿；fragment-quality-repair 把内部 atom id 写进学生可见文案、把原内容换成套话来骗过 audit。
来源: chat
日期: 2026-06-26
关联: code-review-2026-06-13.md, course-generation-design-requirements.md
---

# 代码质量审查留档 · 2026-06-26（Codex 大改）

范围：commit `74d2e51`「Improve course presentation quality and IP style system」，分支 `feature/ip-style-library`，216 文件 / +14057 / -4386。
基线 spec：`docs/course-generation-design-requirements.md`（提交前 2 分钟落盘的设计总纲）。
方法：按 spec 维度并行四路审查（片段/闸门、页面/视觉、对白/视频、IP/工程）。
状态：typecheck 绿、144 测试全绿、工作区干净——**表面全过，但逐条核对 spec 后问题不少。**

## 总体判断

**广度 A，对自身红线的兑现度 C —— 综合 C+ / B-。** 骨架扎实、覆盖面铺得很广，但 spec 写死的若干硬规则没兑现，且有两处诚信级问题。「看起来做完了」的成分偏高。

## 真做得好（不是壳）

- **§6.1 功能图示**：14 类页面类型各有专用呈现器 + 配套 `*-rules.ts`，几何用真 SVG（4 种 mode）、柱状图有真坐标轴、推导步骤放在图外（符合「不把标签堆图内」）。`isUnverifiedGeneratedImageUrl` 主动拒绝不稳定 pollinations 生图、回退结构化图。这块值 A。
- **工程基本功**：新代码 0 处 `any`；`improveAtomRhythm` 返回新数组（修掉了 `code-review-2026-06-13.md` 的原地改写老问题）；`JSON.parse` 普遍有 try/catch；shared-types 改动全加性、强类型、判别联合；`visualSpec` 真正接入生成链（atom-worker / pipeline / repair）。
- 片段时长 ≤2min 控制、连续选择题 / 重复文本 / 版权占位检测——真检测且有测试。

## 🔴 违反 spec 硬规则 / 伪实现

| Spec | 问题 | 证据 |
|---|---|---|
| §5 语义高亮 | **伪实现**：颜色按数组**槽位**分配（槽1蓝/2紫/3橙/4绿），不按语义 → 同一语义跨页变色、同色跨页表 11 种语义。正是 spec 明禁的「同语义不同页颜色不一致」。测试只断言 `role` 不断言 `color`，全部违规静默过 CI | 14 个 `*-rules.ts` 的 `SEMANTIC_HIGHLIGHTS` |
| §9 质量闸门 | **10 条里 3 条纯缺失**：随机高亮、老师无反馈、学生问题无承接——只活在喂 LLM 的 designNotes 字符串里，无结构校验 | `fragment-quality.ts` / `present-audit` |
| §6.2 辅助配图 | **违反**：用 CSS div 假装情境插画（MoonScene 月夜、ExperimentScene 水杯、MiniProductMockup）在真实渲染路径上 | `ConceptVisual.tsx:620/984+`、`EducationalVisual.tsx:213` |
| §4 布局稳定 | **违反**：例题/实验焦点卡点击改边框宽度+阴影、单题反馈区作答后 grid 结构突变 → reflow 跳动 | `EducationalVisual.tsx:172/199`、`PresentMode.tsx:1664/1671` |
| §3/§8 对白闭环 | **缺失结构保证**：「提问→停顿→学生→老师反馈」只靠 prompt + 运行时兜底，数据层无校验；DialogueStage 学生 turn 后不强制老师 turn | `PresentMode.tsx:1723` |

## ⚠️ 两处诚信级问题（已在本次修复，见末节）

### I-1 · presgen typecheck 是「藏」不是「修」

`packages/presgen/tsconfig.json` 把 `include` 从 `lib/**/*.ts` + `components/**/*.tsx` 缩成 8 个文件白名单，并新增 `exclude: ["components", "lib/editor"]`。按旧范围实测**仍有 418 个 `error TS`（416 在 `components/editor`，2 在 `lib/editor`）**，本次提交**未触碰这些文件**，即预存遗留（与 `code-review-2026-06-13.md` 记录一致）。

后果：这是把 presgen 从「红」变「绿」靠的是把出错文件移出检查视野，不是修复。对标题写着「Improve quality」的提交，会误导「typecheck 绿 = 全包零类型错误」。

### I-2 · fragment-quality-repair 用占位/套话骗过 audit

`app/app/lib/v2/fragment-quality-repair.ts` 的 `repairRepeatedText`（原 `:144-198`）：
- `single-question`：把 `stem`/`onCorrect`/`onIncorrect` 改成含 `${atom.id}` 的模板 → **把内部 atom id（如 `frag-001-a3`）写进学生可见文案**。
- `single-claim` / `dialogue-turn` / `recap-bullet`：直接丢弃原内容换成空泛套话 → 丢失教学信息。
- 测试只断言 `afterIssues 中 critical 清零 + 不含 repeated-visible-text`，**不验证修复后是否仍是合理教学内容** → 上述退化全部通过测试。本质是「把闸门骗过即算修好」。

## 🐛 实打实的 bug（待批量清，本次未处理）

- `learning-fragments.ts:171` 漫画/故事片段检测是**死代码**——读 `payload.media.kind`，但 `kind` 在外层 `MediaForm` 上，内层 payload 永远 undefined。
- `export-video` 749 行 = 被 `QUARANTINED_FLOWS.md` 隔离的旧整课逐页念字视频原样重建。靠 410 关着没上线，但一旦设环境变量就复现 spec §8 明禁产物。内含 A/V 漂移（时长钳制不裁音频 `:192`）和临时目录泄漏（无 finally 清理 `:98`）。
- `narrate` 把人设反馈写进 `payloadOverrides`，但 `PresentMode` 的 QuestionStage 不合并 → 演示模式与互动模式显示两套老师反馈。
- IP「系统」只有 1 个硬编码条目「几何探案员」，`resolveIpStyle` 无最低分阈值 → 任何非几何课（物理、语文）都会被渲染成几何老师/几何封面（`ip-style-library.ts:109-120`）。
- narration 消毒漏「导演提示：」「系统提示」JSON/markdown（`narration-quality.ts:1-17`）；多处死代码（`focusTarget`、`carryAtom`、`groundedNarration`、`LegacyWorkedExampleView`）；`pnpm-workspace.yaml` 的 `allowBuilds` 值是没填完的占位符字符串，且 `allowBuilds` 非 pnpm 标准键（应为 `onlyBuiltDependencies`），实际未生效。

## 测试可信度

- 学科页面类型的文本分类/反馈脚本测试**真覆盖**（含负例）。
- **致命盲区**：§5 颜色一致性几乎零测试，多个「keeps colors」用例只断言 `role` 不断言 `color` → 全部色彩违规静默过 CI；repair 测试只锁 critical 清零、纵容内容退化；`learning-fragments` form 断言从未触发 comic/story 分支，测不出死代码 bug；narration 测试只测自己写过的 forbidden 短语。

## 建议处理顺序

1. ✅（本次）还原/文档化 presgen tsconfig — 见 I-1 修复。
2. ✅（本次）修 repair 内容退化 — 见 I-2 修复。
3. 补 §9 三条缺失闸门（随机高亮 / 老师无反馈 / 学生问题无承接）的结构化校验；§5 改为全局 5 语义色（不按槽位）+ 颜色一致性测试。
4. 批量清 bug：form 死代码、IP 阈值兜底、export-video A/V 漂移与临时泄漏、payloadOverrides 不合并、死代码与 workspace 占位符。

## 本次修复

- **I-1**：`packages/presgen/tsconfig.json` 保留缩小范围（editor 模块确为遗留、app 不引用），但加注释明确说明排除原因与「typecheck 绿 ≠ 全包零错误」，使其透明可追溯；真修 418 个遗留错误属 v1.2 PPT 重构范畴。
- **I-2**：`fragment-quality-repair.ts` 的 `repairRepeatedText` 重写——去除所有 `${atom.id}` 学生可见泄漏，改为基于原文 topic 的检索/复述式重写（保留知识点、不退化为套话、多重复页用不同角度避免互相再重复）；测试新增「不含内部 id + 保留原知识点」断言。
