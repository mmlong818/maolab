# Touying 主题版式采集（六主题 · 源码级）

来源仓库：`github.com/touying-typ/touying`（MIT）。所有数值均直接摘自各主题 `.typ` 源码（pt/em/% 为 Typst 原生单位），未做估算或转译。共用组件（`cell`/`progress-bar`/`left-and-right`/`checkerboard`）定义于 `src/components.typ`，各主题通过它们组装版式，具体数值已在对应卡片中还原成"关键值"。

maolab 幕型对照表：source-reading / concept-build / worked-example / practice / contrast / recap / visual-observation。

---

## touying-stargazer

### touying-stargazer/title-slide
- 网格：单栏 `align(center+horizon)` 全屏对齐；标题区是一个独立 `block`，作者区在其下用 `stack(dir: ttb, spacing: 1em)` 纵向堆叠，作者按 3 人一组用 `grid(columns: (1fr,)*n, column-gutter: 1em)` 分栏。
- 区域：标题+副标题共享同一色块；作者/机构/联系方式/日期/extra 依次 `parbreak()` 排在色块之外。
- 关键值：标题块 `fill: primary`，`inset: 1.5em`，`radius: 0.5em`，`breakable: false`；标题文字 `size 1.2em bold`，副标题 `size 1.0em bold`（同色块内换行），二者都是 `neutral-lightest`；作者文字纯黑色（非主题色）；机构/联系方式 `size 0.7em`；日期 `size 1.0em`；extra `size 0.8em`；作者堆叠间距 `1em`，色块与日期间 `v(0.5em)`。页面全局 margin（继承自主题）为 `top:4em, bottom:2em, x:2.5em`；因 `self.store.title=none` 关闭了页眉渐变条，但页脚色块矩阵仍保留。
- 装饰构件：无额外线条/图形，仅一个圆角色块 + 页脚沿用主题默认的四格色块（见下）。
- 气质：厚重实心色块居中，正式发布感强。
- 建议映射幕型：concept-build（开场立锚点）；深色包（primary 深色块 + 白字）。
- 源码路径：`themes/stargazer.typ`（title-slide 定义于 L115–215）

### touying-stargazer/section-slide
- 网格：`new-section-slide` 直接复用 `outline-slide`——**stargazer 没有独立的分节页实现**，走的是"大纲页兼分节页"路径。`components.adaptive-columns` 包裹标题 + `custom-progressive-outline`。
- 区域：顶部为 header 渐变条承载当前标题；主体是章节大纲列表（当前章节高亮，其余按 alpha 变淡）。
- 关键值：outline `indent: (0em, 1em)`，`vspace: (.4em,)`，`depth: 1`，覆盖态 `alpha: 20%`（主题默认值）；标题文字 `fill: primary, weight: bold`。页眉：`height: 1.8em`，`fill: gradient.linear(primary, neutral-darkest)`，标题文字 `dx: 1.5em` 左偏移，`size 1.3em bold neutral-lightest`。
- 装饰构件：页眉是一条渐变色横条（`gradient.linear(primary → neutral-darkest)`，非纯色）；页脚四格色块 `columns: (25%,25%,1fr,5em)`，`rows: (1.5em, auto)`，第二行是 `progress-bar(height: 2pt)`。
- 气质：大纲式导航，克制、信息密度高。
- 建议映射幕型：recap / contrast（结构化列表天然适合回顾/对比）；浅色包（大纲背景是页面底色，非色块）。
- 源码路径：`themes/stargazer.typ`（`new-section-slide` L275–289 委托 `outline-slide` L228–259；页眉/页脚定义于 `stargazer-theme` L511–561）

