# marpstyle 排版拆解

来源仓库：`github.com/cunhapaulo/marpstyle`（MIT）。Marp CSS 主题合集，每个主题一个 `style/<name>.css`，全部 `@import "default"`（Marp 内置主题）→ `@import "schema"`（`style/schema.css`，共享 CSS 变量默认值）→ `@import "structure"`（`style/structure.css`，889 行，定义所有 class 的盒模型/机制），然后在自己的文件里覆盖颜色/字体/少量结构值。也就是说：**盒模型和 class 机制是全主题共享的，主题与主题之间的差异几乎全部落在配色变量和字体上**，只有少数主题（heidegger/jobs/turing 的 h1 出血条、gropius/orwell/pascal 的完整 token 化)才动了结构层。以下先记录共享机制，再逐主题给卡片。

## 共享机制（structure.css + schema.css，全部主题继承）

- **Title slide**：`<!-- _class: titlepage -->`，一列布局，无网格。`.title`/h1 走 `--title-size: 150%`（schema 默认）、`font-weight: var(--title-font-weight)`(默认 600)、`border-bottom: 1px solid var(--border-color)`、`padding-bottom: 15px`；`.subtitle`/h2 走 `--subtitle-size: 110%`，**`padding-bottom: 120px`（structure.css 中 `.subtitle` 规则）或 95px（`titlepage h2` 规则）**——即标题与副标题之间被一段巨大留白撑开，不是网格分区。`.author`/`.date`/`.organization`/h3-h5 默认 `text-align: right`（schema `--author-align: right`），但 22 个主题里绝大多数显式把这三行改回 `text-align: left`（只有极少数保留右对齐）。titlepage 隐藏 header/footer/pagination。
- **Body slide**：无专门"内容区"网格，`section p` 全局 `font-size: 32px; line-height: 1.3em`，`section li` `font-size: 105%`；h1 `border-bottom: 1px solid var(--border-color)` 做唯一的分区装饰。`.columns`/`.columns3`（及 `-center` 变体）用 CSS Grid `repeat(2|3, minmax(0,1fr))`，gap 0.5rem–1rem，是本主题族仅有的显式分栏机制。
- **签名装饰构件——Citation 卡（`<!-- _class: cite -->`）**：整页背景色块（`section.cite { background-color }`），`section.cite p` 居中、`font-size: 150%`、`padding-left/right: 100px`（左右各留 100px 安全边），衬线字体（Cambria/Georgia/Times 或主题自定义），隐藏 header/footer/pagination——本质是"全屏引语卡"，不是加引号符号而是整页变色+居中+加大字号的仪式感处理。姊妹 class `cite2` 用于白底强制版本。
- **Blockquote（脚注机制）**：`section blockquote { border-top: 0.1em dashed var(--extra-back-color); font-size: 20px; margin-top: auto }`，被设计成"放在幻灯片最后一个元素"的脚注条，不是正文引用块。
- **Transition/Transition2/Transition3**：整页纯色背景+居中巨大文字（`font-size: 200%`），用作章节分隔页，隐藏 header/footer/pagination。
- **Biblio**：整页背景色块，`h1 35px`，`p 80%`，`a 31px bold`，用于参考文献页。
- 定位工具类 `.topleft/.topright/.bottomleft/.bottomright`（`position:absolute; top/bottom:38px; left/right:26px`）、`.centered`（`top:50%; width:100%; text-align:center`）——供自由摆放少量文字用，不构成网格系统。

以下 22 个哲学家/科学家主题按字母序列出，每个含 `<theme>/cover`（titlepage）与 `<theme>/body`（常规内容页，含 cite 签名构件）两张卡。数值凡未在主题文件中覆盖，标注为"继承 schema 默认"。

---

### marpstyle-arendt/cover
- 网格：titlepage 单栏布局（见共享机制），author/date/organization 显式改回 `text-align: left`。
- 区域：title 左对齐+下划线；subtitle 走 schema 默认 `--subtitle-font-weight: 300`（本主题改为覆盖为 300，比默认更细）。
- 关键值：`--default-background-color: #e4d5a6`（暖驼色纸张），`--default-font-color: rgb(68,19,16)`（深棕），h1 border 用 `--default-border-color: 2px solid rgb(211,34,11)`（砖红，比共享默认的 1px 更粗）。
- 装饰构件：`--default-header-bold-font-color: rgb(228,5,5)` 让 h1 内 `<strong>` 变亮红；biblio 背景改深蓝 `rgb(22,28,43)` 形成夜间参考页。
- 气质：暖驼纸张 + 砖红粗线，档案感、书斋感。
- 建议映射幕型：source-reading（纸张色+衬线倾向的正文字重适合长文本阅读）；light 包。
- 源码路径：style/arendt.css

### marpstyle-arendt/body
- 网格：共享 body 机制，正文字体 `'Fira Sans'`/BodyFont，`p 36px`，`ul/ol 30px` 且 `font-weight: 600 !important`（比共享默认更粗，正文密度高）。
- 区域：cite 卡背景改浅蓝灰 `rgb(216,222,233)`，字体切换为 Cambria/Georgia 衬线，与正文暖驼色形成冷暖对比。
- 关键值：`--default-strong-font-color: rgb(201,59,34)` 砖红强调；table th 背景 `#4d768a`。
- 装饰构件：cite 卡 `--strong-color: #4d75a5` 蓝灰强调词，与页面主砖红形成"引语区单独配色"的信号。
- 气质：暖色书页正文，引语页转冷做视觉停顿。
- 建议映射幕型：source-reading 正文 + cite 卡可单独复用为 recap 收束页；light 包。
- 源码路径：style/arendt.css

