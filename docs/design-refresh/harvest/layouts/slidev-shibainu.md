# Slidev Shibainu 主题 — 版式源码采集

- 仓库：https://github.com/slidevjs/themes (MIT License, © 2021 Slidev.js Team)
- 包：`@slidev/theme-shibainu` v0.25.0（作者 Inès，`colorSchema: dark`，默认字体 Titillium Web / Fira Code）
- 精确路径：`packages/theme-shibainu/layouts/`（版式 `.vue`）+ `packages/theme-shibainu/styles/layouts.css`（共享基类）+ `packages/theme-shibainu/assets/page-N.vue`（每个版式绑定的 SVG 背景，viewBox `0 0 1600 900`）
- 分支/commit：`main` @ `6bb2889af4c66c1fbab4c1beb2e8d962a3b55648`（2025-07-29）
- 舞台换算：本采集全部按 UnoCSS/Tailwind 任意值语法摘录（如 `pl-[20%]`），maolab 为 1920×1080 固定舞台，映射时按同比例百分比套用即可，无需换算像素。

## 全局共享规则（`styles/layouts.css`，作用于所有版式）

```css
:root { --slidev-theme-primary: #402312; }
.slidev-layout { position: relative; height: 100%; color: var(--slidev-theme-primary); }
.slidev-layout h1 + p { margin-top: -0.5rem; opacity: 0.5; margin-bottom: 1rem; }
.slidev-layout p + h2, ul + h2, table + h2 { margin-top: 2.5rem; }
.slidev-layout h3 { font-size: 0.875rem; padding-top: 0.5rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 500; margin-left: -0.05em; }
.slidev-layout h3:not(.opacity-100) { opacity: 0.4; }
.layout-background { z-index: -1; transform: scale(1.001); position: absolute; width/height: 100%; left:0; top:0; }
```

- `h1 + p` 默认规则：副标题被向上吸附 `-0.5rem` 且降到 50% 透明度、底部留 `1rem`——即"标题+弱化副标题"的 kicker 组合，quote 版式会局部覆写为 `mt-2`（见下）。
- `h3` 是全主题统一的"眼标签"写法：小号、全大写、宽字距、40% 透明度（除非显式 `.opacity-100` 提亮）。
- `.layout-background` 用 `scale(1.001)` 做 1px 级溢出，是防止 SVG 背景与容器边缘出现描边缝隙的经典 trick。
- 背景色谱（5 色，贯穿全部 `page-N.vue`）：`#402312`(最深)/`#734226`/`#8c6645`/`#bf926b`(最浅暖棕)/`#ebeef2`(近白点缀)。

---

### slidev-shibainu/default
- 网格：单栏 flex，内容盒宽度锁定为舞台的 70%，无显式 padding，贴左上角起排
- 区域：仅一个内容区（70% 宽）+ 背景层（100% 铺满，z-index -1）
- 关键值：`w-[70%]`；无 `py`；**唯一未带 `dark` 工具类**的 default 系列成员；scoped 强制 `color: #EBEEF2`
- 装饰构件：背景 `page-6.vue`，暖棕有机泡状色块（`#734226` 底 + `#bf926b`/`#ebeef2` 点缀）+ 反复出现的小型手绘"逗号/爪印"标记
- 气质：本系列里最"生"的一版——不设垂直呼吸、内容框最窄，密度最高但边界最硬
- 建议映射幕型：source-reading（需要最大文本承载面、装饰最少）；深棕背景，dark 包优先
- 源码路径：`packages/theme-shibainu/layouts/default.vue`（内部 class 名为 `default-1`）

### slidev-shibainu/default-2
- 网格：单栏，内容盒宽度 80%，四周等距内边距
- 区域：一个居中偏内容区 + 背景层
- 关键值：`w-[80%] p-10`（相对 default 的 `w-[70%]` 无 padding，宽度 +10%、且新增全向 padding）；`dark` 类
- 装饰构件：背景 `page-4.vue`，同色系有机色块 + 爪印标记
- 气质：从"裸奔"到"装框"的第一步——加了呼吸感但仍是对称满宽盒子
- 建议映射幕型：concept-build（工整装框，适合定义/概念条目起手）；dark 包
- 源码路径：`packages/theme-shibainu/layouts/default-2.vue`