### touying-stargazer/focus-slide
- 网格：单一 `std.align(align, body)`，`align` 默认 `horizon+center`，无网格分区。
- 区域：全屏纯色背景 + 居中文字，页眉页脚被显式关闭。
- 关键值：`config-page(fill: primary, margin: 2em, header: none, footer: none)`；文字 `fill: neutral-lightest, weight: bold, size: 1.5em`；`freeze-slide-counter: true`（不计入总页数）。
- 装饰构件：无——这是六主题里"纯色打断"最干净的一版，连页脚页码都拿掉了。
- 气质：强制注意力锚点，像一声"停顿"。
- 建议映射幕型：visual-observation / 转场停顿；深色包（纯 primary 底 + 粗白字）。
- 源码路径：`themes/stargazer.typ`（L300–317）

### touying-stargazer/tblock（内容块，独有）
- 网格：`grid(columns: 1, row-gutter: 0pt)` 纵向三段堆叠：标题条 → 4pt 分隔渐变条 → 正文条。
- 区域：标题条承载 `tblock(title:)` 的标题；正文条承载内容；中间的渐变细条是纯装饰分隔。
- 关键值：标题条 `fill: primary-dark`，`radius: (top: 6pt)`，`inset: (top: 0.4em, bottom: 0.3em, left: 0.5em, right: 0.5em)`，文字 `neutral-lightest bold`；分隔条 `height: 4pt`，`fill: gradient.linear(primary-dark → primary.lighten(90%), angle: 90deg)`；正文条 `fill: primary.lighten(90%)`，`radius: (bottom: 6pt)`，`inset: (top: 0.4em, bottom: 0.5em, left: 0.5em, right: 0.5em)`。
- 装饰构件：4pt 渐变分隔线是六主题里唯一一处"色块间的渐变缝合线"手法，值得单独抽出做母版细节。
- 气质：定理框/知识卡片，权威但不生硬。
- 建议映射幕型：concept-build / worked-example（定义-讲解类知识卡的最佳原型）；浅色包（body 底色是 primary 的 90% 提亮，接近白）。
- 源码路径：`themes/stargazer.typ`（L7–48）

---

## touying-dewdrop

### touying-dewdrop/title-slide
- 网格：`config-page(margin: 0em)` 取消页面边距后，内容自建一个 `width:100%, inset: 3em` 的外层块；块内标题区是独立的圆角色块，作者/日期/机构/联系方式/extra 各自是同级 `block(spacing: 1em)`，纵向顺序排列（非 stack，是连续 block 流）。
- 区域：圆角色块只包裹标题+副标题；其余元数据在色块外部单独成块。
- 关键值：外层 `inset: 3em`；标题色块 `fill: neutral-light`，`inset: 1em`，`radius: 0.2em`；标题文字 `size 1.3em weight medium fill primary`，副标题同块内 `linebreak()` 接排 `size 0.9em fill primary`；作者/机构/联系方式/extra 统一 `size .8em`，`block(spacing: 1em)` 间隔；标题块与日期间额外 `v(1em)`。`freeze-slide-counter: true`。
- 装饰构件：无线条/图形，唯一装饰是浅灰圆角色块本身。
- 气质：柔和克制，介于正式与轻量之间。
- 建议映射幕型：source-reading（安静开场，适合引出教材原文）；浅色包（neutral-light 灰底）。
- 源码路径：`themes/dewdrop.typ`（L138–195）

### touying-dewdrop/section-slide
- 网格：`components.adaptive-columns(start: 标题, 正文: outline)`——标题与大纲列表并列/上下自适应排布，`body` 追加在大纲之后。
- 区域：`start` 槽位是章节标题（不参与大纲的透明度渲染），下方是 `progressive-outline` 章节列表，再往下拼接真正的幻灯正文。
- 关键值：标题 `size 1.2em bold fill primary`；大纲 `alpha: 60%`（主题默认，比 stargazer 的 20% 更淡）、`indent: 1em`、`depth: self.slide-level`；正文文字 `fill: neutral-darkest`。页脚显式复用 `dewdrop-footer`：`size 0.8em`，`pad(.5em)`，`left-and-right` 双栏，左栏 `neutral-darkest.lighten(40%)`，右栏 `lighten(20%)`。
- 装饰构件：无独立分隔线；侧边栏/mini-slides 导航（若开启）在页眉以 `place(right+top)` 悬浮显示，非本卡片强制项。
- 气质：大纲与正文共存于一屏，信息量大但分层清楚。
- 建议映射幕型：contrast / recap；浅色包。
- 源码路径：`themes/dewdrop.typ`（L242–279）

