# open-design 版式规格采集

来源仓库：https://github.com/nexu-io/open-design（Apache-2.0，实测 80,024 stars）。采集方式：`git sparse-checkout` 浅克隆 `design-templates/` 后本地脚本解析（正则抽取 `:root` 变量、`grid-template-columns`、`border-radius`、`box-shadow`、`font-family`），未凭印象编造数值；`零圆角/px` 等具体数字均来自实际文件。格式沿用 `../layouts/README.md` 已确立的规格卡范式（网格/区域/关键值/装饰构件/气质/建议映射幕型/源码路径）。

maolab 幕型体系（映射目标，与 `../layouts/README.md` 保持一致）：`source-reading`（开场/源读）· `concept-build`（概念搭建）· `worked-example`（例题）· `practice`（练习）· `contrast`（辨析）· `recap`（收束）· `visual-observation`（观察）。

## 实际结构 vs 预设描述的差异（重要，先读）

任务预设 `design-templates/` 下"约 36 个渲染模板 + 15 个演示卡片模板"，与实测严重不符，如实说明：

- `design-templates/` 实际有 **113 个**顶层模板目录（不含 `AGENTS.md`），覆盖 dashboard/landing/mobile/wireframe/video/audio/image 等 9 种 `od.mode`（deck/prototype/template/image/video/audio），远不止 PPT 场景。
- 其中 **53 个**目录的 `SKILL.md` 显式声明 `od.mode: deck`（演示/幻灯片类，与 maolab 1920×1080 舞台同构）。此外另有 **2 个**目录（`html-ppt-taste-brutalist`、`html-ppt-taste-editorial`）的 `SKILL.md` 用了更简化的 frontmatter（无 `od:` 字段块，因此未被 `mode: deck` 检索命中），但其 `description` 明确写明"16:9 HTML deck"，实测确认也是演示类——已如实核实并补入，**实际共 55 个**演示类模板，本文档对这 55 个做规格卡（其余 58 个属 dashboard/prototype/mobile-app 等非演示类，见 README 的"非演示类模板清单"一节，不在本文重点范围）。
- **"36 个渲染模板 + 15 个演示卡片模板"的预设极可能是把 `html-ppt` 这一个 skill 包内部的子资源数量误当成了顶层模板目录数**——实测 `design-templates/html-ppt/assets/themes/` 下恰好有 **36 个** CSS 主题文件，`design-templates/html-ppt/templates/full-decks/` 下恰好有 **15 个**场景化整套 Deck 示例。这两个数字精确对应，但它们是 `html-ppt` skill 的内部资源，不是 `design-templates/` 目录下的 51 个独立模板包。已在下方 `html-ppt` 词条中如实展开说明。
- 53 个 deck 中有 **13 个**（`html-ppt-course-module` / `html-ppt-graphify-dark-graph` / `html-ppt-hermes-cyber-terminal` / `html-ppt-knowledge-arch-blueprint` / `html-ppt-obsidian-claude-gradient` / `html-ppt-pitch-deck` / `html-ppt-presenter-mode-reveal` / `html-ppt-product-launch` / `html-ppt-tech-sharing` / `html-ppt-testing-safety-alert` / `html-ppt-weekly-report` / `html-ppt-xhs-pastel-card` / `html-ppt-xhs-white-editorial`）实测共享**完全相同**的 `:root` 视觉系统（`html-ppt/assets/base.css` 的默认主题，即所谓 "graphify" 配色：白底 + 靛蓝/紫/粉三段渐变强调色），彼此的差异只在 SKILL.md 声明的"场景人设"（如"像 Principal PM 一样写功能商业论证"），视觉规格完全一致——已合并为一张共享规格卡，避免虚构 13 份不同的视觉数值。
- 其余 32 个 `html-ppt-zhangzara-*` 模板（源自 `zarazhangrui/beautiful-html-templates`）经实测彼此 `:root` 色值、字体、装饰构件均**互不相同**，是 32 个真正独立的视觉方案，逐一出卡。

---

## 索引

