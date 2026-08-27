# 版式构图规格采集索引

采集目的：从开源演示主题的**实际源码**（不是效果图、不是二手描述）里抠出可施工的版式结构规格——网格划分、区域职责、精确尺寸比例、装饰构件的具体做法——供后续逐个落地为 maolab 的具名构图母版。库只增不减，不做抽象蒸馏；每张卡片都可回溯到具体仓库文件路径。

maolab 幕型体系（映射目标）：`source-reading`（开场/源读）· `concept-build`（概念搭建）· `worked-example`（例题）· `practice`（练习）· `contrast`（辨析）· `recap`（收束）· `visual-observation`（观察）。

## 采集统计

| 来源 | 许可 | 规格卡数 | 文件 |
|---|---|---|---|
| slidev-theme-neocarbon（22 个自定义 layout 全覆盖） | MIT | 22 | [slidev-neocarbon.md](./slidev-neocarbon.md) |
| Slidev 官方 Shibainu 主题（`default`~`default-7` 密度梯度 + cover/center/right/quote/section 系列） | MIT | 14 | [slidev-shibainu.md](./slidev-shibainu.md) |
| Touying 六主题（stargazer/dewdrop/metropolis/university/aqua/simple） | MIT | 20 | [touying.md](./touying.md) |
| marpstyle 22 个哲学家主题（cover+body） | MIT | 44 | [marpstyle.md](./marpstyle.md) |
| Marp 社区 Graph Paper | MIT | 1 | [marp-graphpaper.md](./marp-graphpaper.md) |
| Marp 社区 Rosé Pine | MIT | 1 | [marp-rosepine.md](./marp-rosepine.md) |
| Typst polylux | MIT | 2 | [typst-polylux.md](./typst-polylux.md) |
| Beamer Metropolis 原版（.dtx 源码） | GPL/LPPL（仅供内部研究参考，不直接复用代码） | 3 | [beamer-metropolis.md](./beamer-metropolis.md) |
| **合计** | | **107** | 8 个文件，目标 ≥50 已超额完成 |

## 按建议幕型分布（卡片可多映射，计数为提及次数）

| 幕型 | 提及次数 |
|---|---|
| recap | 33 |
| worked-example | 26 |
| concept-build | 24 |
| practice | 22 |
| contrast | 18 |
| source-reading | 15 |
| visual-observation | 15 |

分布说明：`recap`/`worked-example`/`concept-build` 覆盖最厚——这三类幕型在演示主题里天然对应"总结页/学术分隔线/内容分栏+要点列表"这类高频结构，开源生态供给充足。`source-reading` 与 `visual-observation` 覆盖相对薄——前者依赖"引文/来源"类专有装饰构件（目前主要靠 marpstyle 哲学家主题的 blockquote 版式、touying stargazer 的 tblock、beamer metropolis 的标题页层级支撑），后者依赖"几何背景/图形化装饰"（目前主要靠 touying aqua 的手绘几何背景、slidev-neocarbon 的 orbital/heatmap 类布局支撑）——后续若继续收割，应优先补这两类幕型的专属版式源。

## 未拿到的条目及原因

- **slidev-neocarbon 的 `showcase.vue` 卡片网格样式**：该文件模板本身不含 `.nc-showcase-grid`/`.nc-showcase-item` 的 CSS，样式定义在主题的 `base.css`（未在本次抓取范围内），已在对应卡片中如实标注为"未获取"而非编造数值。
- **Slidev Shibainu 的 `two-cols`/图文分栏 layout**：核实该主题包内**不存在**独立的双栏图文 layout 文件（`default`~`default-7` 都是单栏密度变体），如需双栏图文版式需另找 Slidev 其他主题包补充。
- **Slidev Shibainu 的 `fact`/`statement`**：这两个是 Slidev core 内置 layout，仅在本主题里被 CSS 覆盖而非拥有独立 `.vue` 模板，因此未单独出卡，仅在文件内作为共享基类的一部分说明。
- **Touying 除 stargazer 外的 tblock/content-block**：dewdrop、metropolis、aqua、simple 四个主题源码里均未定义 `tblock` 或等价的定理/内容框函数（用 `grep -l tblock *.typ` 核实仅 stargazer 命中一次），已在文件内逐一注明缺失而非杜撰；university 用 `matrix-slide`（棋盘网格）顶替了这个角色，已作为其第 4 张卡收录。
- **Touying stargazer 的独立 `new-section-slide`**：源码显示它并非独立实现，而是直接委托给 `outline-slide`，已在文件内注明而非当作两个不同版式重复出卡。
- **Marp Graph Paper 的原版页边距**：`graph_paper.css` 本身未覆盖 section padding，实际值继承自 Marp 官方默认主题（`marp-core/themes/default.scss` 的 `78.5px`），已在卡片"关键值"里注明是继承值、并标出继承来源文件行号。
- **Marp Rosé Pine 的 `schema`/`structure` 依赖**：`rose-pine.css` 文件顶部写了 `@import "schema"; @import "structure";`，但用 recursive tree 核实该仓库 `css/` 目录下这两个文件**并不存在**——是失效引用，实际生效版式完全继承 Marp `default` 主题、只换配色，已在卡片中如实说明，未假装这两个 import 生效。
- **Typst polylux 的版式系统**：核实 polylux 定位是"动画叠层逻辑库"（`#slide()` 只做分页计数），**不提供** title-slide/box 等主题化版式（这点和 touying 类框架有本质区别）。因此只给了 2 张卡（`bare-slide-shell` 如实说明"无版式"、`side-by-side`/`full-width-block` 摘录其仅有的两个布局原语），未按"主题"的规格去凑数硬编。
- **Beamer Metropolis 原版**：完整拿到并写卡（3 张：title-slide/frametitle/正文块间距），但许可证是 GPL/LPPL 而非 MIT——README 里已单独标注，仅供内部设计参考、不建议直接复用其代码文本本身（构图逻辑的参考不受此限制）。
