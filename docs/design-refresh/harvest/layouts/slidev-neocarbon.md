# 设计参考采集：slidev-theme-neocarbon

来源：https://github.com/enyineer/slidev-theme-neocarbon（MIT License）｜抓取分支：`main`｜抓取范围：`layouts/` 目录下全部 22 个 `.vue` 布局文件。每张卡片的"关键值"均直接摘自对应文件的 `<template>`/`<style scoped>` 源码，未做臆测或近似。

---

### slidev-neocarbon/browser
- 网格：非 CSS grid，flex column 包裹一个"浏览器窗体" `.nc-browser-frame`（flex column），内部工具栏 `.nc-browser-toolbar` 为 flex row，主体 `.nc-browser-body` 为内容区
- 区域：工具栏（左侧三色圆点 + 中间 URL 输入条 + 右侧前进/后退/刷新按钮）、主体（default slot 承载任意内容）
- 关键值：外层 `padding: 1.2rem 2rem`；工具栏 `padding: 10px 14px, gap: 10px`；圆点直径 10px、gap 6px；URL 条 `font-size: 0.6rem`；导航按钮 22×22px；主体 `padding: 1.5rem`；窗体 `border-radius: 12px`，`box-shadow: 0 25px 80px rgba(0,0,0,0.5)`；入场动画 `translateY(16px) scale(0.97) → 0/1`
- 装饰构件：三色红/黄/绿圆点（真实 DOM span，非伪元素）、URL 条内联 SVG 锁形图标（10×10px，`fill: currentColor` 但单独设 `color: #4ade80`）
- 气质：真实浏览器窗口质感，克制、产品化，适合展示网页/应用
- 建议映射幕型：worked-example（软件操作演示）或 visual-observation（网页/产品实拍观察）；暗色风格包（背景大量使用 `rgba(0,0,0,…)`）
- 源码路径：layouts/browser.vue

### slidev-neocarbon/center
- 网格：无网格，纯 flex 居中（`align-items: center; justify-content: center`），单一内容块整体居中
- 区域：单一 default slot，承载居中文字（标题 + 说明段）
- 关键值：`padding: 2.5rem`；`h1 font-size: 2rem, font-weight: 700, letter-spacing: -0.01em`；`p font-size: 0.85rem, max-width: 30rem, margin-top: 0.5rem`
- 装饰构件：无——该文件确实不含任何装饰性构造（无光晕、无线条、无徽标）
- 气质：极简克制的居中陈述，无视觉噪音
- 建议映射幕型：recap（总结陈述）或 concept-build（核心定义单独呈现）；light/dark 均适配（无强制暗色元素）
- 源码路径：layouts/center.vue

### slidev-neocarbon/code
- 网格：flex column，标题区（flex-shrink: 0）+ 代码窗体区（flex: 1）
- 区域：h1 标题浮在窗体上方，`.slidev-code-wrapper` 承载代码块（Monaco/Shiki 均适配）
- 关键值：外层 `padding: 2rem 2.5rem`；`h1 font-size: 1.3rem, margin-bottom: 0.75rem`；窗体 `border-radius: 14px, padding-top: 38px`（为标题栏预留高度）；`box-shadow: 0 20px 60px rgba(0,0,0,0.4)`；代码内边距 `14px 18px`；代码字号 `0.78rem, line-height: 1.7`
- 装饰构件：macOS 风格红/黄/绿三色圆点通过 `::before` 伪元素的 `background-image: radial-gradient(...)` 三次叠加纯 CSS 生成（圆心分别在 20px/36px/52px 处，y=19px，半径 5px），无 SVG 无额外 DOM 节点
- 气质：极客感强的 IDE/终端窗口氛围
- 建议映射幕型：worked-example（代码/操作步骤演示）；暗色风格包强绑定（终端配色语境）
- 源码路径：layouts/code.vue

