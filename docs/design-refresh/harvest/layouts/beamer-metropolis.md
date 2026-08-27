### beamer-metropolis/title-slide
- 网格：单栏竖向堆叠——`\begin{minipage}[b][\paperheight]{\textwidth}` 把整页高度包成一个底对齐 minipage，内部按固定顺序依次排列（有则显示，无则跳过，不留空白）：title graphic → `\vfill` → title → subtitle → title separator（分隔线）→ author → date → institute → `\vfill` → `\vspace*{1mm}`。
- 区域：title graphic 区（零高度悬浮框，不挤占布局）；title/subtitle 主标题区（左对齐 `\raggedright`）；title separator 为贯穿 `\textwidth` 的细分隔线；author/date/institute 为底部元信息区，由上方 `\vfill` 与下方内容共同挤到页面下半部。
- 关键值：title separator 线宽 `\metropolis@titleseparator@linewidth = 0.4pt`（用 TikZ `\fill[fg] (0,0) rectangle (\textwidth, 0.4pt)` 画出，非 `\hrule`）；title 段后间距 `\vspace*{0.5em}`；subtitle 段后间距 `\vspace*{0.5em}`；author 前间距 `\vspace*{2em}`，段后 `\vspace*{0.25em}`；institute 前间距 `\vspace*{3mm}`；title graphic 顶部预留 `\vspace*{2em}`；title 用 `\linespread{1.0}` 单倍行距 + `\raggedright`（不居中、不两端对齐）。
- 装饰构件：title separator 是本主题在标题页上唯一的视觉装饰——一条 0.4pt 极细线，用 TikZ 矩形而非传统 `\rule`/`\hrule` 绘制，颜色取 `fg`（前景色，由 color theme 决定，默认近黑），克制到"几乎看不见但能定住视觉锚点"的程度。
- 气质：极度克制的排印感——无边框、无背景色块、无渐变，仅靠一条头发丝细线和精确的 em/mm 级间距做层级，是"少即是多"式学术演讲气质。
- 建议映射幕型：source-reading / concept-build 的开篇页（标题+副标题+来源信息的层级堆叠，天然适合"这节课要读什么/建什么概念"的破题页）；light/dark 均可套（分隔线色随 `fg` 语义色变量自动跟随主题反转，不需要单独适配）。
- 源码路径或URL：https://github.com/matze/mtheme（`source/beamerinnerthememetropolis.dtx`，`\setbeamertemplate{title page}` 与 `\setbeamertemplate{title separator}` 段，通过 GitHub Contents API 抓取，default branch `master`）

### beamer-metropolis/section-divider
- 网格：居中单栏——`\begin{minipage}{22em}` 固定宽度 22em 的居中版心，内部 `\raggedright` 左对齐排列 sectionhead → 进度条 → subsectionhead（若有）。
- 区域：section title 文本区（大字号章节标题）；progress bar 区（贴在标题正下方、几乎零间距）；subsection title 区（可选，同一 minipage 内跟随其后）。
- 关键值：sectionhead 与进度条之间用负间距 `\\[-1ex]` 紧贴（刻意消除标题与进度条之间的常规行距，制造"进度条是标题下划线"的错觉）；progress bar 线宽 `\metropolis@progressonsectionpage@linewidth = 0.4pt`（与标题页分隔线同规格）；进度条长度 = `\textwidth * (\insertframenumber / \inserttotalframenumber)`（当前页码/总页数的精确比例，非章节比例）；minipage 后 `\vspace{\baselineskip}`；该分节页默认用 `\frame[plain,c,noframenumbering]` 渲染——即无页眉页脚、垂直居中、不计入总页数。
- 装饰构件：进度条本质是两层 TikZ 矩形叠加——底层 `\fill[bg]` 画满宽度的浅色轨道，上层 `\fill[fg]` 按比例画深色前景条，用整个演示文稿的"已放映页数占比"做视觉度量，是本主题标志性的"全局进度感"装饰。
- 气质：把"你在整场演讲的哪个位置"变成一个安静的视觉刻度，理性、可度量、不打断阅读节奏。
- 建议映射幕型：recap / practice 之间的过渡分隔页（用进度条隐喻"课程整体进度"，契合 mainline 多幕课程的阶段切换感）；light/dark 均可套（bg/fg 均为语义色变量）。
- 源码路径或URL：https://github.com/matze/mtheme（`source/beamerinnerthememetropolis.dtx` 的 `section page`(progressbar) 模板 + `progress bar in section page` 模板；`source/beamerouterthememetropolis.dtx` 的同款 `progress bar in head/foot` 模板，通过 GitHub Contents API 抓取，default branch `master`）

### beamer-metropolis/standard-frame
- 网格：单栏正文区，上方独立 frametitle 条形头（`beamercolorbox`，`wd=\paperwidth`），下方可选 footline 条形脚（`wd=\textwidth`）。
- 区域：frametitle 区（页顶横贯全宽的标题条）；正文内容区（`\linespread{1.15}` 的常规段落/列表区）；footline 区（左侧自定义 footer 文本 + 右侧页码，`\hfill` 两端对齐）。
- 关键值：frametitle 内边距 `\metropolis@frametitle@padding = 2.2ex`（上下各留 2.2ex，通过一对不可见 strut `\rule` 撑开，而非直接 padding 属性）；frametitle 左右 `leftskip`/`rightskip` 同为 `\metropolis@frametitle@padding`（即左右也是 2.2ex，四边等距）；footline `sep=3ex`；段落间距 `\metropolis@parskip = 0.5em`（全局 `\setlength{\parskip}{0.5em}`）；正文行距 `\linespread{1.15}`；block 环境（定理/示例框）内边距 `\metropolis@blocksep = 0.75ex`，微调量 `\metropolis@blockadjust = 0.25ex`；itemize 项目符号统一为 `\textbullet`（纯圆点，无自定义图标）；`standout` 特殊页（全屏强调页）通过反转 `background canvas` 与 `palette primary` 颜色实现色块反转，且自动居中（`c` 选项）与去页码。
- 装饰构件：frametitle 条形头本身即背景色块（由 color theme 决定填色），是本主题除进度条外唯一的色块装饰；footer 的自定义文案模板 `\defbeamertemplate{frame footer}{custom}[1]{ #1 }` 允许注入面包屑文字（如章节名）。
- 气质：把"信息密度"和"呼吸感"用 ex/em 级别的精确排印控制拿捏到位——不花哨但处处经过校准，是"内容为王"的学术演讲标准形态。
- 建议映射幕型：worked-example / practice 的常规正文页（顶部条形 frametitle + 正文列表 + 底部页码的三段式结构，直接对应 mainline 的"标题-讲解体-进度页脚"三段式舞台布局）；light/dark 均可套（frametitle 色块随 color theme 反转）。
- 源码路径或URL：https://github.com/matze/mtheme（`source/beamerouterthememetropolis.dtx` 的 `frametitle`/`footline` 模板 + `source/beamerinnerthememetropolis.dtx` 的 `block`/parskip/linespread 段，通过 GitHub Contents API 抓取，default branch `master`）