### touying-dewdrop/focus-slide
- 网格：`align(horizon+center, body)` 单区块。
- 区域：全屏纯色背景居中文字。
- 关键值：`config-page(fill: primary, margin: 2em)`；文字 `fill: neutral-lightest, size: 1.5em`（**未加粗**，与 stargazer/metropolis 的 bold 不同，是六主题中少数不加粗的 focus-slide）；`freeze-slide-counter: true`。
- 装饰构件：无。
- 气质：柔和的强调，不如 stargazer 那样"喊话"。
- 建议映射幕型：visual-observation 转场；深色包（primary 底）。
- 源码路径：`themes/dewdrop.typ`（L287–295）

**tblock：dewdrop 未定义独立的内容块/定理框函数**（`grep tblock` 仅命中 stargazer.typ），故本主题无此卡片。

---

## touying-metropolis

### touying-metropolis/title-slide
- 网格：`std.align(horizon)` + `block(width:100%, inset: 2em)`；内部先 `components.left-and-right(标题区, logo)`，再紧跟一条通栏分隔线，线下是纵向 `block(spacing:1em)` 序列（author/date/institution/contact/extra）。
- 区域：标题与 logo 分居左右两栏（`grid(columns:(auto,1fr,auto))`）；分隔线以下是统一 `.8em` 的元信息流。
- 关键值：标题 `size 1.3em weight medium`；副标题同块内 `linebreak()` 接排 `size 0.9em`；logo `size 2em`；**分隔线** `line(length:100%, stroke: .05em + primary)`——这是 metropolis 的招牌视觉签名；线下文字统一 `set text(size: .8em)`；`config-page(fill: neutral-lightest)` 显式白底。
- 装饰构件：唯一装饰是那条 `.05em` 细分隔线，无色块、无图形。
- 气质：极简正式，Helvetica 风格的"学术演讲"气质。
- 建议映射幕型：concept-build（分隔线适合"承上启下"的正式开篇）；浅色包。
- 源码路径：`themes/metropolis.typ`（L126–177）

### touying-metropolis/section-slide
- 网格：`show: pad.with(20%)` 把内容强制收进页面中央 60%×60% 的区域，区域内 `align(horizon)` + `stack(dir: ttb, spacing: 1em)`：[章节标题] + [2pt 进度条]，`body` 紧随其后。
- 区域：大留白（四周各 20% pad）包裹一个"标题+细进度条"的紧凑组合，其余为呼吸空间。
- 关键值：`pad: 20%`；标题 `size 1.5em fill neutral-darkest`（**不是 primary 而是 neutral-darkest**，与其它主题的强调色标题不同）；stack `spacing: 1em`；进度条 `block(height: 2pt, width: 100%, spacing: 0pt)`，色 `primary/primary-light`；正文 `fill: neutral-dark`；`config-page(fill: neutral-lightest)`。
- 装饰构件：2pt 细进度条是唯一装饰，无背景图形。
- 气质：大量留白带来的"郑重停顿感"，是六主题里 pad 比例最夸张的一版（20% 四边）。
- 建议映射幕型：recap（留白利于"喘息+小结"）；浅色包。
- 源码路径：`themes/metropolis.typ`（L248–284）

### touying-metropolis/focus-slide
- 网格：`std.align(align, body)`，`align` 默认 `horizon+center`。
- 区域：全屏纯色背景居中文字。
- 关键值：`config-page(fill: neutral-dark, margin: 2em)`——**背景是 neutral-dark 而非 primary**，六主题中唯一用"中性深色"而非"品牌色"做打断页的主题；文字 `fill: neutral-lightest, size: 1.5em`（未加粗）。
- 装饰构件：无。
- 气质：冷静克制的强调，不诉诸品牌色的视觉冲击。
- 建议映射幕型：worked-example 间的强调断点；深色包（中性灰黑，非彩色）。
- 源码路径：`themes/metropolis.typ`（L294–306）