### slidev-shibainu/default-3
- 网格：单栏，水平内边距按百分比、垂直内边距极小，且暴露 `class` prop 供外部覆写
- 区域：一个内容区（可被外部 class 追加约束）+ 背景层
- 关键值：`px-[8%] py-[2%]`（相对 default-2 的 `p-10` 改用不对称的水平/垂直比例：水平留白更松 8%、垂直几乎不留 2%）；唯一带 `defineProps({ class })` 透传的变体；`dark` 类
- 装饰构件：背景 `page-5.vue`，同色系色块 + 爪印标记
- 气质：三兄弟中最"可编程"的一版——版式本身只定基础栏宽，细节交给调用方
- 建议映射幕型：practice（需要按题型微调对齐/宽度，靠 class 透传做变体）；dark 包
- 源码路径：`packages/theme-shibainu/layouts/default-3.vue`

### slidev-shibainu/default-4
- 网格：单栏，仅左侧留白、垂直内边距极小，内容被推向右侧 80% 区域
- 区域：右侧内容区（左 20% 空出给背景插画）+ 背景层
- 关键值：`pl-[20%] py-[2%]`（相对 default-3 的对称 `px-[8%]`，改为单侧 `pl-[20%]`——不对称幅度从 0 跳到 20%，垂直留白维持 2% 不变）；`dark` 类
- 装饰构件：背景 `page-9.vue`，色块整体偏中调（`#8c6645` 主底）+ 爪印标记
- 气质：从"对称装框"跳到"单侧让位"——第一个明确暗示背景/插图承重的版式
- 建议映射幕型：worked-example（文字步骤靠右、左侧让位给示意图/立绘）；中性偏浅包
- 源码路径：`packages/theme-shibainu/layouts/default-4.vue`

### slidev-shibainu/default-5
- 网格：单栏，仅右侧留白、垂直内边距极小，内容占左侧 90% 区域
- 区域：左侧内容区（右 10% 空出）+ 背景层
- 关键值：`pr-[10%] py-[2%]`（与 default-4 镜像但幅度更小：让位侧从左变右，且留白从 20% 收窄到 10%，垂直仍是 2%）
- 装饰构件：背景 `page-10.vue`，同色系（`#8c6645`）+ 爪印标记
- 气质：default-4 的镜像轻量版——不对称但克制，让位空间刚够放一个小图标/图注
- 建议映射幕型：worked-example 镜像变体，可与 default-4 成对使用做 contrast（左让位 vs 右让位分帧对照）；中性偏浅包
- 源码路径：`packages/theme-shibainu/layouts/default-5.vue`

### slidev-shibainu/default-6
- 网格：单栏，左右对称内边距、垂直内边距是全系列最大值
- 区域：居中收窄内容区（左右各留 15%，内容占中间 70%）+ 背景层
- 关键值：`px-[15%] py-[5%]`（相对 default-3 的 `px-[8%] py-[2%]`：水平留白翻倍到 15%、垂直留白翻两倍半到 5%——是全系列唯一同时加大双向留白的版本）；`dark` 类
- 装饰构件：背景 `page-12.vue`，全系列最深底色 `#402312` + 爪印标记
- 气质：从"让位"绕回"对称"，但用最深底色和最大留白做出郑重感——像是要盖章收尾的版式
- 建议映射幕型：recap（对称庄重、留白充分，适合收束型总结）；dark 包（背景色本身最深）
- 源码路径：`packages/theme-shibainu/layouts/default-6.vue`

