---
摘要: 教学内容质量整改 + 教学骨架库子系统的进度检查点。本轮清理了渲染层大量硬编码填充/碎片兜底/真图被顶/emoji头像，收紧了生成层规则（提问/精简/教学弧线/禁画面文字/学科图密度），并搭起教学骨架库 Phase 1–4（知识×教学双类型定义→匹配填槽→候选创建→沉淀）与卡司系统（老师+4同学，基础+5学科主题立绘）。已知未完：Phase 2.5 硬骨架、Phase 5 续、SituationApplication 卡清理、方程创建路径真机验证、全部课程在 429 冷却后重生成复验。
来源: chat
日期: 2026-06-28
关联: skeleton-library-design.md, ConceptVisual.tsx, teaching-skeletons.ts, skeleton-store.ts
---

# 教学质量整改 · 检查点（2026-06-28）

## 已完成

### A. 渲染层（即时生效，reload 可见；不依赖 LLM/不受 429 影响）
- **硬编码填充清理**（`present/PresentMode.tsx`）：
  - RecapStage 删掉"先抓住这一页/把它接到前一步形成完整解题路径"模板废话；空 body 不渲染。
  - QuestionStage 作答前删掉"我先选一个答案，再听老师说明理由"占位；cue 改为"想一想 + 干净 prompt"（去掉"先想一想：X："双冒号）。
- **真图被通用卡顶掉**修复：`ImageCaptionStage` + `DemoStage` 改为"有本地真图(含内联SVG)优先显示，只有缺图且确需结构图才走 ConceptVisual"。
- **通用兜底**：`GenericConceptVisual` 从"词块卡片"改为"干净呈现这句话本身"。
- **头像 emoji 兜底**修复：`ip-style-library.ts` 加 `BASE_CAST`，`resolveIpStyle` 未匹配学科主题时回退基础卡司（老师+4同学，无主题），不再 emoji。覆盖天文/历史/化学等未列学科。
- **Phase 5 step1**：`ExampleStage` 不再只对速度出代码图——任何结构内容(月相/几何/结构/关系)命中 `shouldUseConceptVisual` 即图+文双栏（如 月相例子页→MoonPhaseVisual）。
- 几何专用渲染器（GeometrySummaryClaimStage / GeometryCoverIllustration）已确认**门控**，只对几何内容触发，不外溢。

### B. 生成层（影响新生成课；效果验证多受 429 限）
- 提问占比上限 30%→20%（`rundown.ts` enforceQuestionDensity，且改到结构裁剪后再算）。
- 铁律11（精简）：去框架页、连排claim≤2、recap≤2、claim总量≤6；铁律12（教学弧线）：定义先行/单概念推进/页面自足（带真实反例）。
- `enforceFramingCap`(rundown brief级) + `capFramingAtoms`(atom级、看最终文案，可靠) 框架欢迎页≤1。
- imagePrompt 禁画面文字（`atom-worker.ts` 改规则+换掉"「天」字"反面示范）；emoji 克制（atom-worker + age-band）。
- `persisted-text-corruption` 修复 ZWJ(👨‍⚕️) 误报；结构图闸门 `hasBuiltInStructuredVisual` 放宽（非几何学科不再整门失败）。
- 图密度 `image-policy-planner.ts` 按**学科视觉强度**加权（地理/生物×1.8、数学/语文×0.8）。
- 对白闭环检测改全局相邻判断（修"按片段误判→重复插承接页"），承接句改自然变体轮换。
- 场景图卡司 img2img 锚定（`backfill-images` route）。

### C. 教学骨架库 Phase 1–4（`teaching-skeletons.ts` + `skeleton-store.ts`）
- 知识内容类型(9) × 教学内容类型(6) 定义 + 分型函数。
- 5 个种子骨架（辨析/周期/关系/结构/几何），每个含 arc + 具象形式 + 科学性护栏。
- Phase 2：`rundown.ts buildSkeletonBlock` 匹配骨架→注入"按弧线填槽、不编排、不噱头"。
- Phase 3：`generate-pipeline.ts` 未命中时从产出 rundown 提取候选骨架(`extractCandidateSkeleton`)。
- Phase 4：`POST /api/v2/skeletons/approve?courseId` 沉淀候选→approved；匹配用 内置+approved。
- 测试：teaching-skeletons / skeleton-store 共 7 条，全套 158 测试通过。

### D. 卡司系统
- 30 立绘：基础(cast/) + 5 学科主题(cast/{math,physics,biology,geography,chinese}/)，img2img 锁形象。
- 接入对白/提问/封面（RolePortrait）+ 场景图（img2img 锚定）。

## 真机验证结论（2/3 课成功，方程败于 429）
- 595dc9a6 比喻拟人、7d394ee3 月相：骨架系统**有效**（定义先行、例子自足、月相尤佳），但**软注入没完全管住主题壳**（仍有门诊/档案侦探包装）+ 偶发悬空引用/空泛演示（已手修 2 处）。

## 待办（按优先级）
1. **Phase 2.5 硬骨架**（根治噱头壳）：命中骨架时**确定性地用 arc 铺 rundown 节点序列**，LLM 只填每节点的槽，不再自由编排/加剧情壳。需重生成验证（429）。
2. **方程课（procedure-skill）真机验证**：验证 Phase 3"未命中→创建候选→沉淀"闭环（这次败于 429）。还应为 procedure-skill 加一个种子骨架。
3. **Phase 5 续**：为"结构组成"等知识类型补通用可拆解结构图渲染器（替代通用 decor）；让对白页等也能按知识类型取图。
4. **清 SituationApplication 抽象框架卡**（`ConceptVisual.tsx:964-995`"情境不是装饰…"），render 层最后一处模板噪声。
5. **全量复验**：429 冷却后，把另外 4 门 pre-skeleton 课（几何/光反射/细胞/等高线）按新规则重生成，统一到新标准。

## 关键坑 / 复现要点（下次必看）
- **LLM 429 限流**：本轮重生成屡次被 429 挡住。耐心重试脚本（每门 4 次、间隔 420s 冷却）可riding out；分型用 `_validate*.mts` 模式（analyze→plan→method→rundown→generate→backfill，dead-task 重触发）。
- **generate 是 fire-and-forget**：偶尔 async 任务直接死(scripts=0)，需重 POST `/generate/[id]` 重触发。
- **改代码会热重载 dev server → 杀掉在跑的 pipeline**：重生成期间**绝不要编辑代码文件**。
- **tsx 跑 app 内 lib 易踩模块解析**：用 `../node_modules/.bin/tsx`（根 bin），DB 路径 `../data/maolab.db`（cwd=app）。
- 验收/真检脚本写在 `app/_*.mts`，跑完即删（别留仓库）。

## 当前课程清单（7 门）
- 2dd47c09 等腰三角形（几何，pre-skeleton）
- 2f186e45 一元一次方程（pre-skeleton）
- 4a8681cc 光的反射定律（pre-skeleton）
- f3268d9e 细胞结构（pre-skeleton）
- 5d10b31e 等高线（pre-skeleton，图较密）
- 595dc9a6 比喻与拟人（**骨架驱动**，已手修 2 处）
- 7d394ee3 月相变化（**骨架驱动**，头像走基础卡司）

> 渲染层改动对全部 7 门即时生效（reload）；生成层/骨架改动只影响新生成的课，前 5 门是 pre-skeleton，待 429 冷却后重生成复验。