**tblock：metropolis 未定义独立的内容块/定理框函数**，无此卡片。

---

## touying-university

### touying-university/title-slide
- 网格：logo 用 `place(right, ...)` 悬浮于右上角，主体走 `std.align(center+horizon)` 单栏纵向：标题块（`breakable:false`）→ 作者 3 人一组 `grid` → 机构/联系方式/日期（`parbreak()` 顺序追加，无 block 包装）。
- 区域：作者信息前有 `v(1em)` 间隔；机构/联系方式/日期不像 dewdrop/metropolis 那样各自装箱，而是纯 `parbreak()` 文本流——是三个"学术抬头"类主题里最朴素的元信息排布。
- 关键值：标题 `size 2em fill primary strong()`（粗体）；副标题 `size 1.2em fill primary`；作者文字 `size .8em fill neutral-darkest`，3 人一组 `column-gutter: 1em`；机构/联系方式 `size .9em`；日期 `size .8em`；`freeze-slide-counter: true`。
- 装饰构件：仅右上角 logo 悬浮，无线条无色块。
- 气质：学术抬头式的严肃感，信息层级靠字号而非色块区分。
- 建议映射幕型：source-reading（正式的"教材溯源"开场）；浅色包。
- 源码路径：`themes/university.typ`（L137–213）

### touying-university/section-slide
- 网格：与 metropolis 同款 `show: pad.with(20%)` 四边留白 + `align(horizon)` + `stack(dir: ttb, spacing: .65em)`：[章节标题] + [2pt 进度条]，`body` 紧随。
- 区域：结构与 metropolis 几乎一致，但配色策略不同。
- 关键值：`pad: 20%`；标题 `size 1.5em fill primary weight bold`（**用 primary 而非 neutral-darkest**，与 metropolis 相反）；stack `spacing: .65em`（比 metropolis 的 1em 更紧凑）；进度条同规格 `height 2pt`，色 `primary/primary-light`。
- 装饰构件：2pt 进度条。
- 气质：与 metropolis 同构但更"品牌色主导"，留白感依旧强烈。
- 建议映射幕型：recap；浅色包。
- 源码路径：`themes/university.typ`（L227–255）

### touying-university/focus-slide
- 网格：`std.align(horizon, body)`——**只做垂直居中，未做水平居中**（不同于其余五主题清一色 `horizon+center`），是六主题里唯一遗漏水平居中的 focus-slide，实际使用时文字会贴左对齐。
- 区域：支持两种背景模式——纯色 `fill: background-color`（默认 primary）或 `background-img` 全屏拉伸图片（`image(fit:"stretch", width:100%, height:100%)`）。
- 关键值：`config-page(margin: 1em)`（六主题中最小的 focus margin，其余多为 2em）；文字 `fill: neutral-lightest, weight: bold, size: 2em`（六主题最大字号）；`freeze-slide-counter: true`。
- 装饰构件：**唯一支持背景图片**的 focus-slide 实现，其余五主题只能纯色。
- 气质：可承载真实图像的强断点，视觉冲击力最强。
- 建议映射幕型：visual-observation（唯一原生支持整页图片背景的断点母版）；深色包或图片包皆可。
- 源码路径：`themes/university.typ`（L267–297）

### touying-university/matrix-slide（内容块，独有）
- 网格：`composer: components.checkerboard.with(columns, rows)`——把传入的若干内容块自动铺进一个棋盘格 `grid`，列/行数按内容块数量自动推导（`columns` 为 `none` 时列数=内容块数，`rows` 按 `calc.quo`/`calc.rem` 补足）。
- 区域：每个 cell 是独立的 `rect(inset:.5em, width:100%, height:100%)`，按 `(row+col)` 奇偶交替填充 `primary`/`secondary` 两色（棋盘格默认 `white`/`silver`，大学主题走默认 `checkerboard` 参数，未覆写颜色）。
- 关键值：`config-page(margin: 0em)`——**全屏出血**，无外边距；每格 `inset: .5em`；`gutter: 0pt`（格子间零缝隙）；对齐方式 `alignment: center+horizon`（各格内容默认居中）。
- 装饰构件：无线条/圆角，纯粹靠棋盘格明暗交替制造分区感。
- 气质：功能主义的对比矩阵，直白到近乎"表格"。
- 建议映射幕型：contrast / practice（天然适合"多概念并排对比"或"多题并练"）；浅色包（默认 white/silver）。
- 源码路径：`themes/university.typ`（`matrix-slide` L313–330）；棋盘格实现 `src/components.typ`（`checkerboard` L401–463）