### marpstyle-copernicus/cover
- 网格：titlepage 单栏，本主题**未覆盖** author/date/organization 对齐，但也未见到反向覆盖，需以 schema 右对齐默认为准（未在文件中改左对齐）。
- 区域：`.title`/h1 `font-family: 'Fira Sans'; font-weight:600; border-bottom: 1px solid rgb(243,243,223)`（近白色细线，弱对比）。
- 关键值：titlepage 背景 `#7790c7`（中蓝紫）比正文背景 `#bbc7e7`（浅蓝紫）更深——**封面比正文暗**，与本族其余主题"封面浅/正文深"或同色的常规相反。
- 装饰构件：titlepage `.subtitle` 颜色 `#dcdee0`（近白灰）在深蓝紫底上做低对比副标题。
- 气质：天体蓝紫，冷静而略带庄重的"宇宙尺度"感。
- 建议映射幕型：visual-observation / concept-build（适合展示星图、模型示意图）；cool-light 包。
- 源码路径：style/copernicus.css

### marpstyle-copernicus/body
- 网格：共享机制；h1 `color: rgb(1,25,99)` 深靛蓝，`letter-spacing: -1.25px`；h2 红色 `rgb(199,13,0)` 作二级强调色，与 h1 蓝形成撞色层级。
- 区域：`section li { font-size: 25pt; color: rgb(53,59,70) }`（比共享默认 105% 更明确的绝对值）。
- 关键值：em 背景色多次覆盖，最终生效 `rgba(119,144,199,0.349)`（半透明蓝紫高亮）。
- 装饰构件：strong 最终色 `rgb(74,5,250)`（艳紫）；transition strong 橙 `rgb(255,166,1)` 斜体。
- 气质：蓝紫为主、红橙点缀的"日心说"式冷暖对撞。
- 建议映射幕型：concept-build（蓝/红双色适合"旧模型 vs 新模型"对照）；cool 包。
- 源码路径：style/copernicus.css

### marpstyle-descartes/cover
- 网格：titlepage 单栏，author/date/organization 显式左对齐。
- 区域：h1 `padding-bottom: 2mm; margin-bottom: 12mm`（比共享默认更大的下边距，标题与正文之间留白明显加宽）。
- 关键值：titlepage `.title` border-bottom 固定 `1px solid orangered`（未变量化，直接写死）。
- 装饰构件：无特殊封面构件，走 schema 默认结构。
- 气质：素净、留白偏大，"我思"式的克制理性。
- 建议映射幕型：worked-example（大留白利于分步演算展示）；light 包。
- 源码路径：style/descartes.css

### marpstyle-descartes/body
- 网格：共享机制；`h1 { color: rgb(53,80,112) }`（钢青色，多次覆盖后的最终值）；`p { font-size: 26pt; font-weight: 600; color: rgba(78,78,80,0.814) }`。
- 区域：`h2 strong { color: red }`——本主题唯一给二级标题内加粗字单独定色的规则。
- 关键值：body 背景 `rgb(238,244,237)`（近白薄荷）；strong 级联覆盖后最终色 `rgb(229,107,111)`（灰玫瑰）。
- 装饰构件：`section.transition em { background-color: rgb(255,166,0) !important }` 橙色高亮块；transition strong 用 `text-shadow: 2px 2px 10px rgb(101,45,3)` 做投影强调。
- 气质：薄荷白底 + 钢青标题 + 灰玫瑰强调词，理性中带一点温度。
- 建议映射幕型：worked-example / contrast（灰玫瑰与钢青可做双方对照标记）；light 包。
- 源码路径：style/descartes.css

### marpstyle-einstein/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；`--subtitle-font-weight: 300`。
- 区域：h1/title `border-bottom: var(--default-border-color)` = `1px solid rgb(253,101,0)`（橙色细线，深色底上对比强）。
- 关键值：`--default-background-color: #3e3f42`（炭灰，**深色封面**），`--default-font-color: #edf2f5`（近白）。
- 装饰构件：h1 内 strong 用 `--default-header-bold-font-color: rgb(250,118,70)`（暖橙），与冷灰底形成"黑板+粉笔橙"效果。
- 气质：炭灰黑板 + 橙色下划线，理科课堂感强烈。
- 建议映射幕型：concept-build / worked-example（黑板既视感契合公式推导）；dark 包。
- 源码路径：style/einstein.css

### marpstyle-einstein/body
- 网格：共享机制；`:root p { font-size: 32px }`，`ul/ol { font-size: 27px }`，标题色 `--default-header-font-color: #8bb1c5`（雾蓝）。
- 区域：cite 卡背景 `#d8dee9`（浅灰蓝）——在炭灰正文中间插入一张"发光"的浅色引语卡，明暗反转。
- 关键值：strong 色 `--default-strong-font-color: rgb(216,183,77)`（暗金）；code 无覆盖，走 structure 默认。
- 装饰构件：cite 强调色 `#4d75a5`；columns 内文字统一走炭灰底白字规则 `color: var(--default-font-color)`。
- 气质：炭灰底暗金强调，cite 卡作为唯一的"高亮时刻"跳出。
- 建议映射幕型：worked-example 主体 + cite 卡做 recap 收束（明暗反转制造"记住这句话"的仪式感）；dark 包。
- 源码路径：style/einstein.css