### slidev-neocarbon/comparison
- 网格：flex row 两栏各 `flex: 1`，中间一条分隔线（非等分 CSS grid，但视觉等分）
- 区域：`left` slot（负面/before）、`right` slot（正面/after），每栏内容再套 `flex column; justify-content: space-around`
- 关键值：外层 `padding: 2.5rem`；每栏 `padding: 1rem, border-radius: 14px`；分隔线 `width: 1px, margin: 1rem 0.75rem`；`h1/h3 font-size: 1.1rem`
- 装饰构件：分隔线为竖向渐变（transparent → `rgba(255,255,255,0.1)` 30%-70% → transparent）；右栏背景使用 `linear-gradient(135deg, rgba(--nc-success-rgb,0.06), rgba(--nc-success-rgb,0.02))` 与左栏纯 `--nc-surface` 形成色彩语义对比（隐含红叉/绿勾）
- 气质：二元对比清晰，色彩语义化强化正负判断
- 建议映射幕型：contrast（直接对应核心对比幕型）；需将 `--nc-success-rgb` 语义色替换为 maolab 自有色板；dark 风格包更贴合原始配色
- 源码路径：layouts/comparison.vue

### slidev-neocarbon/cover
- 网格：无网格，flex 居中单列
- 区域：单一 default slot，承载标题 + 副标题 + 可选 logo 图
- 关键值：`padding: 2.5rem`；内容块 `max-width: 42rem`；`h1 font-size: 2.4rem, font-weight: 700, letter-spacing: -0.02em, line-height: 1.2`；`p font-size: 0.85rem, max-width: 32rem`；logo `img height: 2.25rem, margin-bottom: 1.5rem, opacity: 0.9`
- 装饰构件：无独立装饰构造，仅 logo 图片尺寸/透明度约束
- 气质：大气开场 Hero，克制留白
- 建议映射幕型：非五幕型之一，最接近课程/章节开场封面（可作为 source-reading 前置引入页）；light/dark 均可
- 源码路径：layouts/cover.vue

### slidev-neocarbon/default
- 网格：无网格，flex column 单一内容区，无左右切分
- 区域：单一 default slot，通用正文内容容器
- 关键值：`padding: 2.5rem`；`h1 font-size: 1.6rem`；三级嵌套的错峰入场：一级子元素 `transition-delay` 0.05s→0.54s（间隔 ~0.07s，共 8 档），二级子元素 0.10s/0.16s，三级子元素 0.14s→0.70s（间隔 0.08s，共 8 档）；统一 `transform: translateY(12px) → 0, transition: 0.5s cubic-bezier(0.16,1,0.3,1)`
- 装饰构件：无静态装饰，但有一套完整的"逐级浮现"编排系统——由外部 `.nc-active` 类切换触发，opacity 0→1 + translateY(12px)→0，按 DOM 层级（含 grid 内卡片）分别错峰
- 气质：标准内容页，靠动效节奏而非静态装饰传达秩序感
- 建议映射幕型：通用兜底容器，适合 practice（逐题浮现）等需要分步揭示的幕型；其错峰动效逻辑可直接借鉴到 maolab 的分步内容揭示
- 源码路径：layouts/default.vue

### slidev-neocarbon/diagram
- 网格：flex row，左侧内容区固定 `width: 35%`，右侧图表区 `flex: 1`
- 区域：`left` slot = 标题/说明文字（垂直居中），`right` slot = 图表框架（内含 Mermaid 图）
- 关键值：左栏 `padding: 2.5rem`；`h1 font-size: 1.4rem`；右侧视觉区 `padding: 1.5rem 2rem`；Mermaid svg `max-height: 400px`；节点 `fill: var(--nc-surface), stroke: rgba(accent,0.4), stroke-width: 1.5px`
- 装饰构件：图表区背景通过 `::before` 双向 `linear-gradient` 生成 40px 间距的浅色网格线（`rgba(255,255,255,0.015)`），再用 `mask-image: radial-gradient(ellipse 80% 70% at 50% 50%, black 20%, transparent 80%)` 做中心透出、边缘淡出的网格纸效果
- 气质：技术架构感，网格背景强化"系统图表"语境
- 建议映射幕型：concept-build（概念关系图/系统架构图）直接对应；暗色风格包（Mermaid 暗色主题覆写明确针对深色底）
- 源码路径：layouts/diagram.vue