---

## touying-aqua

### touying-aqua/title-slide
- 网格：`config-page(margin: (x:0em, top:30%, bottom:0%))`——顶部让出 30% 高度，左右边距归零；内容 `align(center)` + `stack(spacing: 3em)` 纵向堆叠 4 项。
- 区域：标题→作者→日期→extra 依次纵向排列，无色块包裹，全部裸文字但字号断层明显。
- 关键值：标题 `size 48pt weight bold fill primary`；作者 `size 28pt weight regular fill primary-light`；日期 `size 20pt weight regular fill primary-light`；extra 同 `20pt`；stack 间距 `3em`；`freeze-slide-counter: true`。**页面背景始终叠加主题的几何气泡装饰**（见下）。
- 装饰构件：`background` 状态函数绘制的几何气泡装饰——四角共 8 个大小不一的圆（`radius: 40pt/21pt/13pt/8pt`，`fill: primary`，对角对称分布，用 `place()` 定位）+ 画面中央一个由 `polygon`（菱形，4 顶点，`fill: primary-lightest`）与 3 层 `ellipse`/`rect`（`white`/`primary-lightest` 交替，宽 `r*40%~45%`，高 `60pt~120pt`）叠加成的"徽章/宝石"图案，外加一颗白色小圆点 `radius:13pt` 点缀——这是六主题里**唯一的"从零手绘几何装饰背景"**，与其余主题纯靠色块/线条的克制风格截然不同。
- 气质：活泼、几何感强，像品牌视觉系统的封面页。
- 建议映射幕型：visual-observation（几何气泡装饰本身就是可复用的视觉母题捐赠者）；可做独立"氛围包"底纹。
- 源码路径：`themes/aqua.typ`（title-slide L96–148；`background` 状态定义于 `aqua-theme` L346–416）

### touying-aqua/section-slide
- 网格：`config-page(margin: (left:0%, right:0%, top:20%, bottom:0%))` + `stack(dir: ttb, spacing: 12%)`：[章节序号，纯数字巨字] + [章节标题]，`body` 紧随其后。
- 区域：序号与标题分两行居中排布，序号本身就是视觉主角。
- 关键值：章节序号 `size 166pt fill primary`（`utils.display-current-heading-number`，只取数字不取标题文本）；章节标题 `size 60pt weight bold fill primary`（`numbered: false`，避免与序号重复编号）；stack 间距 `12%`（用百分比而非固定单位，六主题唯一）；同样叠加几何气泡背景。
- 装饰构件：巨型数字本身即装饰，加背景气泡。
- 气质：杂志排版式的强烈数字视觉锚点。
- 建议映射幕型：concept-build / visual-observation（超大数字适合强调"第 N 幕/知识点序号"）；亮色品牌包。
- 源码路径：`themes/aqua.typ`（L220–255）

### touying-aqua/focus-slide
- 网格：`align(horizon+center, body)`，无背景装饰（该函数未调用 `store.background`）。
- 区域：纯色全屏居中文字。
- 关键值：`config-page(fill: primary, margin: 2em)`；文字 `fill: neutral-lightest, size: 2em, weight: bold`（与 university 并列六主题最大字号）。
- 装饰构件：无——刻意让 focus-slide 保持纯粹，与 title/section 的繁复装饰形成对比。
- 气质：短促有力的强调断点。
- 建议映射幕型：practice 间的转场停顿；深色/品牌色包。
- 源码路径：`themes/aqua.typ`（L263–271）