### marpstyle-freud/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；h2/subtitle `font-weight: 300`；h3-h5 右对齐（未被本主题覆盖为左对齐，是本族少数保留右对齐 metadata 的主题之一）。
- 区域：h1/title border-bottom 固定 `1px solid orangered`。
- 关键值：`:root` 背景色多次覆盖，最终生效 `#f4f4ed`（米白）；`--h1-color` 最终 `#06858e`（青绿）。
- 装饰构件：`--bold-color` 最终 `#0d2d58`（深靛蓝）。
- 气质：米白纸面 + 青绿标题，克制的诊室色调。
- 建议映射幕型：source-reading；light 包。
- 源码路径：style/freud.css

### marpstyle-freud/body
- 网格：共享机制，字体 `'Fira Sans'`；`--list-item-color: rgb(255,212,95)`（暖黄，列表项专属色，少见）。
- 区域：cite 卡整页切换为深色 `--background-color: #49454f`（灰紫黑），`cite p { color: #fffbfe }`（近白），`cite strong { color: #f87ca1 }`（粉）——正文米白、引语页整页转黑，明暗反转最彻底的一组之一。
- 关键值：`--table-header-color: rgb(0,132,255)`（亮蓝表头）；transition2 背景 `#c53732`（暗红）。
- 装饰构件：cite 卡的黑底粉字是本主题唯一的强反差装饰。
- 气质：米白诊室基调 → 引语页骤转暗紫黑，像"潜意识"浮现的视觉隐喻。
- 建议映射幕型：contrast（表层米白 vs 深层暗紫黑，天然适合"显性/潜在"对照）或 recap（cite 卡做深色收尾）；light 包（cite 卡局部深色）。
- 源码路径：style/freud.css

### marpstyle-godel/cover
- 网格：titlepage 单栏，author/date/organization 左对齐。
- 区域：title border-bottom 固定 `1px solid orangered`。
- 关键值：背景 `white`（本族少数纯白封面之一）；`--bold-color: rgb(71,107,184)`（灰蓝）。
- 装饰构件：`h2 strong { color: rgb(207,14,14) }`——二级标题内的强调词单独定为红色。
- 气质：纯白极简，逻辑证明式的克制。
- 建议映射幕型：worked-example（纯白利于公式/证明步骤无干扰呈现）；light 包。
- 源码路径：style/godel.css

### marpstyle-godel/body
- 网格：共享机制；strong 级联覆盖后最终色 `rgb(211,43,80)`（玫红）。
- 区域：biblio 背景改纯黑 `rgb(0,0,0)`——本族少数把参考文献页做成纯黑底的主题。
- 关键值：`--italic-background-color` 级联覆盖后最终 `rgba(238,194,159,0.616)`（浅杏色高亮）；`--cool-list-color: rgb(135,157,179)`。
- 装饰构件：cite `--strong-color: rgba(255,5,5,0.795)` 半透明红。
- 气质：白底红/玫红强调，克制中带一处强对比。
- 建议映射幕型：worked-example / practice（白净背景利于反复演算与判题）；light 包。
- 源码路径：style/godel.css

### marpstyle-gropius/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；本主题把几乎所有数值都改成具名变量（`--titlepage-title-font-size` 等），是本合集里**结构 token 化程度最高**的主题。
- 区域：`.title`/h1 `font-family: 'Droid Sans'/'Futura Std'; font-size: 34pt; font-weight: 700`（固定 pt 而非 schema 默认的相对 150%）；`.subtitle`/h2 `font-family: 'Open Sans Light'; font-size: 26pt; font-weight: 700; color: rgb(7,7,224)`（深蓝）。
- 关键值：`--default-background-color: #b8c2f9`（浅紫蓝）；全局 `--default-font-size: 22pt !important`（固定字号，不随视口缩放）。
- 装饰构件：h1 使用 `text-shadow: -10px 2px 45px #0c3157b4`（大范围模糊投影，形成"发光"标题效果），letter-spacing `-1.76px`（紧缩字距）——本合集唯一给标题加大幅度模糊光晕的主题。
- 气质：包豪斯几何感 + 发光标题，系统化且带舞台聚光灯效果。
- 建议映射幕型：concept-build（发光标题适合"揭晓核心概念"的开场时刻）；light 包。
- 源码路径：style/gropius.css

### marpstyle-gropius/body
- 网格：共享机制全面 token 化，`p { font-size: var(--p-font-size): 112%; line-height: 112% !important }`；`li { font-size: 22pt !important }`。
- 区域：code 块 `background-color: rgba(206,252,0,0.726)`（荧光青柠）+ `border-radius: 13pt`（四角同值，近似胶囊形）。
- 关键值：h1 `font-family: 'Montserrat'; font-size: 36pt; font-weight: 600; letter-spacing: -1.76px`，同样带 text-shadow 光晕，正文页与封面页标题处理手法统一。
- 装饰构件：cite 卡背景 `rgb(154,173,226)`（浅蓝紫），`cite p { font-family: 'Faustina'; font-size: 34pt; font-weight: 600 }` 衬线大字；transition 背景 `rgb(115,137,196)`，transition2 背景 `#ffa700`（橙）。
- 气质：包豪斯几何 + 荧光胶囊代码块，系统化到近乎"设计规范文档"的严谨感。
- 建议映射幕型：concept-build（token 化程度高，适合展示体系化的知识结构）；light 包。
- 源码路径：style/gropius.css