### slidev-neocarbon/end
- 网格：无网格，flex 居中单列（与 cover/center 同构）
- 区域：单一 default slot，收尾标题 + 说明段 + 末位弱化文字行
- 关键值：`padding: 2.5rem`；`h1 font-size: 2.2rem, font-weight: 700, letter-spacing: -0.02em`；`p font-size: 0.8rem, max-width: 28rem`；logo `img height: 2.25rem`；末段 `p:last-of-type font-size: 0.65rem, color: rgba(255,255,255,0.2), margin-top: 2rem`
- 装饰构件：无形状类装饰，仅靠文字层级递降（末行弱化至近乎隐形）制造收尾感
- 气质：收尾感，文字逐级淡出
- 建议映射幕型：recap（课程/章节结尾总结）直接对应
- 源码路径：layouts/end.vue

### slidev-neocarbon/fact
- 网格：无网格，flex column 居中 + 绝对定位光环叠加层
- 区域：单一 default slot，承载巨型数字/事实 + 说明文字
- 关键值：`padding: 2.5rem`；光环 `.nc-fact-ring` 320×320px，`border: 2px solid rgba(accent,0.15)`；`::after` 内缩 `inset: -20px` second ring `rgba(accent,0.06)`；`h1 font-size: 4rem, font-weight: 900, letter-spacing: -0.03em, line-height: 1`；`p font-size: 0.9rem, margin-top: 1rem, max-width: 24rem`
- 装饰构件：双层同心光环居中背衬（`nc-fact-ring` div + 其 `::after`），先 `scale(0.8)→1` 入场再 `scale(1↔1.08)` 4s 循环脉动；数字本身叠加 `text-shadow: 0 0 40px rgba(accent,0.4)` 发光
- 气质：单一巨型数字的仪式感聚焦，光环强化"重要事实"权重
- 建议映射幕型：recap（关键结论/核心数字）或 concept-build 中的强调定义页；暗色风格包（光环效果依赖深色底才可见）
- 源码路径：layouts/fact.vue

### slidev-neocarbon/full
- 网格：无网格，单一 default slot 全出血
- 区域：单一 slot，承载全幅图片/嵌入内容
- 关键值：`padding: 0`；`overflow: hidden`；显式关闭子元素入场动画 `> * { animation: none !important }`
- 装饰构件：无——刻意留白，无任何结构性装饰
- 气质：无框全出血，完全交由内容自身表达
- 建议映射幕型：visual-observation（全幅图片/实拍素材观察）直接对应；风格包中立，取决于内容本身
- 源码路径：layouts/full.vue

### slidev-neocarbon/image-left
- 网格：flex row 两栏各 `flex: 1`（等分左右，非 CSS grid）
- 区域：`left` slot = 左侧图片框架（视觉焦点），default slot = 右侧文字内容
- 关键值：`gap: 0`；右侧内容 `padding: 2.5rem, padding-left: 1.5rem`；`h1 font-size: 1.6rem`；左侧视觉区 `padding: 2rem`；图片框 `border-radius: 16px, border: 1px solid var(--nc-border)`；`box-shadow: 0 20px 60px rgba(0,0,0,0.4), 0 0 40px rgba(accent,0.06)`
- 装饰构件：图片框背后通过 `::before` 生成柔光光晕（80%×80% 圆形 `radial-gradient(rgba(accent,0.08)→transparent)`，`filter: blur(40px)`）；图片框从左侧滑入（`translateX(-30px)→0` + `blur(6px)→0`），文字从右侧滑入
- 气质：产品截图配文案，柔光衬托视觉焦点
- 建议映射幕型：worked-example / visual-observation（图片在左、讲解在右）；light/dark 均可，光晕依赖 accent 色调节
- 源码路径：layouts/image-left.vue