### slidev-shibainu/default-7
- 网格：单栏，仅右侧留白且幅度是全系列最大值，垂直内边距回落到最小
- 区域：左侧内容区（右侧 25% 大幅留空）+ 背景层
- 关键值：`pr-[25%] py-[2%]`（相对 default-5 的 `pr-[10%]`：右侧让位幅度从 10% 一口气拉到 25%，是全部 default 系列里单侧留白的最大值；垂直留白回到 2%）；`dark` 类
- 装饰构件：背景 `page-13.vue`，同为最深底色 `#402312` + 爪印标记
- 气质：整个 default 系列密度光谱的终点——最大不对称留白 + 最暗背景，戏剧性最强
- 建议映射幕型：visual-observation（右侧大留白天然承载观察目标图像/立绘）；dark 包
- 源码路径：`packages/theme-shibainu/layouts/default-7.vue`

### slidev-shibainu/cover
- 网格：单栏，纵向居中（`my-auto`），横向占满
- 区域：垂直居中内容区 + 背景层
- 关键值：`my-auto w-full`（无水平留白、无 padding，纯靠垂直居中定位）；不含 `dark` 类
- 装饰构件：背景 `page-1.vue`，全系列最浅底色 `#bf926b` + 爪印标记
- 气质：全屏开场感，背景即主角，文字只是纵向居中的一条
- 建议映射幕型：非七幕型正式成员，但可作为课程/单元开场帧；light 包
- 源码路径：`packages/theme-shibainu/layouts/cover.vue`

### slidev-shibainu/center
- 网格：`grid` 容器 + `m-auto` 内容盒，双轴居中
- 区域：居中内容区（宽度锁 60%，文字居中对齐）+ 背景层
- 关键值：`grid` 父层 + `m-auto w-[60%] text-center`（是全部版式里唯一双轴 `auto` 居中的写法，宽度 60% 比 default 系列的 70–90% 更收窄）
- 装饰构件：背景 `page-2.vue`，浅色 `#bf926b` + 爪印标记
- 气质：单条陈述/定义式的聚光灯构图，四周留白最对称充分
- 建议映射幕型：concept-build 备选（单一核心定义居中呈现）；light 包
- 源码路径：`packages/theme-shibainu/layouts/center.vue`

### slidev-shibainu/right
- 网格：单栏，左侧留白 30%（全主题左侧让位的最大值），内容右对齐
- 区域：右侧内容区（文字右对齐、四周另加 `p-5` 小内边距）+ 背景层
- 关键值：`pl-[30%] text-right p-5`（复用 `default-4` 的 class 名与背景 `page-9.vue`，但左侧留白从 20% 加到 30%，且叠加 `text-right` 对齐，另加统一 `p-5`；不含 `dark` 类，与同背景的 default-4 形成"同底色不同装框"的对照）
- 装饰构件：背景 `page-9.vue`（与 default-4 同一张），爪印标记
- 气质：default-4 的镜像强化版——留白更大、对齐反转，右倚感最强
- 建议映射幕型：visual-observation 镜像变体（左侧留白承载观察目标，文字右倚阅读）；中性偏浅包
- 源码路径：`packages/theme-shibainu/layouts/right.vue`

### slidev-shibainu/quote
- 网格：`grid` + 纵向居中（`my-auto`），横向占满，文字居中
- 区域：居中文字区 + 背景层
- 关键值：`my-auto w-full text-center`；标题独立覆写 `h1 { font-size: 4em }`（全主题最大标题字号，脱离 Tailwind 刻度用固定 em 值）；局部覆写全局 `h1 + p` 规则为 `margin-top: 0.5rem`（取消全局的 `-0.5rem` 上吸+50%透明，改为下推更明显的引用出处排版）；`dark` 类
- 装饰构件：背景 `page-15.vue`，浅色 `#bf926b`（与 `dark` 类形成的底色/类名不一致，仅为 Slidev 语法高亮开关，不代表实际背景明暗）+ 爪印标记
- 气质：全主题最大字号的独白式排版，专为一句话金句设计
- 建议映射幕型：recap 备选（金句/关键结论摘录卡）；light 包（按实测背景色）
- 源码路径：`packages/theme-shibainu/layouts/quote.vue`