| 分组 | 数量 | 说明 |
|---|---|---|
| `html-ppt`（基座 skill，含 36 主题 + 31 单页版式 + 15 整套 Deck） | 1（特殊详解） | [见下](#html-ppt-基座-skill36-主题系统) |
| `html-ppt-<scenario>` 共享 graphify 视觉系统 | 13（合并 1 卡） | [见下](#html-ppt-scenario-家族共享-graphify-视觉系统13-个场景包) |
| `html-ppt-zhangzara-*` 独立视觉方案 | 32（逐一出卡） | 见下方各词条 |
| `html-ppt-taste-*`（无 `od:` 字段但确认为 deck） | 2（逐一出卡） | `html-ppt-taste-brutalist` / `html-ppt-taste-editorial` |
| 其他独立 deck 包 | 7 | guizang-ppt / ib-pitch-book / kami-deck / open-design-landing-deck / replit-deck / simple-deck / weekly-update（含 replit-deck 内部 8 子主题） |
| **合计规格卡覆盖的 deck 模板** | **55** | 100% 覆盖仓库内全部演示类模板（53 个显式 `od.mode: deck` + 2 个描述确认为 deck 但缺 `od:` 字段的漏网之鱼） |

---

## html-ppt（基座 skill，36 主题系统）

- 网格：`.deck{width:100vw;height:100vh}` + `.slide{position:absolute;inset:0;padding:72px 96px}` 的绝对定位全屏叠放式单栏舞台（非 CSS Grid 分栏，靠 flex 内容自身分层）；`single-page/` 下另有 31 个独立版式片段（`two-column.html`/`three-column.html`/`kpi-grid.html`/`comparison.html`/`timeline.html`/`gantt.html`/`mindmap.html` 等），可作为幕内分区母版单独抽取。
- 区域：`.deck` 舞台层 + `.slide.is-active`（当前页，`opacity:1`）/`.is-prev`（前一页，`translateX(-30px)`）双态过渡；`single` 模式下（直接打开某个版式文件）退化为静态整页。
- 关键值：默认主题（即"graphify"）`--radius:18px` `--radius-sm:12px` `--radius-lg:26px`；`--shadow:0 10px 30px rgba(18,24,40,.08),0 2px 6px rgba(18,24,40,.04)`；标题字号 `h1.title 72px/1.05/800`，`h2.title 54px/1.1/700`；`--font-sans:'Inter','Noto Sans SC',...`（**Noto Sans SC 作为中文后备栈**，是本仓库少数明确声明中文覆盖的字体链之一）；`--ease:cubic-bezier(.4,0,.2,1)`。
- 装饰构件：36 个可切换主题文件位于 `assets/themes/*.css`（如 `minimal-white`/`editorial-serif`/`soft-pastel`/`sharp-mono`/`arctic-cool`/`sunset-warm`/`catppuccin-latte`/`catppuccin-mocha`/`dracula`/`tokyo-night`/`nord`/`solarized-light`/`gruvbox-dark`/`rose-pine`/`neo-brutalism`/`glassmorphism`/`bauhaus`/`swiss-grid`/`terminal-green`/`xiaohongshu-white`/`rainbow-gradient`/`aurora`/`blueprint`/`memphis-pop`/`cyberpunk-neon`/`y2k-chrome`/`retro-tv`/`japanese-minimal`/`vaporwave`/`midcentury`/`corporate-clean`/`academic-paper`/`news-broadcast`/`pitch-deck-vc`/`magazine-bold`/`engineering-whiteprint`，共 36 个，仅换 `:root` 令牌不换结构，与本仓库 design-systems 的"一份 token 契约多包复用"思路同构）；键盘运行时支持 `S`（演讲者模式弹出 CURRENT/NEXT/SCRIPT/TIMER 四卡）、`N`（笔记抽屉）、`T`（切主题）、`A`（切动画）。
- 气质：单一底层结构、36 层可换皮的"主题工厂"范式——视觉可塑性极高但结构高度统一，适合作为 maolab StylePack 的"一套骨架多套皮肤"参照实现。
- 建议映射幕型：因其本身是骨架级基座而非单一气质，建议按具体主题分别映射——`academic-paper`/`corporate-clean` → `concept-build`/`recap`；`terminal-green`/`cyberpunk-neon` → `worked-example`（代码/技术向）；`comparison.html`/`pros-cons.html`（single-page）→ `contrast`；`chart-*`/`kpi-grid.html` → `visual-observation`。
- 源码路径：`design-templates/html-ppt/`（`assets/base.css`、`assets/themes/*.css` 共 36 个、`templates/single-page/*.html` 共 31 个、`templates/full-decks/*/index.html` 共 15 个）。

---

## html-ppt-*scenario* 家族（共享 graphify 视觉系统，13 个场景包）

- 网格/区域/关键值/装饰构件：与上方 `html-ppt` 基座默认主题**完全一致**（`--bg:#ffffff` `--accent:#3b6cff→#7a5cff→#ff5c8a` 三段渐变、`--radius:18px` 系、`--shadow` 同值、`--font-sans:'Inter','Noto Sans SC',...`），13 个包的 `example.html` 逐字节 diff 仅标题文案与内容不同，样式令牌零差异——已实测核实（非假设）。
- 气质：冷静理性的靛蓝渐变技术感，白底高对比，适合数据/流程/商业论证类严肃内容。
- 建议映射幕型：`concept-build`（结构化论证）/`worked-example`（含案例编号的场景）/`recap`（weekly-report 类周报向）。
- 13 个场景包与其人设标签（仅人设文案不同，视觉共享上表）：

| 目录 | 场景人设（zh_name） |
|---|---|
| `html-ppt-course-module` | 像顶级赋能负责人一样做新人培训模块 |
| `html-ppt-graphify-dark-graph` | 像 Principal PM 一样写功能商业论证 |
| `html-ppt-hermes-cyber-terminal` | 像应用 AI 工程师一样讲 BYOK 选型 |
| `html-ppt-knowledge-arch-blueprint` | 像平台 VP 一样把事故复盘写成学习稿 |
| `html-ppt-obsidian-claude-gradient` | 像企业 AI 转型负责人一样写落地简报 |
| `html-ppt-pitch-deck` | 像顶级加速器合伙人一样写 Demo Day 路演 |
| `html-ppt-presenter-mode-reveal` | 像创始 DevRel 一样做现场 AI 演示 |
| `html-ppt-product-launch` | 像战略客户 AE 一样推动团队落地 |
| `html-ppt-tech-sharing` | 像 Staff DevRel 一样做工程分享 |
| `html-ppt-testing-safety-alert` | 像首席合规官一样向医院董事会汇报数据治理 |
| `html-ppt-weekly-report` | 像分析负责人一样写每周增长复盘 |
| `html-ppt-xhs-pastel-card` | 像叙事播客制作人一样写个人宣言演讲 |
| `html-ppt-xhs-white-editorial` | 像晋升评审内部人一样写 Staff 工程师晋升材料 |

- 源码路径：`design-templates/html-ppt-<scenario>/example.html`（13 个，路径按上表目录名替换）。

---

## html-ppt-zhangzara-* 家族（32 个独立视觉方案）

源自 `zarazhangrui/beautiful-html-templates`，每个目录是一套完整独立的 `:root` 色值系统，命名沿用其原始视觉标签（SKILL.md 的 zh_name 是叠加的"场景人设"文案，与视觉方案本身是两套独立信息，规格卡以视觉数值为准）。

### zhangzara-8-bit-orbit
- 网格：全屏 `.slide` 单栏舞台，像素化装饰层叠加于内容之上。
- 关键值：`--neon-pink:#F0A6CA` `--neon-cyan:#5EDCF4` `--neon-yellow:#F4D03F` `--deep-navy:#0F1B3D` `--dark-void:#0A0E27`；`--pixel-size:4px`；阴影 `6px 6px 0 var(--neon-yellow)`（硬投影，无模糊）；字体 `'Tektur'`(display,像素电子感) + `'Chakra Petch'`(body)。
- 装饰构件：像素化描边、8-bit 硬投影色块。
- 气质：深空霓虹 + 复古街机像素感的爱好故事叙事。
- 建议映射幕型：`visual-observation`（像素装饰适合趣味观察向内容）、`practice`（游戏化激励）。
- 源码路径：`design-templates/html-ppt-zhangzara-8-bit-orbit/example.html`

### zhangzara-biennale-yellow
- 关键值：`--paper:#E9E5DB`（暖羊皮纸）`--sun:#F1EE2E`（标志性太阳黄）`--ink:#1B2566`（深靛蓝）`--ember:#E26B4A`（暖桃强调）；字体 `'Archivo'/'Helvetica Neue'`(sans) + `'Instrument Serif'/Georgia`(衬线标题)。
- 装饰构件：美术馆策展级排版，衬线大标题 + 无衬线正文的双字重编辑系统。
- 气质：双年展策展稿的艺术机构气质，克制而有文化重量。
- 建议映射幕型：`concept-build`（策展叙事结构化）、`contrast`（作品对比陈述）。
- 源码路径：`design-templates/html-ppt-zhangzara-biennale-yellow/example.html`

### zhangzara-block-frame
- 关键值：`--pink:#FE90E8` `--blue:#C0F7FE` `--green:#99E885` `--yellow:#F7CB46`；`--border:4px solid var(--black)`；`--shadow:8px 8px 0px var(--black)`（新粗野主义硬投影）；圆角仅用于头像等 `50%`；字体 `'Inter'`(sans) + `'Space Grotesk'`(mono强调)。
- 装饰构件：粗黑边框 + 高饱和色块 + 硬投影，无渐变无模糊。
- 气质："把混乱 Deck 救到董事会级"的高管级新粗野主义，色块分区极其清晰。
- 建议映射幕型：`contrast`（色块天然适合多组对比标注）、`recap`（清晰色块总结）。
- 源码路径：`design-templates/html-ppt-zhangzara-block-frame/example.html`

### zhangzara-blue-professional
- 关键值：`--bg:#fdfae7`（暖奶油底）`--primary:#1e2bfa`（电光靛蓝）；圆角 `100px/50%/2px` 混合（大胶囊 + 直角并存）；阴影 `0 8px 24px rgba(30,43,250,.25)`（彩色投影非纯黑）；字体 `'Inter'` + `'Space Grotesk'`。
- 气质：季度经营回顾的幕僚长视角，明快专业但不失活力。
- 建议映射幕型：`recap`（季度复盘天然对应收束幕）、`worked-example`（经营数据案例）。
- 源码路径：`design-templates/html-ppt-zhangzara-blue-professional/example.html`

### zhangzara-bold-poster
- 关键值：极简三色 `--bg:#FFFFFF` `--dark:#1C1410` `--red:#D8000F`；圆角仅 `4px`（近直角）；字体 `'Libre Baskerville'`(衬线display) + `'Space Grotesk'`(sans)。
- 气质：VC 合伙人式 A 轮增长叙事，海报级大字报排版，三色克制但视觉冲击强。
- 建议映射幕型：`concept-build`（论点先行的强叙事）、`recap`。
- 源码路径：`design-templates/html-ppt-zhangzara-bold-poster/example.html`

### zhangzara-broadside
- 关键值：`--c-bg:#111111`（近黑，"Broadside 无浅色页"——文件注释明确说明本方案不设 light 变体）`--c-bg-alt:#1a1a18`；圆角 `50%/2px`；字体走 `var(--f-mono)/var(--f-display)` 令牌间接引用。
- 装饰构件：全暗基调的公关传播公告风格，硬边直角为主。
- 气质：产品发布公告的强对比暗黑编辑气质，无缓和过渡。
- 建议映射幕型：`concept-build`（发布公告式开场）、`source-reading`。
- 源码路径：`design-templates/html-ppt-zhangzara-broadside/example.html`

### zhangzara-capsule
- 关键值：`--bg:#F5F5F0` `--fg:#1A1A1A`；八色糖果盘 `--coral:#E85D4E` `--lime:#C4D94E` `--lavender:#C5B5E0` `--sky:#8BB4F7` `--violet:#A06CE8` `--yellow:#F2D160` `--peach:#F5B895` `--mint:#A8E6CF`；圆角 `9999px/50%/2rem`（全胶囊为主）；阴影 `6px 6px 0 var(--shadow)`硬投影；字体 `'Bodoni...'`(display，衬线) + body。
- 气质：年终述职的活泼多彩胶囊形，糖果色盘但保持专业底色。
- 建议映射幕型：`recap`（年终总结）、`contrast`（八色可做多维度对比标签）。
- 源码路径：`design-templates/html-ppt-zhangzara-capsule/example.html`

### zhangzara-cartesian
- 关键值：低饱和大地色 `--bg-primary:#ede8e0` `--bg-secondary:#e2dbd1` `--accent:#8a8178`（灰褐）`--line:#b8b0a4`；圆角仅 `50%`（头像/图标）；字体 `'Inter'` + `'Playfair Display'`(衬线)。
- 气质：经济学毕业论文答辩的学术克制感，坐标系/网格隐喻（Cartesian 命名对应笛卡尔坐标）。
- 建议映射幕型：`concept-build`（论文框架陈述）、`worked-example`（数据模型举证）。
- 源码路径：`design-templates/html-ppt-zhangzara-cartesian/example.html`

### zhangzara-cobalt-grid
- 关键值：`--paper:#F0EBDE`（暖米纸）`--ink:#1F2BE0`（电光钴蓝）`--grid:rgba(31,43,224,.10)`（极淡蓝网格线，命名对应"cobalt-grid"）；阴影 `0 0 0 1.5px var(--paper)`（描边式而非投影）；字体 `'Hanken Grotesk'` + `'Newsreader'`(衬线)。
- 装饰构件：淡蓝网格背景线，纸感 + 电光蓝的对比结构。
- 气质：客户续约论证的克制专业感，网格线暗示"数据支撑"。
- 建议映射幕型：`worked-example`（网格适合数据表格类内容）、`contrast`。
- 源码路径：`design-templates/html-ppt-zhangzara-cobalt-grid/example.html`

### zhangzara-coral
- 关键值：极简四色 `--coral:#E85D5D` `--cream:#F5F0E8` `--black:#1A1A1A` `--gray:#6B6B6B`；圆角仅 `50%`；字体 `'Inter'` + `'Bebas Neue'`(超浓缩display，海报感)。
- 气质：社区增长战役规划的活力珊瑚色调，Bebas Neue 带来运动式紧凑标题。
- 建议映射幕型：`concept-build`（增长叙事）、`recap`。
- 源码路径：`design-templates/html-ppt-zhangzara-coral/example.html`

### zhangzara-creative-mode
- 关键值：`--cream:#EFE9D9` `--green:#1F8A4C` `--pink:#F06CA8` `--orange:#E85A1F` `--yellow:#F5C518`；圆角 `50%/999px`；阴影极醒目 `24px 24px 0 var(--orange), 24px 24px 0 4px var(--ink)`（双层超大硬投影）；字体 `"Space Grotesk"` + `"Archivo Black"`(超粗display)。
- 装饰构件：多彩双层硬投影是本方案标志性构件，视觉冲击力全库前列。
- 气质：品牌视觉识别系统发布的高能量创意工作室气质。
- 建议映射幕型：`concept-build`（VI 发布的强开场）、`visual-observation`。
- 源码路径：`design-templates/html-ppt-zhangzara-creative-mode/example.html`

### zhangzara-daisy-days
- 关键值：马卡龙九色盘 `--cream:#F5F0E6` `--turquoise:#7ECDC0` `--soft-pink:#F7C8D4` `--butter:#FDE68A` `--mint:#A8E6CF` `--lavender:#D4A5E8` `--peach:#FFCBA4` `--sky:#A8D8F0` `--coral:#F8635F`；`--border-width:3px` `--radius:20px` `--radius-lg:28px`；阴影 `6px 6px 0 var(--border)`。
- 气质：客户上手工作坊的雏菊糖果色友好感，是全库色彩最丰富的方案之一。
- 建议映射幕型：`practice`（工作坊互动向）、`visual-observation`。
- 源码路径：`design-templates/html-ppt-zhangzara-daisy-days/example.html`

### zhangzara-editorial-tri-tone
- 关键值：三色系统（命名对应 tri-tone）`--pink:#F2B6C6` `--cream:#F2D86A` `--navy:#7A1F35`（注：文件里 forest/burgundy 等别名均取值同 navy，说明该方案刻意收窄到"粉/黄/酒红"三色而非文字描述的更多颜色，如实标注变量别名重复）；圆角 `999px/28px/4px`；字体 `"Bricolage Grotesque"` + `"JetBrains Mono"`。
- 气质：杂志艺术总监级的编辑设计系统，三色高度克制。
- 建议映射幕型：`concept-build`（编辑设计体系陈述）、`contrast`。
- 源码路径：`design-templates/html-ppt-zhangzara-editorial-tri-tone/example.html`

### zhangzara-grove
- 关键值：`--c-bg:#192b1b`（深林绿）`--c-bg-alt:#1e3221`；圆角仅 `50%`；字体走 `var(--f-display)/var(--f-heading)` 令牌。
- 气质：城市绿地政策简报的深林绿基调，沉稳的公共政策叙事。
- 建议映射幕型：`concept-build`（政策论证）、`visual-observation`（自然/环境主题天然契合）。
- 源码路径：`design-templates/html-ppt-zhangzara-grove/example.html`

### zhangzara-long-table
- 关键值：`--paper:#FAF1E2`（暖黄油纸）`--ink:#B53D2A`（唯一"墨色"是暖锈红，非黑，注释明确"the only ink colour"）；圆角 `999px/50%`；字体 `'Fraunces'`(衬线display) + `'Bricolage Grotesque'`(sans)。
- 气质：FP&A 单位经济模型讲解的暖纸质感，单一强调色替代传统黑色墨调是其特色手法。
- 建议映射幕型：`worked-example`（经济模型举证）、`recap`。
- 源码路径：`design-templates/html-ppt-zhangzara-long-table/example.html`

### zhangzara-mat
- 关键值：`--c-bg:#232e26`（深林绿，与 grove 同色系但更深）`--c-bg-alt:#2e3d30` `--c-bg-light:#ede6d0`（暖米，light 变体）；圆角仅 `50%`；字体 `var(--f-mono)/var(--f-display)`。
- 气质：麦肯锡式利润率修复终稿，深绿+暖米双态切换传达"专业咨询终稿"的沉稳感。
- 建议映射幕型：`worked-example`（利润率案例拆解）、`recap`。
- 源码路径：`design-templates/html-ppt-zhangzara-mat/example.html`

### zhangzara-monochrome
- 关键值：`--c-bg:#fafadf`（统一奶油底，"cream background for every slide"——注释确认全片同一底色，无明暗切换）`--c-bg-alt:#f2f2d2`；圆角种类最丰富 `50%/16px/2px`；字体 `var(--f-mono)/var(--f-display)`。
- 气质：科研基金评审简报的单色克制感，全片统一底色强调"内容而非视觉花哨"。
- 建议映射幕型：`concept-build`（研究陈述）、`source-reading`。
- 源码路径：`design-templates/html-ppt-zhangzara-monochrome/example.html`

### zhangzara-neo-grid-bold
- 关键值：`--bg:#ECECE8` `--ink:#0A0A0A` `--accent:#E6FF3D`（招牌荧光黄，注释"signature neon yellow"）；无自定义圆角（几乎全直角）；字体 `"Space Grotesk"` + `"JetBrains Mono"`。
- 气质：设计作品集叙事的新网格主义，荧光黄单色强调 + 高密度网格。
- 建议映射幕型：`concept-build`（作品集叙事）、`contrast`。
- 源码路径：`design-templates/html-ppt-zhangzara-neo-grid-bold/example.html`

### zhangzara-peoples-platform
- 关键值：`--blue:#2C2CDC` `--orange:#F2A03A` `--red:#E83A2A` `--cream:#F4E9D6`；圆角 `999px/50%/4px`；阴影 `6px 6px 0 var(--red)`（红色硬投影）；字体 `'Archivo Narrow'`(窄体) + `'Alfa Slab One'`(超粗slab衬线)。
- 气质：公共交通投资论证的政务海报感，三原色 + slab 衬线传达公共设施标识语言。
- 建议映射幕型：`concept-build`（政策论证）、`worked-example`。
- 源码路径：`design-templates/html-ppt-zhangzara-peoples-platform/example.html`

### zhangzara-pin-and-paper
- 关键值：外链 `assets/styles.css`（非内联，本方案是本次采集中少数样式外置的 zhangzara 包）——`--paper:#EFE56A`（明黄纸）`--ink:#1F3A8A`（深靛蓝）`--red:#C2342B` `--olive:#6B7A2E`；字体 `"Space Grotesk"`；含手绘 SVG 安全别针图标（`<symbol id="pin">`）作为标志性装饰。
- 装饰构件：内嵌 SVG 别针图标，田野笔记本质感。
- 气质：生物学田野调查答辩的手作笔记本气质，别针图标是唯一但极具辨识度的装饰。
- 建议映射幕型：`visual-observation`（田野观察天然契合）、`worked-example`。
- 源码路径：`design-templates/html-ppt-zhangzara-pin-and-paper/example.html`（样式在 `assets/styles.css`）

### zhangzara-pink-script
- 关键值：`--ink:#060507`（近黑）`--paper:#F5EDF1`（浅粉白）`--pink:#ED3D8C` `--pink-deep:#B81D67`；无自定义圆角；字体 `"Inter"` + `"JetBrains Mono"`。
- 气质：婚礼纪念影像散文的浪漫粉调，暗底配亮粉形成强对比的情感叙事。
- 建议映射幕型：`source-reading`（影像散文式开场）、`recap`。
- 源码路径：`design-templates/html-ppt-zhangzara-pink-script/example.html`

### zhangzara-playful
- 关键值：`--bg:#F0C8A0`（暖杏）`--bg-alt:#E8B88E` `--text:#1A1A1A`；圆角 `50%/2px`；字体 `'Space Grotesk'` + `'Syne'`(个性display)。
- 气质：门店销售培训的暖杏色亲和感，单色高对比字体传达零售培训的活力。
- 建议映射幕型：`practice`（培训演练向）。
- 源码路径：`design-templates/html-ppt-zhangzara-playful/example.html`

### zhangzara-raw-grid
- 关键值：`--black:#0a0a0a` `--white:#ffffff` `--pink:#f2d4cf` `--green:#e5edd6`；`--border:3px solid var(--black)`；阴影 `6px 6px 0 var(--black)`（硬投影）；字体退化为系统栈 `'Segoe UI',system-ui,...`（本方案未声明网络字体，纯系统字体）。
- 气质：音乐节海报系列案例的原始网格感，黑白骨架 + 极淡粉绿点缀。
- 建议映射幕型：`visual-observation`（海报案例展示）、`contrast`。
- 源码路径：`design-templates/html-ppt-zhangzara-raw-grid/example.html`

### zhangzara-retro-windows
- 关键值：`--bg-gray:#c0c0c0` `--bg-light:#d4d0c8` `--blue-navy:#000080` `--btn-face:#d4d0c8` `--btn-highlight:#ffffff` `--btn-shadow:#404040`；阴影用经典 Win95 内凹描边 `inset 1px 1px 0 var(--btn-highlight), inset -1px -1px 0 var(--btn-shadow)`；字体 `"MS Sans Serif","Segoe UI",Tahoma,...`。
- 装饰构件：完整复刻 Windows 95 按钮/窗口拟物（`btn-face`/`btn-highlight`/`btn-shadow` 三态描边）。
- 气质：安全意识培训的 Y2K 复古操作系统拟物感，趣味性强、辨识度极高。
- 建议映射幕型：`practice`（安全培训互动感契合怀旧 UI 的"步骤化"隐喻）、`visual-observation`。
- 源码路径：`design-templates/html-ppt-zhangzara-retro-windows/example.html`

### zhangzara-retro-zine
- 关键值：`--bg:#C8B99A`（做旧牛皮纸）`--green:#008F4D` `--black:#1A1A1A` `--white:#F4EFE6`；字体 `'Space Grotesk'` + `'Bebas Neue'`。
- 气质：街区 zine 独立出版物的做旧复古感，牛皮纸配鲜绿的地下刊物气质。
- 建议映射幕型：`source-reading`（独立出版物式开场）、`visual-observation`。
- 源码路径：`design-templates/html-ppt-zhangzara-retro-zine/example.html`

### zhangzara-sakura-chroma
- 关键值：`--paper:#F1E6CB`（暖米纸）`--ink:#3A2516`（暖棕墨）`--red:#E5392A` `--pink:#E54489` `--orange:#F09131` `--green:#3D9F47`；圆角 `50%`；阴影 `8px 8px 0 var(--ink)`；字体 `'Albert Sans'` + `'Big Shoulders Display'`(超浓缩display)。
- 气质：樱花旅行影像散文的多彩暖调，色彩丰富但以暖棕墨色统一基调。
- 建议映射幕型：`source-reading`（旅行影像叙事）、`visual-observation`。
- 源码路径：`design-templates/html-ppt-zhangzara-sakura-chroma/example.html`

### zhangzara-scatterbrain
- 关键值：马卡龙糖果盘 `--yellow:#ffe066` `--blue:#a5d8ff` `--pink:#ffc9c9` `--green:#b2f2bb` `--orange:#ffcc80` `--purple:...`；圆角 `50%/3px/2px`；阴影双层 `2px 3px 15px var(--shadow), 0 1px 3px var(--shadow-deep)`（柔和层叠投影，区别于其他 zhangzara 方案的硬投影）；字体 `'Zilla Slab'`(衬线) + `'Shrikhand'`(手写感display)。
- 气质：设计毕业答辩的"散乱思维"可视化，糖果色 + 柔和投影传达创意发散过程。
- 建议映射幕型：`concept-build`（发散到收敛的设计思维展示）、`visual-observation`。
- 源码路径：`design-templates/html-ppt-zhangzara-scatterbrain/example.html`

### zhangzara-signal
- 关键值：`--c-bg:#1c2644`（深藏青，注释"intelligence, authority, depth"）`--c-bg-alt:#232f55`；圆角 `50%/2px`；字体 `var(--f-mono)/var(--f-display)`。
- 气质：战略决策备忘的深藏青权威感，情报机构式的克制严肃。
- 建议映射幕型：`concept-build`（战略陈述）、`recap`。
- 源码路径：`design-templates/html-ppt-zhangzara-signal/example.html`

### zhangzara-soft-editorial
- 关键值：`--paper:#F2EEDF`（暖米页）`--ink:#2A241B`（暖近黑）`--pink:#E1A4C2`（粉尘色）`--lemon:#D6DD63`（青柠）`--blush:#E8C9B6`；圆角 `50%/32px/36px`（大圆角为主）；字体 `"Work Sans"`（sans/mono 统一）。
- 气质：数字化转型路线图的柔和编辑感，粉尘色系冲淡了"四大咨询"的刻板严肃。
- 建议映射幕型：`concept-build`（转型路线图陈述）、`recap`。
- 源码路径：`design-templates/html-ppt-zhangzara-soft-editorial/example.html`

### zhangzara-stencil-tablet
- 关键值：`--bone:#E2DCC9` `--black:#000000` `--sienna:#A06A3C` `--magenta:#C73B7A` `--teal:#2D7E73` `--blue:#3F73B7` `--mustard:#D8A93B` `--olive:#6F7A2E`（八色矿物色盘，命名对应"模板/蜡纸印刷"）；圆角 `26px/14px/22px`；字体 `"Inter"` + `"Barlow Condensed"`(浓缩display)。
- 气质：工作场所安全合规评审的矿物色调蜡纸感，多色但克制在土色系内。
- 建议映射幕型：`contrast`（八色适合多类别安全等级标注）、`practice`。
- 源码路径：`design-templates/html-ppt-zhangzara-stencil-tablet/example.html`

### zhangzara-studio
- 关键值：`--c-bg:#1c1c1c`（暖近黑，非冷灰，注释"warm dark, not cold neutral"）`--c-bg-alt:#242422`；圆角仅 `50%`；字体 `var(--f-mono)/var(--f-display)`。
- 气质：创意工作室作品与报价稿的暖黑高级感，克制但有温度。
- 建议映射幕型：`concept-build`（作品陈述）、`visual-observation`。
- 源码路径：`design-templates/html-ppt-zhangzara-studio/example.html`

### zhangzara-vellum
- 关键值：`--c-bg:#2a3870`（深藏青，注释"深 periwinkle — every slide"，全片单一底色不分明暗态，"light" 令牌别名到 "dark"）；圆角仅 `50%`；字体 `var(--f-mono)/var(--f-display)`。
- 气质：终身教授人文讲座的羊皮纸卷气质，深靛蓝配暖黄字色的学术庄重感。
- 建议映射幕型：`source-reading`（人文讲座开场）、`concept-build`。
- 源码路径：`design-templates/html-ppt-zhangzara-vellum/example.html`

---

## html-ppt-taste-*（无 od 字段但确认为 deck 的 2 个漏网之鱼）

### html-ppt-taste-brutalist
- 网格：沿用 `html-ppt` 约定的 16:9 单栏舞台，直接打开时降级为纵向堆叠。
- 关键值：`--crt:#0B0B0B`（未激活 CRT 炭黑，注释明确"从不用纯黑"）`--phos:#ECECEA`（白磷光前景）`--hazard:#E61919`（唯一强调色，仅用于警报/分类标签，禁止作背景）；无自定义圆角（硬直角）；阴影 `0 0 10px rgba(74,246,38,.55)`（磷光辉光效果）；字体 `'Archivo Black'`(display) + `'JetBrains Mono'/'IBM Plex Mono'`(mono，正文即用 mono，13px)。
- 装饰构件：扫描线叠层、ASCII 语法装饰、"未激活 CRT 终端"美学，蒸馏自 `Leonxlnx/taste-skill` 的 brutalist-skill 战术遥测模式。
- 气质：项目复盘/安全评审/运维事故报告的"机密任务简报"感,拒绝销售话术式的 pitch deck 调性。
- 建议映射幕型：`worked-example`（技术复盘举证）、`contrast`（红色警报标签适合异常对比）。
- 源码路径：`design-templates/html-ppt-taste-brutalist/example.html`

### html-ppt-taste-editorial
- 网格：同 16:9 单栏舞台约定。
- 关键值：`--paper:#FBFBFA` `--ink:#1A1A19` `--accent:#346538`（墨绿）`--accent-2:#9F2F2D`（砖红，双强调色）；圆角 `8px/999px`；字体 `'Instrument Serif'/'Newsreader'`(display衬线) + `'Inter Tight'/'Switzer'`(sans正文) + `'JetBrains Mono'/'Geist Mono'`(元信息)。
- 装饰构件：发丝级分割线（1px hairline）、宏观留白、单色调柔和色块，蒸馏自 `Leonxlnx/taste-skill` 的 minimalist-skill。
- 气质：克制优雅的编辑极简气质，双低饱和强调色（墨绿+砖红）区分正负信号。
- 建议映射幕型：`concept-build`（编辑排版适合结构化讲解）、`recap`。
- 源码路径：`design-templates/html-ppt-taste-editorial/example.html`

---

## 其他独立 deck 包

### guizang-ppt
- 网格：`#deck{width:10000vw}` 横向拼接舞台，`.slide{width:100vw;height:100vh;flex:0 0 100vw}` 横滑单栏；`.img-slot` 图片占位支持 `aspect-ratio:16/9`（默认）/`4:3`/`3:2`/`1:1` 四种比例切换。
- 区域：`.slide.light`/`.slide.dark` 双态切换 + `.slide::before` 半透明叠层（`rgba(var(--paper-rgb),.78)` 保证 WebGL 背景上文字可读）；封面页叠层大幅减弱以露出背景。
- 关键值：内置 **5 套可切换主题**（`references/themes.md` 明确列出）——🖋 Ink Classic（墨黑+暖白，默认）/🌊 Indigo Porcelain（靛蓝+瓷白）/🌿 Forest Ink/🍂 Kraft Paper/🌙 Dune；字体栈 `--serif-en:"Playfair Display","Source Serif 4"` `--serif-zh:"Noto Serif SC"` `--sans-zh:"Noto Sans SC"`（**中英双语字体分轨**，中文走 Noto 思源体系，是本次采集中双语支持最完整的方案）；`--mono:"IBM Plex Mono"`。
- 装饰构件：**WebGL 双层动态背景**（`canvas.bg`，`position:fixed;inset:0`）叠加毛玻璃模糊，是本次 53 个 deck 中唯一使用 WebGL 而非纯 CSS 装饰的方案；"编辑杂志 × 电子墨水"融合美学。
- 气质：品牌到收入故事的杂志级质感，WebGL 背景带来其他静态 deck 没有的动态深度。
- 建议映射幕型：`source-reading`（WebGL 背景的沉浸开场感）、`recap`（Ink Classic 主题的克制总结感）。
- 源码路径：`design-templates/guizang-ppt/assets/template.html`（结构+主题切换说明见 `references/themes.md`）

### ib-pitch-book
- 关键值：全 `oklch()` 色彩空间定义（而非 hex，是本次采集唯一使用 OKLCH 的方案）——`--paper:oklch(98.5% 0.008 80)` `--ink:oklch(18% 0.012 70)` `--accent:oklch(48% 0.18 28)`（深红）；圆角 `50%/999px/8px`；阴影层叠 `0 30px 80px -30px rgba(0,0,0,.35), 0 6px 18px -8px rgba(0,0,0,.25)`（大扩散软投影，投行级质感）；字体走 `var(--sans)/var(--mono)` 令牌。
- 气质：成长股权投资 Pitch Book 的投行终稿质感，OKLCH 色彩空间保证深色调在不同屏幕上的一致性，专业度全库领先。
- 建议映射幕型：`worked-example`（估值模型举证）、`recap`（投资结论）。
- 源码路径：`design-templates/ib-pitch-book/example.html`

### kami-deck
- 关键值：与 design-systems 里的 `kami` 包同源色值——`--parchment:#f5f4ed` `--ivory:#faf9f5` `--brand:#1B365D`（墨蓝）；圆角 `50%/4px/999px`；阴影 `0 0 0 1px var(--brand)`（描边式）；字体 `var(--serif)/var(--sans)`。
- 气质：博士后组会研究汇报的羊皮纸编辑质感，与 `design-systems/kami` 品牌包共享同一套视觉语言（可视为该 design-system 的官方 deck 呈现）。
- 建议映射幕型：`worked-example`（研究数据汇报）、`concept-build`。
- 源码路径：`design-templates/kami-deck/example.html`

### open-design-landing-deck
- 关键值：`--paper:#efe7d2` `--ink:#15140f` `--coral:#ed6f5c` `--mustard:#e9b94a` `--olive:#6e7448`；圆角 `50%/999px/4px`；阴影显式声明为 `none`（全平面无投影，本次采集中少数刻意"零阴影"的方案）；字体走 `var(--body)/var(--sans)`。
- 气质：创始人品牌故事稿的暖纸感极简主义，零阴影传达"纸面印刷"而非"数字界面"的质感。
- 建议映射幕型：`source-reading`（品牌故事开场）、`recap`。
- 源码路径：`design-templates/open-design-landing-deck/example.html`

### replit-deck
- 关键值：本包是本次采集中**内部多主题最丰富的单一 deck 包**——`SKILL.md` 声明 8 个可选子主题（`theme` 枚举，默认 `helix`）：`helix`（现代极简浅灰+靛蓝，SaaS 看板向）/`holm`（编辑衬线奶油+栗色，法务/财务备忘向）/`vance`（画廊感奶油+黑底衬线，艺术图录向）/`bevel`（Y2K 编辑黑底+产品图网格，campaign 向）/`world-dark`/`world-mint`（金融墨绿深浅双态，政策报告向）/`atlas`（博物馆感黑底+朱红衬线，长文叙事向）/`bluehouse`（消费级深藏青+桃珊瑚渐变卡片，产品展示向）；字体栈统一为 `--font-sans:-apple-system,...,'Inter',...` + `--font-serif:'Iowan Old Style','Charter','Palatino',Georgia,...`（8 主题共享同一字体系统，仅色值/圆角差异）。
- 气质：单一骨架下 8 种截然不同调性的"主题商店"范式，与 `html-ppt` 基座的 36 主题思路同源但规模更小、每个主题的场景定位更明确。
- 建议映射幕型：按子主题分——`atlas`→`source-reading`；`world-dark/world-mint`→`worked-example`（政策数据）；`bluehouse`→`visual-observation`（产品展示）；`holm`→`recap`（备忘总结）。
- 源码路径：`design-templates/replit-deck/assets/template.html`（结构）+ `examples/example-{atlas,bluehouse,helix,holm}.html`（4 个已烘焙示例，另 4 个子主题 `vance`/`bevel`/`world-dark`/`world-mint` 未见对应烘焙示例文件，如实标注未直接观察到其烘焙 HTML，数值来自 `SKILL.md` 的 `od.inputs` 声明）

### simple-deck
- 关键值：`--bg:#fafaf9` `--fg:#1c1b1a` `--muted:#6b6964` `--accent:#c96442`（陶土橘）`--surface:#ffffff`；圆角仅 `999px`；字体 `Georgia,serif` + `ui-monospace,monospace`。
- 备注：`--accent:#c96442` 与本仓库 `design-systems/claude` 包的强调色数值完全一致（均为 Anthropic 品牌陶土橙），推测二者共享同一底层品牌令牌来源，已如实标注为观察到的数值重合而非臆测的设计意图。
- 气质：COO 经营复盘的极简克制感，是本次 53 个 deck 中令牌数量最少、结构最朴素的方案之一。
- 建议映射幕型：`recap`（经营复盘的典型收束幕）。
- 源码路径：`design-templates/simple-deck/example.html`

### weekly-update
- 关键值：`--bg:#0e0d12` `--paper:#19171f` `--paper-2:#221f2a` `--ink:#f4f0e6` `--accent:#ffcc4d`（暖黄）`--accent-2:#b388ff`（紫）；圆角 `50%/999px/14px`；字体 `--display:'Inter',...` + `--mono:ui-monospace,'JetBrains Mono',...`。
- 气质：数据驱动运营站会的暗色仪表盘感，双强调色（黄+紫）区分指标好坏。
- 建议映射幕型：`worked-example`（指标数据展示）、`recap`（周会总结）。
- 源码路径：`design-templates/weekly-update/example.html`