### slidev-neocarbon/image-right
- 网格：与 image-left 镜像，flex row 两栏各 `flex: 1`
- 区域：default slot = 左侧文字内容，`right` slot = 右侧图片框架
- 关键值：与 image-left 完全对称（左侧 `padding: 2.5rem, padding-right: 1.5rem`；视觉区 `padding: 2rem`；框架 `border-radius: 16px`；同款 `::before` 光晕）
- 装饰构件：同款背衬光晕，图片框从右侧滑入（`translateX(30px)→0`），文字从左侧滑入
- 气质：与 image-left 对称呼应，文案在左、图在右
- 建议映射幕型：worked-example / visual-observation（可与 image-left 成对使用，构成幕间镜像节奏）
- 源码路径：layouts/image-right.vue

### slidev-neocarbon/intro
- 网格：flex row，`align-items: center`，左侧绝对定位竖向光棒 + 右侧内容整体左移
- 区域：单一 default slot，约定内容含 h1（姓名）、加粗角色/头衔、要点列表、可选头像图
- 关键值：`padding: 2.5rem 3rem`；光棒 `width: 4px`，定位 `top: 10%, bottom: 10%, left: 0`，渐变 transparent→accent 30%-70%→transparent，`box-shadow: 0 0 20px rgba(accent,0.4)`；内容 `padding-left: 1.5rem`；`h1 font-size: 2.2rem, font-weight: 700`；`li font-size: 0.78rem, padding: 0.3rem 0, padding-left: 1.2rem`；头像 `img 100×100px, border-radius: 50%, border: 2px solid rgba(accent,0.3)`
- 装饰构件：左边缘竖向发光光棒（上下渐隐 + 发光阴影）；自定义列表项目符号（`li::before` 生成 6×6px 圆点，accent 色 + 发光阴影，替代默认 marker）；圆形头像带 accent 色调边框与光晕
- 气质：人物侧写/自我介绍质感，侧边光棒强调身份感
- 建议映射幕型：不直接对应 maolab 五幕型，最接近角色/人物引入的专属过渡卡（如教师人设介绍）；暗色风格包
- 源码路径：layouts/intro.vue

### slidev-neocarbon/math
- 网格：无网格，flex column 居中 + 绝对定位椭圆光晕背衬
- 区域：单一 default slot，约定含 h1 标题 + KaTeX 公式块 + 说明段
- 关键值：`padding: 2.5rem 3rem`；内容 `max-width: 42rem`；光晕椭圆 600×300px `radial-gradient(rgba(accent,0.04))`；`h1 font-size: 1.6rem, margin-bottom: 1.5rem`；公式块 `.katex-display padding: 1.5rem 2rem, background: rgba(255,255,255,0.02), border: 1px solid rgba(255,255,255,0.06), border-radius: 14px`；`.katex font-size: 1.6rem, color: white`；说明段 `p font-size: 0.8rem, max-width: 30rem`
- 装饰构件：中心椭圆光晕 8s 呼吸循环（`scale(1↔1.1)`）；公式块内 `::after` 生成 115deg 斜向渐变扫光条，8s 循环 `translateX(-100%→100%)`，模拟"黑板高光掠过"；行内公式着色为 accent 色
- 气质：数学公式的"黑板高光"仪式感，呼吸光晕叠加扫光动效
- 建议映射幕型：worked-example（公式推导/例题）直接对应；暗色风格包（黑板语境强绑定深色底）
- 源码路径：layouts/math.vue

### slidev-neocarbon/metrics
- 网格：指标行为 CSS grid：`grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`；正文区为下方 flex column
- 区域：`metrics` slot = KPI 卡片行（每张卡片由调用方自行构造 `.nc-metric` div），default slot = 指标行下方的补充内容
- 关键值：外层 `padding: 2.5rem`；行 `gap: 0.75rem, margin-bottom: 1rem`；列宽 `minmax(120px, 1fr)` 自适应换行；行内 `h1 font-size: 1.6rem, grid-column: 1 / -1`（横跨整行）
- 装饰构件：本文件自身未定义卡片装饰——顶部色条/大数字/小标签等样式均由调用方在示例中内联书写（`style="border-top: 2px solid var(--nc-accent)"` 等），布局组件本体只提供网格容器
- 气质：数据仪表盘感，KPI 卡片矩阵式排布
- 建议映射幕型：recap（关键指标汇总）或 practice 环节的成绩/进度统计页；light/dark 均可，卡片配色无强制项
- 源码路径：layouts/metrics.vue