### marpstyle-hegel/cover
- 网格：titlepage 单栏，仅覆盖 author/date/organization 左对齐，其余**完全继承 schema.css 默认值**（`--background-color: #fdf6e3`，title-size 150%，border-color 橙）。
- 区域：无任何自定义区域规则。
- 关键值：`font-family: ;`（空值，级联为浏览器默认 sans-serif）——本合集中字体声明最"空白"的主题。
- 装饰构件：无。
- 气质：几乎是"裸机"schema 默认——素纸+橙线，未经打磨的基线状态。
- 建议映射幕型：可作为 practice/recap 的中性画布（内容承载优先于风格表达）；light 包。
- 源码路径：style/hegel.css

### marpstyle-hegel/body
- 网格：完全继承 schema.css + structure.css 默认（正文 `p 32px`、`li 105%`、h1 黑色+橙线）。
- 区域：cite 卡走 schema 默认 `background-color: #fdf6e3; --strong-color: rgb(182,112,27)`（未被本文件覆盖）。
- 关键值：无覆盖，`--bold-color: orangered`（schema 默认）。
- 装饰构件：无额外装饰，是本合集里最"素"的一张 body 卡。
- 气质：基线感，可作对照组或"未风格化"参照。
- 建议映射幕型：practice（无风格干扰，适合纯粹的题目/答案呈现）；light 包。
- 源码路径：style/hegel.css

### marpstyle-heidegger/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；`.title strong { color: rgb(255,52,52) }`。
- 区域：titlepage h1 **取消**了正文页 h1 的出血黑条效果，改回 `border-bottom: 1px solid orangered; color: #00254b; padding/margin 归零`——即封面与正文对同一个 h1 选择器做了完全不同的两套处理。
- 关键值：`:root` 背景色多次覆盖，最终生效 `#f8b632`（芥末黄）。
- 装饰构件：`section.transition { --transitionpage-color: rgb(207,24,24); font-weight:bold; text-shadow: 4px 4px 0 rgb(53,38,38) }`——硬投影文字，戏剧感强。
- 气质：芥末黄底 + 深红过渡页，沉重而戏剧化。
- 建议映射幕型：concept-build（黄底适合引出议题）；light 包。
- 源码路径：style/heidegger.css

### marpstyle-heidegger/body
- 网格：共享机制；`:root h1 { background-color: #080a0a; padding-top:10pt; padding-left:60pt; margin-left:-60pt; margin-right:-60pt }`——**h1 变成一条贯穿版心的黑色出血条**（负 margin 撑出到画布边缘），文字色 `#d9dee6`（浅灰白）浮在黑条上，是本合集里最强烈的标题装饰构件。
- 区域：黑条之下是芥末黄正文区，形成强烈明暗切割。
- 关键值：`h1 strong { color: rgb(255,52,52) }`（黑条上的红色强调词）。
- 装饰构件：黑色出血条（唯一功能性装饰，替代了共享机制里普通的橙色下划线）。
- 气质：黑色重锤标题条 + 芥末黄正文，压迫感与存在主义的"沉重"感一致。
- 建议映射幕型：concept-build / contrast（黑条天然适合切出"核心命题"，与下方内容形成层级对比）；light 包（正文黄底，标题黑条）。
- 源码路径：style/heidegger.css

### marpstyle-hume/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；`section.titlepage .title, h1 { border-bottom: 1px solid orangered }`——本主题把 titlepage 标题规则与正文 h1 规则合并成一条选择器，两处用同一条橙线。
- 区域：无额外结构覆盖。
- 关键值：`:root` 背景多次覆盖，最终 `#b4bfdb`（雾蓝紫）；`font-size: 22pt`（固定字号）。
- 装饰构件：无特殊封面构件。
- 气质：雾蓝紫、柔和，经验主义式的温和怀疑基调。
- 建议映射幕型：source-reading；light 包。
- 源码路径：style/hume.css（27.jan.2025 版本，与下方 hume-background-red 为姊妹文件）

### marpstyle-hume/body
- 网格：共享机制；`h1 { font-size:30pt; font-weight:500; color: rgb(52,86,119) }`（钢青，多次覆盖后最终值）；`p { font-size:120%; font-weight:500 }`。
- 区域：code 块 `background-color: rgba(206,252,0,0.877)`（荧光青柠，与 gropius 手法呼应）。
- 关键值：strong 最终色 `rgb(247,71,1)`（橙红）；cite `--strong-color: rgba(255,218,5,0.795)`（半透明黄）。
- 装饰构件：transition strong 用 `text-shadow: 2px 2px 10px rgb(101,45,3)` 投影。
- 气质：雾蓝紫底 + 橙红/荧光黄点缀，温和中带一点跳脱。
- 建议映射幕型：source-reading / recap；light 包。
- 源码路径：style/hume.css