### slidev-shibainu/section（内部 class `section-1`）
- 网格：`grid` + 纵向居中（`my-auto`），横向占满，左对齐
- 区域：居中内容区（水平内边距 `px-10`，顶部额外 `pt-15`）+ 背景层
- 关键值：`my-auto w-full px-10 pt-15`（顶部内边距单独加码，底部无对应 padding——不对称垂直留白）；全局叠加规则 `.section h1 { font-size: 3.75rem(text-6xl); font-weight: 500; line-height: 5rem(leading-20) }`
- 装饰构件：背景 `page-3.vue`，中深色 `#734226` + 爪印标记
- 气质：章节标题该有的"顶部先留白、内容压后"的仪式感开场
- 建议映射幕型：章节/幕间分隔标记，可用于 contrast 幕型引入前的分段标题；dark 偏中包
- 源码路径：`packages/theme-shibainu/layouts/section.vue`

### slidev-shibainu/section-2
- 网格：`grid` + 纵向居中（`my-auto`），横向占满，左对齐
- 区域：居中内容区（仅 `px-10`，无独立顶部加码）+ 背景层
- 关键值：`my-auto px-10 w-full`（相对 section-1 去掉了 `pt-15`，垂直留白回归对称的纯 `my-auto`——是同族里更"扁平/轻量"的一版）
- 装饰构件：背景 `page-7.vue`，中浅色 `#8c6645` + 爪印标记
- 气质：比 section-1 少一分仪式感、多一分日常感的次级分节标题
- 建议映射幕型：practice 内部小节切换用的轻量分隔帧；中性包
- 源码路径：`packages/theme-shibainu/layouts/section-2.vue`

### slidev-shibainu/section-3
- 网格：`grid` + 纵向居中（`my-auto`），横向占满，文字居中
- 区域：居中文字区 + 背景层
- 关键值：`my-auto w-full text-center`（同族三兄弟里唯一 `text-center`）；标题覆写 `h1 { font-size: 3em }`（比 quote 的 4em 小一档，但比 section 系列默认的 `text-6xl` 更大更集中）；`dark` 类
- 装饰构件：背景 `page-14.vue`，全系列最深底色 `#402312` + 爪印标记
- 气质：三个 section 变体里最庄重的收尾款——居中 + 最深底色 + 独立大字号
- 建议映射幕型：recap 的章节终章版（比 default-6 更强调"合上书"的仪式感）；dark 包
- 源码路径：`packages/theme-shibainu/layouts/section-3.vue`

---

补充说明（非独立卡片，因本主题未提供专属 `.vue` 模板，仅在 `layouts.css` 里对 Slidev 核心内置版式做样式覆写）：`fact`（`text-center grid h-full`；`h1` `text-8xl font-700`，全主题最大 Tailwind 刻度标题；`h1 + p` `font-700 text-2xl`）与 `statement`（`text-center grid h-full`；`h1` `text-6xl font-700`）——如需引用需注意源码路径应指向 `packages/theme-shibainu/styles/layouts.css`，而非某个 `.vue` 文件。

## 采集小结

- 共发现 `layouts/` 目录下 14 个版式文件，全部已逐一取源码并写卡：`default`、`default-2`~`default-7`（7 个密度梯度成员）、`cover`、`center`、`right`、`quote`、`section`、`section-2`、`section-3`。
- 未发现之处：该主题不存在 `default-8` 及以上（用户预估的"13+"数量未实际存在，仓库里数字后缀止于 `default-7`）；也没有 `two-cols` / `image-left` / `image-right` 等分栏图文版式（若 maolab 需要双栏对照母版，需从其他主题包补采）。`fact`/`statement` 只有 CSS 覆写、没有独立模板文件，已在补充说明中如实注明而非编造路径。