### slidev-neocarbon/quote
- 网格：无网格，flex column 居中单列，巨型引号前后包夹
- 区域：单一 default slot，首段为引言正文，末段视为署名/出处
- 关键值：`padding: 3rem 4rem`；光晕圆 500×500px `radial-gradient(rgba(accent,0.06))` 脉动；引号 `font-size: 6rem, opacity: 0.2`，Georgia 衬线字体；正文块 `max-width: 36rem`；首段 `p font-size: 1.3rem, font-weight: 500, font-style: italic`；末段（署名）`font-size: 0.8rem, letter-spacing: 0.02em, font-weight: 600`
- 装饰构件：超大开合引号（`"` 字符），分别自对齐至左上（`align-self: flex-start`）与右下（`align-self: flex-end`），并以 `margin: -2rem` 与正文重叠，错峰淡入（0.1s / 0.4s）；中心圆形光晕 6s 脉动循环
- 气质：电影感引言展示，大号引号 + 呼吸光晕
- 建议映射幕型：recap（引用/金句总结）或 concept-build 引出定义前的引言过渡；暗色风格包
- 源码路径：layouts/quote.vue

### slidev-neocarbon/section
- 网格：无网格，flex 居中单列
- 区域：单一 default slot，章节标题 + 可选说明
- 关键值：`padding: 3rem`；`h1 font-size: 2rem, font-weight: 700, letter-spacing: -0.02em, margin-bottom: 0.5rem`；`p font-size: 0.9rem, max-width: 30rem`；`h1::after` 下划线 `width: 3rem, height: 3px`，accent 色，`margin: 0.75rem auto 0`，`box-shadow: 0 0 12px rgba(accent,0.5)`
- 装饰构件：居中短下划线条，由 `h1::after` 伪元素生成（3rem×3px，带发光阴影）
- 气质：章节分隔页，克制的下划线锚点
- 建议映射幕型：非五幕型之一，属于结构性幕间过渡卡（章节转场），可置于 recap 前作为过渡；light/dark 均可
- 源码路径：layouts/section.vue

### slidev-neocarbon/showcase
- 网格：本文件本身仅提供 flex column 外壳（`h1` + 内容容器）；实际的多列网格（`.nc-showcase-grid`/`.nc-showcase-item`）在示例代码中被引用，但其 CSS 定义在 `base.css` 中，**不在本文件内**
- 区域：单一 default slot，约定内容为调用方自建的图片+说明卡片网格
- 关键值：`padding: 2rem 2.5rem`；`h1 font-size: 1.4rem, margin-bottom: 0.75rem`；入场动画 `translateY(12px)→0`
- 装饰构件：本文件确实没有独立装饰构造——网格列数/卡片样式属于主题的 `base.css` 全局样式，需另行抓取才能完整还原
- 气质：多图网格展示，具体节奏感由主题全局网格样式决定（此文件层面信息不完整）
- 建议映射幕型：visual-observation（多图/多截图对比观察）；映射时需注意网格细节需补充查证 base.css
- 源码路径：layouts/showcase.vue

### slidev-neocarbon/split-heading
- 网格：flex row，左侧标题栏固定 `width: 38%`，右侧内容区 `flex: 1`
- 区域：`left` slot = 钉住的大标题（杂志式），`right` slot = 右侧正文内容
- 关键值：标题栏 `padding: 2.5rem`；竖向分隔线绝对定位 `right: 0, top: 15%, bottom: 15%, width: 2px`，渐变 `rgba(accent,0.3)` 30%-70% 淡出两端；`h1 font-size: 2rem, font-weight: 800, letter-spacing: -0.02em, line-height: 1.2`；右侧内容 `padding: 2.5rem`
- 装饰构件：标题栏与内容区之间的细竖向渐变分隔线（两端淡出）；标题栏从左滑入（`translateX(-20px)`），内容区从右滑入并带 `blur(3px)→0`
- 气质：杂志排版感，大字号钉住左侧、内容在右侧流动展开
- 建议映射幕型：concept-build（核心概念大标题 + 展开说明）直接对应；light/dark 均可
- 源码路径：layouts/split-heading.vue