### marpstyle-hume-background-red/cover
- 网格：titlepage 单栏，author/date/organization 左对齐。
- 区域：title border-bottom 固定 `1px solid orangered`。
- 关键值：`:root` 背景 `#f3f1ec`（**暖白/奶油色，并非文件名暗示的"红色背景"**——命名与当前实现已脱节，红色只出现在强调词而非背景）；titlepage 背景同样为 `#f3f1ec`。
- 装饰构件：无特殊封面构件。
- 气质：奶油纸面，文件名的"红"实际落在强调色上而非底色，需要设计师知晓这个命名陷阱。
- 建议映射幕型：source-reading；light 包。
- 源码路径：style/hume - background - red.css（16.jun.2024 版本，import Open Sans/PT Sans，与上方 hume.css 为同名不同版本的姊妹文件）

### marpstyle-hume-background-red/body
- 网格：共享机制；`h1 { color: rgb(11,37,69); letter-spacing:0.25pt; margin-bottom:12mm }`；`p { font-size:26pt; font-weight:600 }`。
- 区域：strong 级联覆盖后最终色 `rgb(179,31,63)`（暗红，是本文件里唯一真正呼应"red"命名的颜色）。
- 关键值：cite `--strong-color: rgba(255,5,5,0.795)`（半透明红）。
- 装饰构件：transition em 背景 `rgb(255,166,0)`（橙）。
- 气质：奶油纸面上的暗红强调词，克制的警示感。
- 建议映射幕型：recap（暗红强调词适合做"划重点"收束）；light 包。
- 源码路径：style/hume - background - red.css

### marpstyle-husserl/cover
- 网格：titlepage 单栏，author/date/organization 用 Lora 字体、左对齐。
- 区域：`.title, h1 { font-family:'Lora'; border-bottom:1px solid orangered; letter-spacing:-.85px }`；`.subtitle, h2 { font-weight:100 }`（极细字重）。
- 关键值：正文/标题字体统一 `'Lora'`（衬线，本合集少数以衬线字体贯穿全主题的例子）；背景 `rgb(219,223,227)`（冷灰）。
- 装饰构件：h1 `margin-bottom: 9mm`（比共享默认略窄的下边距）。
- 气质：文学化衬线字体 + 冷灰纸面，现象学式的沉思阅读感。
- 建议映射幕型：source-reading（本合集里衬线+超大行高的组合，最贴合长文本阅读）；light 包。
- 源码路径：style/husserl.css

### marpstyle-husserl/body
- 网格：共享机制被覆盖：`p { font-family:'Lora'; font-size:115%; line-height:37px }`——**行高用绝对像素值而非相对单位**，是本合集唯一如此处理正文行高的主题，专为长段落阅读优化。
- 区域：h1/h2 颜色多次级联，最终分别为 `rgb(53,80,112)`/`rgb(39,89,149)`（钢青/靛蓝）。
- 关键值：cite p `font-family:'Lora'; font-style: italic; letter-spacing:-0.5px`（斜体衬线引语，比共享默认的直体更贴近"引用感"）。
- 装饰构件：biblio 背景改深蓝 `rgb(26,75,113)`。
- 气质：冷灰纸面 + 斜体衬线引语，最适合长文本与学术引用共存的场景。
- 建议映射幕型：source-reading（首选）/ recap（cite 斜体引语收束）；light 包。
- 源码路径：style/husserl.css

### marpstyle-jobs/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；`.title strong { color: rgb(255,52,52) }`。
- 区域：`.title { font-family:'San Francisco 400'; border-bottom:1px solid rgb(29,107,209) !important }`——蓝色下划线取代共享默认的橙色，是打破"orangered 惯例"的主题之一。
- 关键值：背景 `white`；正文色 `#494545`（暖灰）。
- 装饰构件：自定义 `@font-face` 引入 Apple San Francisco 全字重家族（Ultra Light/Thin/Regular/Bold），是本合集里唯一做多字重字体系统的主题。
- 气质：Keynote 式产品发布会简洁感，蓝色下划线替代橙色打破惯例。
- 建议映射幕型：concept-build / worked-example（发布会式的清晰演示节奏）；light 包。
- 源码路径：style/jobs.css

### marpstyle-jobs/body
- 网格：共享机制被局部改写：`:root h1 { border-bottom:1px solid rgb(29,107,209) !important; padding-top:10pt; padding-left:60pt; margin-left:-60pt; margin-right:-60pt }`——与 heidegger 同款的"h1 出血条"手法，但此处**不设背景色**，只是把下划线和内边距拉伸到出血，视觉上是一条更长的蓝线而非黑色色块。
- 区域：`p { font-size:34px; font-family:'San Francisco 400' }`。
- 关键值：cite 卡背景 `rgb(32,62,77)`（深青蓝），`cite p { font-family:'Minion Pro'; font-size:48px }`（大号衬线拉页引语）。
- 装饰构件：transition2 背景 `rgb(8,74,100)`（深青），字号 `200%`。
- 气质：留白充裕的产品发布会正文，cite 卡是全场唯一的深色大字时刻。
- 建议映射幕型：worked-example 主体 + cite 卡做 recap（48px 大字适合"金句收尾"）；light 包。
- 源码路径：style/jobs.css

### marpstyle-kant/cover
- 网格：titlepage 单栏，仅覆盖 author/date/organization 左对齐，其余继承 schema 默认。
- 区域：无额外覆盖。
- 关键值：字体 `'Fira Sans Light'`（+ 引入 Fira Sans Book 字重，但未在规则中实际指定使用位置）。
- 装饰构件：无。
- 气质：与 hegel 类似的"近乎空白"基线，形式上的克制对应"纯粹理性"的极简诉求。
- 建议映射幕型：practice / recap 中性画布；light 包。
- 源码路径：style/kant.css

