### typst-polylux/bare-slide-shell
- 网格：`#slide(body)`（`src/logic.typ`）本身不定义任何网格/分栏/标题区——它只做三件事：`pagebreak(weak:true)` 分页、`logical-slide`/`subslide` 计数器步进、以及 pdfpc 演讲者备注元数据打点；画布尺寸、边距、字体全部交给用户在调用侧用 Typst 原生 `#set page(...)` / `#set text(...)` 声明（README 示例用 `#set page(paper:"presentation-16-9")`）。核实结论：polylux 定位是"叠层动画逻辑库"（uncover/only/alternatives/one-by-one），**不提供** title-slide/box 版式系统，这点与 touying 等主题化框架有本质区别，不能按"主题"去套版式卡。
- 区域：无预设区域划分——一页 = 一个自由内容块，版式完全由使用者的 Typst 代码现场决定。
- 关键值：无版式相关数值（因为没有版式）；唯一的结构性默认值来自动画层：`uncover`/`only` 默认 cover mode 为 `hide`（即未显示的内容直接隐藏、不占位，除非显式 `reserve-space`）。
- 装饰构件：无——polylux 核心不含任何视觉装饰机制。
- 气质：极简到"空白画布"的工具库气质，去风格化、去装饰，把版式决定权完全让渡给使用者。
- 建议映射幕型：不适合直接映射幕型（无版式可抽取）；仅其动画原语（uncover/one-by-one）可作为"逐步显影"机制供 practice/worked-example 幕型的分步呈现参考，而非构图母版来源。
- 源码路径或URL：https://github.com/andreasKroepelin/polylux（`src/logic.typ` 中 `#let slide(body) = {...}`，通过 GitHub Contents API 抓取，default branch `main`）

### typst-polylux/toolbox-grid-primitives
- 网格：仓库真正提供"版式积木"的地方是 `src/toolbox/toolbox-impl.typ` 里的两个辅助函数——`side-by-side(columns: none, gutter: 1em, ..bodies)` 用 Typst 原生 `grid(columns: columns, gutter: gutter, ..bodies)` 实现等宽/自定义列分栏；`full-width-block(..args)` 通过读取当前 `page.margin`、用 `move.with(dx: -margin.left)` 位移再 `block(width: 100% + margin-x, ...)` 撑满页面（做出"出血到页边"效果）。
- 区域：`side-by-side` 生成的每一栏各自是独立内容区，栏数由传入 body 数量自动决定；`full-width-block` 生成单一跨页宽度的强调区块，常用于图片/代码整版展示。
- 关键值：`side-by-side` 默认 gutter `1em`，默认列宽全部为 `1fr`（等分）；`full-width-block` 的位移量精确等于当前页左边距 `pm.left`（负值），块宽度为 `100% + margin-x`（左右边距之和），即刚好抵消左右留白实现满宽；另有 `big(body)` 用 `block(height:1fr, width:100%)` + `layout` 测量容器尺寸后 `scale()` 内容以填满剩余高度（常用于超大字号收尾页）。
- 装饰构件：无颜色/图案装饰，纯布局原语（grid + block + scale），风格中性、可被任意主题包裹。
- 气质：工具箱式的中性构造件——不表态审美，只提供"分栏"与"出血"两个最常被使用的版式动作。
- 建议映射幕型：contrast（`side-by-side` 天然是双栏/多栏对比结构，gutter 1em 的分栏节奏可直接借用）、visual-observation（`full-width-block` 的满宽出血块适合整版图像/图表观察）；无明确 light/dark 倾向（无颜色声明，两态皆可套）。
- 源码路径或URL：https://github.com/andreasKroepelin/polylux（`src/toolbox/toolbox-impl.typ`，通过 GitHub Contents API 抓取，default branch `main`）