### slidev-neocarbon/spotlight
- 网格：无网格，flex column 居中，三层绝对定位装饰元素叠在内容之下（`z-index: 0` vs 内容 `z-index: 1`）
- 区域：单一 default slot，承载戏剧性揭示文字
- 关键值：强制背景 `background: #020202`；光束用纯 CSS 三角形（`border-left/right: 120px solid transparent`, `border-top: 500px solid rgba(255,255,255,0.035)`, `filter: blur(30px)`），8s 循环轻微摇摆 `rotate(±1deg)`；光池 500×500px 圆形 `radial-gradient(rgba(255,255,255,0.06→0.025→0.008→transparent))`；光晕 300×200px 椭圆 `radial-gradient(rgba(255,255,255,0.04))` 5s 呼吸；`h1 font-size: 2.2rem, font-weight: 800, letter-spacing: -0.03em`，双层 `text-shadow: 0 0 60px + 0 0 120px rgba(255,255,255,…)`
- 装饰构件：三层纯 CSS 舞台聚光灯效果——CSS 边框三角形模拟光束（配合关键帧摇摆）、圆形光池、椭圆呼吸光晕，层层叠加在内容下方，构成真实剧场聚光灯模拟
- 气质：剧场聚光灯氛围，戏剧性揭幕感极强
- 建议映射幕型：与 maolab 舞台/galgame 美学高度契合，适合 concept-build 或 recap 中的"重磅揭示"时刻；强制暗色背景（`#020202`），仅限暗色风格包
- 源码路径：layouts/spotlight.vue

### slidev-neocarbon/statement
- 网格：无网格，flex column 居中单列，全幅径向渐变背景铺底
- 图区：单一 default slot，承载一句强宣言式文字
- 关键值：`padding: 3rem`；背景 `radial-gradient(ellipse 60% 50% at 50% 50%, rgba(accent,0.05)→transparent)`，6s 呼吸 `scale(1↔1.05)`；内容 `max-width: 40rem`；`h1 font-size: 2.8rem, font-weight: 800, letter-spacing: -0.03em, line-height: 1.15`，`text-shadow: 0 0 60px rgba(accent,0.3)`；`p font-size: 0.9rem, margin-top: 1.5rem, max-width: 28rem`（水平居中）
- 装饰构件：覆盖整个幻灯片背景的呼吸式径向渐变（非局部圆形光晕，而是覆盖约 60% 宽度的椭圆背景），与标题文字发光阴影同步呼应
- 气质：全屏宣言式陈述，背景整体呼吸而非局部点缀
- 建议映射幕型：recap（核心论断/结语宣言）或 contrast 收束后的定性判断句；暗色风格包
- 源码路径：layouts/statement.vue

### slidev-neocarbon/two-cols
- 网格：flex row 两栏各 `flex: 1`，`gap: 1.5rem`（功能上等同于 `grid-template-columns: 1fr 1fr`）
- 区域：`left` slot、`right` slot——通用对等内容，无视觉主次之分
- 关键值：外层 `padding: 2.5rem`；`gap: 1.5rem`；`h1 font-size: 1.6rem`；错峰入场：左栏 `delay 0.1s`，右栏 `delay 0.25s`，均 `translateY(18px) + blur(4px) → 0`
- 装饰构件：无形状类装饰，仅有方向性错峰入场动效（两栏均从下方升起，而非左右滑入）——是本次采集中结构最朴素的一款
- 气质：中性对称双栏，无色彩语义强调（区别于 comparison 的红绿语义化配色）
- 建议映射幕型：contrast（中性双栏对比，不需褒贬色彩时优先于 comparison）或 practice（双题并列展示）；light/dark 均可
- 源码路径：layouts/two-cols.vue

---

**采集总结**：文件树中发现 22 个 layout 文件，22 个全部成功抓取源码并撰写规格卡片，无遗漏、无 404。唯一需要注意的信息缺口：`showcase.vue` 自身不含网格/卡片样式定义（引用了主题 `base.css` 中的全局类），如需还原其网格具体数值需另行抓取 `base.css`。