### marpstyle-kant/body
- 网格：完全继承 schema.css + structure.css 默认。
- 区域：无覆盖。
- 关键值：`--background-color: #fdf6e3`（schema 默认，未变）。
- 装饰构件：无。
- 气质：本合集中与 hegel 并列的"最不加修饰"body 卡，可视为基线对照组。
- 建议映射幕型：practice；light 包。
- 源码路径：style/kant.css

### marpstyle-king/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；`h1,h2,h3,h4,h5 { color: var(--default-font-color) !important }`。
- 区域：h1/title border 用 `--default-border-color: 2px solid rgb(253,194,0)`（金色，2px 比共享默认 1px 更粗）。
- 关键值：`--default-background-color` 多次覆盖，最终 `#20242c`（近黑石板，Nord 配色风格），`--default-font-color` 最终 `#E5E9F0`（雪白）。
- 装饰构件：无额外封面构件，金色粗线是唯一强调。
- 气质：Nord 深色调色板 + 金色粗线，庄重的暗色演讲厅感。
- 建议映射幕型：contrast / visual-observation（深色底适合承载截图/深色代码示例）；dark 包。
- 源码路径：style/king.css

### marpstyle-king/body
- 网格：共享机制；`p { font-size:32px; font-family:"FrutigerNextW04-Regular",'Open Sans' }`；`ul/ol { font-size:27px; font-family:"Fira Sans Light" }`。
- 区域：cite 卡背景改浅色 `#D8DEE9`，与深色正文形成明暗反转的"引语弹出层"。
- 关键值：strong 色 `rgb(211,172,43)`（金黄）；table th 背景 `#3e5d86`。
- 装饰构件：cite `--strong-color` 两次覆盖，最终 `#4d75a5`（灰蓝）。
- 气质：石板黑正文 + 浅色引语弹出层，Nord IDE 式的沉稳深色主题。
- 建议映射幕型：contrast 主体 + cite 卡做 recap；dark 包。
- 源码路径：style/king.css

### marpstyle-leibniz/cover
- 网格：titlepage 单栏，`--title-font-weight: 300; --subtitle-font-weight: 300`——**把 schema 默认的 600 粗体标题改成 300 细体**，是本合集唯一让 titlepage 标题变细的主题。
- 区域：author/date/organization 左对齐；`--title-size:150%; --subtitle-size:110%; --author-size/--date-size:105%`（略降于 schema 默认的 110%）。
- 关键值：`font-family: Cochin, Georgia, Times, 'Times New Roman'`（经典衬线字体栈）。
- 装饰构件：无特殊构件，靠字重反差营造气质。
- 气质：经典衬线 + 细体标题，理性而不张扬的"演算手稿"感。
- 建议映射幕型：concept-build（细体标题适合"引入新概念"而非宣告式开场）；light 包。
- 源码路径：style/leibniz.css

### marpstyle-leibniz/body
- 网格：共享机制；`h1 { color: var(--h1-color); font-weight: var(--title-font-weight); border-bottom:1px solid var(--border-color) }`——h1 也复用了 titlepage 的字重变量，全篇标题统一偏细。
- 区域：`table { font-family: sans-serif }`（表格单独切回无衬线，与正文衬线形成功能性区分）。
- 关键值：`--bold-color: blue`（纯蓝，未用 rgba/hex，直接色名）。
- 装饰构件：biblio p `font-size:80%; font-weight:300; padding-left:5px`。
- 气质：衬线手稿 + 表格无衬线的功能性切换，克制的学术手稿气质。
- 建议映射幕型：concept-build / worked-example；light 包。
- 源码路径：style/leibniz.css

### marpstyle-orwell/cover
- 网格：titlepage 单栏，与 gropius/pascal 共享同一套 token 化变量命名体系（`--titlepage-title-font-size` 等），author/date/organization 左对齐。
- 区域：`.title { font-size:32pt; padding-bottom:6pt }`；`h2 { padding-bottom:150pt !important }`（比共享默认 95/120px 更夸张的巨量留白，标题区与正文区之间几乎清空一整屏）。
- 关键值：`--default-background-color` 两次覆盖，最终 `rgb(216,222,233)`（浅灰蓝）；`--h1-color:#32446b`（藏青）。
- 装饰构件：`--h1-font-weight:900`（超粗体，本合集里 h1 字重最重的主题之一）。
- 气质：藏青超粗标题 + 巨量留白，克制中带纪律感。
- 建议映射幕型：concept-build（大留白 + 超粗标题适合"宣告核心论点"）；light 包。
- 源码路径：style/orwell.css

### marpstyle-orwell/body
- 网格：共享机制被 token 化改写；`p { font-size:112%; font-weight:500; line-height:112% !important }`。
- 区域：`--italic-color:#ffffff; --italic-background-color:#ee0909`——**斜体文字变成白字配警戒红底色块**，形成"审查/警告标记"式的强反差高亮，是本合集里唯一把 em 处理成"警报红块"的主题。
- 关键值：`--bold-color:#e70000`（正红，非橙红）；cite 背景 `#8aa1e2`/`#9aade2`（浅蓝紫，两次覆盖）。
- 装饰构件：code 块荧光青柠背景 `rgba(206,252,0,0.493)` + 13pt 圆角。
- 气质：警戒红高亮块 + 藏青正文，"老大哥在看着你"式的规训感天然契合。
- 建议映射幕型：contrast（红色警报块适合标出"错误/反例"）或 recap（红块强调"记住这条规则"）；light 包。
- 源码路径：style/orwell.css