**tblock：aqua 未定义独立的内容块/定理框函数**，无此卡片。另注：aqua 默认 `slide()` 页眉还有一条独有装饰——`place(left+top, line(start:(30%,0%), end:(27%,100%), stroke:.5em+white))`，一条贯穿页眉/正文分界线的粗白色斜切线（`.5em` 描边），值得单独记录为"斜切装饰线"母题，可迁移进 visual-observation 包的页眉细节。

---

## touying-simple

### touying-simple/title-slide（复用 centered-slide）
- 网格：仅 `align(center+horizon, body)`——**六主题中结构最简的 title-slide，无色块、无分隔线、无字号层级预设**，标题/副标题/作者等排版完全交给调用方自行处理，主题本身不提供任何盒子。
- 区域：单一居中区域，无分区。
- 关键值：无额外 inset/fill/字号覆写；仅 `config-common(freeze-slide-counter: true)`。页面整体 margin 是 simple 主题唯一均匀设置：`margin: 2em`（四边相等，六主题中唯一不做 top/bottom/x 非对称拆分的）。
- 装饰构件：无。
- 气质：极简到近乎"空白画布"，克制到底。
- 建议映射幕型：worked-example / practice（把版面完全让给学生作答内容，理论上最适合"留白给内容本身"的场景）；浅色包。
- 源码路径：`themes/simple.typ`（`title-slide` L87–90，委托 `centered-slide` L74–79）

### touying-simple/section-slide（复用 centered-slide）
- 网格：`centered-slide` 包裹 `[标题文字][body]` 两行内容，同样只做 `align(center+horizon)`。
- 区域：章节标题一行 + 正文紧随，无进度条、无 pad-20% 大留白手法。
- 关键值：标题 `size 1.2em weight bold`（`utils.display-current-heading(level:1)`），无颜色覆写（继承正文默认色，非强调色）。
- 装饰构件：无——是六主题里**唯一不给分节页配进度条/分隔线/大留白**的实现。
- 气质：朴素直给，几乎不做仪式感。
- 建议映射幕型：practice（快速切题，不需要视觉仪式）；浅色包。
- 源码路径：`themes/simple.typ`（L96–100）

### touying-simple/focus-slide
- 网格：`align(center+horizon, body)`。
- 区域：全屏纯色居中文字。
- 关键值：`config-page(fill: background)`，`background` 默认 `auto→primary`；文字 `fill: foreground`（默认 `white`），`size: 1.5em`（未加粗）；两个参数都开放给调用方覆写，是六主题里 focus-slide 唯一把前景色也做成可配置参数的实现。
- 装饰构件：无。
- 气质：轻量转场，无戏剧性。
- 建议映射幕型：轻量转场/recap；深色包。
- 源码路径：`themes/simple.typ`（L112–129）

**tblock：simple 未定义独立的内容块/定理框函数**，无此卡片。另注：simple 默认 `slide()` 页眉页脚统一用 `deco-format`（`size .6em, fill: neutral-light`）——即页眉页脚文字被有意"去强调色化"，做成低对比度水印式小字，是六主题里唯一把 chrome 文字整体降级为中性灰的实现，可作为"极简包"页眉页脚细节的参照。

---

## 采集总结

- 覆盖主题：stargazer / dewdrop / metropolis / university / aqua / simple（共 6 个，全部来自 `themes/*.typ`，均已按精确路径拉取源码）。
- 卡片总数：20 张（stargazer 4、dewdrop 3、metropolis 3、university 4、aqua 3、simple 3）。
- 缺口说明：`tblock`/独立内容块函数仅 stargazer 定义了（`_tblock`）；university 用 `matrix-slide`（棋盘格）替代承担了"内容块"角色；dewdrop、metropolis、aqua、simple 均未定义此类函数（已在各主题末尾显式注明，未做臆造）。university 与 dewdrop/metropolis 的 section-slide 都用了 `pad: 20%` 大留白手法，值得注意是同源设计惯例而非各自独创。