### marpstyle-pascal/cover
- 网格：与 orwell/gropius 同一套 token 化体系，titlepage 单栏，author/date/organization 左对齐。
- 区域：`.title { font-size:32pt; padding-bottom:6pt }`；`h2 { padding-bottom:150pt !important }`（与 orwell 相同的巨量留白手法）。
- 关键值：`--default-background-color` 三次覆盖，最终 `#f5f5f5`（近白中性灰，比 orwell 更浅、更中性）；`--h1-color:#25478f`（靛蓝，比 orwell 藏青更亮）。
- 装饰构件：`--h1-font-weight:900`（同样超粗体）。
- 气质：中性灰白 + 靛蓝超粗标题，工程笔记本式的精确感（对应 Pascal 的数学家身份）。
- 建议映射幕型：worked-example（中性灰白背景利于呈现计算/公式，超粗标题分隔"定理/证明"段落）；light 包。
- 源码路径：style/pascal.css

### marpstyle-pascal/body
- 网格：与 orwell 同款 token 化机制；`--italic-color:#ffffff; --italic-background-color:#ee0909`——**同样的白字警戒红块 em 处理**，与 orwell 共享同一套设计语言，此处可读作"标记边界情况/易错点"而非政治审查隐喻。
- 区域：`--bold-color:#e70000`；cite 背景固定 `#9aade2 !important`（未做多次覆盖，直接锁定）。
- 关键值：`p { font-size:112%; line-height:112% !important }`（与 orwell 数值完全一致，印证两者共享引擎）。
- 装饰构件：code 块荧光青柠背景（同 orwell/gropius 手法）。
- 气质：中性灰白工程笔记 + 红色警示块标出"注意此处"，理性中带精确的警觉。
- 建议映射幕型：worked-example / practice（红块标出常见错误或边界条件，适合练习页的"易错提示"）；light 包。
- 源码路径：style/pascal.css

### marpstyle-plato/cover
- 网格：titlepage 单栏，仅覆盖 author/date/organization 左对齐，其余（title-size 150%、subtitle padding-bottom 120px、border-color 橙）继承 schema 默认。
- 区域：`.title { border-bottom: 1px solid orangered }`（直接写死颜色，未走变量）。
- 关键值：字体 `'Fira Sans Light'`（引入 Fira Sans Book 但未见实际指定使用处）；背景继承 schema 默认 `#fdf6e3`（未覆盖）。
- 装饰构件：无额外封面构件。
- 气质：与 hegel/kant 同属"近乎空白"的一组，素纸+橙线的学院基线感。
- 建议映射幕型：source-reading / recap（作为中性基线画布，配合其他构件叠加使用）；light 包。
- 源码路径：style/plato.css

### marpstyle-plato/body
- 网格：完全继承 structure.css 默认（`p 32px`、`li 105%`、h1 橙线）。
- 区域：`section strong` 颜色两次覆盖，最终生效 `rgba(5,43,255,0.979)`（半透明宝蓝）。
- 关键值：`--italic-background-color` 两次覆盖，最终 `rgba(255,86,8,0.185)`（浅橙高亮）；cite `--strong-color: rgba(255,5,5,0.795)`（半透明红，未覆盖 cite 背景色，继续走 schema 默认 `#fdf6e3`）。
- 装饰构件：`section.transition2 strong` 颜色两次覆盖，最终 `rgb(161,240,3)`（荧光青柠）。
- 气质：素纸底 + 宝蓝强调词，橙色高亮点缀，是本合集里改动最少、最接近"裸机 schema"的 body 卡之一（与 hegel/kant 共属基线组，三者可作为对照）。
- 建议映射幕型：source-reading（首选，素净适合长文本）；light 包。
- 源码路径：style/plato.css

### marpstyle-socrates/cover
- 网格：titlepage 单栏，author/date/organization 左对齐；`.title { border-bottom: 0px solid var(--border-color) }`——**把标题下划线粗细显式设为 0**，是本合集唯一彻底取消 titlepage 标题下划线的主题。
- 区域：`h2 { font-weight:300 }`（细体副标题）。
- 关键值：`--title-color:#1d395a`（深蓝，覆盖 schema 默认的多组红/蓝级联值）；字体 `'Lato'`（人文无衬线）。
- 装饰构件：无下划线本身即是这里的"反装饰"——开放式、未加论断的视觉语言。
- 气质：无下划线的开放式标题，呼应苏格拉底式"提问而非宣告"的方法论。
- 建议映射幕型：practice（适合呈现开放式提问/讨论提示，无下划线弱化"标准答案"暗示）；light 包。
- 源码路径：style/socrates.css

### marpstyle-socrates/body
- 网格：共享机制，字体 `'Lato'`；`--cool-list-color: rgb(168,12,85)`（勃艮第红有序列表编号）。
- 区域：cite 卡背景 `#49454f`（灰紫黑），`cite p { color:#fffbfe }`，`cite strong { color:#f87ca1 }`（粉）——与 freud/heidegger 共享的深色 cite 手法。
- 关键值：transition `--transitionpage-color:#6750a4`（紫）。
- 装饰构件：`.title h1 { border-bottom:0px }` 的"无下划线"哲学延续到正文页了吗——**未延续**，正文 h1 仍走 structure.css 共享默认橙线（本卡确认这一点，避免误以为整套主题都无下划线）。
- 气质：人文无衬线 + 紫色过渡页，对话式的温和基调。
- 建议映射幕型：practice / recap；light 包。
- 源码路径：style/socrates.css

### marpstyle-turing/cover
- 网格：titlepage 单栏，author/date/organization 左对齐。
- 区域：`.title { border-bottom:1px solid rgb(29,107,209); letter-spacing:-0.6px }`——蓝色下划线（打破 orangered 惯例，与 jobs 同类处理但色值独立定义非变量）。
- 关键值：字体 `'Segoe Pro Display'`；背景 `white`。
- 装饰构件：`.title strong { color: rgb(255,52,52) }`（红色强调词点缀蓝色标题）。
- 气质：技术感冷蓝 + 红色强调点，计算机科学式的精确清冷。
- 建议映射幕型：worked-example（冷蓝适合呈现算法/代码步骤）；light 包。
- 源码路径：style/turing.css

### marpstyle-turing/body
- 网格：共享机制被局部改写：`:root h1 { padding-top:10pt; padding-left:20pt; margin-left:-20pt; border-color: rgb(22,112,230) }`——**比 heidegger(60pt)/jobs(60pt) 更收敛的 20pt 出血**，只轻微外扩而非贯穿整个版心，是"轻量版出血条"。
- 区域：cite 卡背景 `rgb(121,127,133)`（中灰），`cite strong { color:#d9ff01 }`（荧光黄绿）——中灰底上一抹荧光色，像代码高亮标注。
- 关键值：cite p `font-family:"Libre Baskerville"; font-size:46px; line-height:116%`。
- 装饰构件：transition 背景 `rgb(255,82,2)`（橙红）；transition strong `color: rgb(172,255,7)`（同款荧光黄绿）。
- 气质：冷蓝技术感 + 荧光黄绿点缀，像代码编辑器里的高亮批注。
- 建议映射幕型：worked-example（主体）+ 荧光色适合 practice 页标出"关键变量/结果"；light 包。
- 源码路径：style/turing.css

### marpstyle-weber/cover
- 网格：titlepage 单栏，author/date/organization 左对齐，`.title { text-align:left !important }`（显式重申左对齐，与共享默认一致但单独强调）。
- 区域：`.title { color: hsl(225,4%,82%) }`（浅灰，用 HSL 而非 RGB/HEX，本合集唯一用 HSL 定义颜色的主题）；`.subtitle { font-weight:800 }`（比 schema 默认 600 更粗）。
- 关键值：titlepage 背景 `rgb(64,81,93)`（藏青灰，深色封面，比正文的 `rgb(81,100,113)` 略深）。
- 装饰构件：`.title strong { color: rgb(255,251,9) }`（亮黄强调词）。
- 气质：藏青灰 + 亮黄点缀，官僚制/社会学式的沉稳权威感。
- 建议映射幕型：contrast / recap（深色庄重感适合总结性论断）；dark 包。
- 源码路径：style/weber.css

### marpstyle-weber/body
- 网格：共享机制被覆盖：`section p { font-size:33px }`；字体引入 **`'Noto Sans SC'`（简体中文字体）**——本合集 22 个主题中唯一显式引入中文字体的主题，对 maolab 的中文渲染场景直接相关。
- 区域：cite 卡 `padding-top/bottom:50pt`（比共享默认的 auto 更明确的固定值）+ `padding-left/right:100px`，`background-color: rgb(38,49,58)`（比正文更深一階的藏青黑）。
- 关键值：`strong { color:#fad12b !important }`（金黄，全局强调色）；`em { background-color:#fad12b; color: rgba(38,40,41,0.818) }`（金黄块配深字，斜体高亮反转配色）。
- 装饰构件：`section::after`（页码）自带 `background-color:#43444555`半透明色块+`padding-left/right:1em`，比共享默认的纯文字页码更"有形"。
- 气质：藏青灰底 + 金黄强调，唯一为中文排版做过字体适配的主题，权威而不失温度。
- 建议映射幕型：recap / contrast（金黄强调词适合总结句），且因中文字体适配，是本合集里**唯一无需额外字体替换即可直接用于中文正文**的主题；dark 包。
- 源码路径：style/weber.css

---

## 覆盖总结
- 覆盖主题：22 个（arendt, copernicus, descartes, einstein, freud, godel, gropius, hegel, heidegger, hume, hume-background-red, husserl, jobs, kant, king, leibniz, orwell, pascal, plato, socrates, turing, weber），共 44 张卡（每主题 cover + body）。
- 跳过：`style/_template.css`（空白模板，非主题）、`style/schema.css`（共享变量定义，非独立主题，已在文档开头整体归纳）、`style/structure.css`（共享机制引擎，889 行，已在文档开头整体归纳）、`style/simple.css`（未以人物命名，结构上是精简变体，与"每个主题以哲学家/科学家命名"的任务范围不符，故不单独出卡）。
