### marp-graphpaper/grid-ground
- 网格：section 背景为双向 1px 直线网格，用两条 `linear-gradient` 叠加实现（非 SVG pattern）——`linear-gradient(#3f32af18 1px, transparent 1px)` 负责横线，`linear-gradient(to right, #ccc89536 1px, #d8d8e62d 1px)` 负责竖线，`background-size: 20px 20px` 控制网格间距；画布继承 Marp 默认主题的 1280×720（16:9）尺寸。
- 区域：section 整体是唯一内容区，无分栏；header/footer 为细线顶栏/底栏（各占独立层，非挤压内容区高度）；section::after 追加右下角页码（`data-marpit-pagination` / `-total`）。
- 关键值：网格间距 20px×20px；网格线色 `#3f32af18`（横）/`#ccc89536` + `#d8d8e62d`（竖，双色叠加产生轻微竖向错位纹理）；section 背景色 `#e3e3f1`；正文文字色 `--text-color: #121114`；强调色 `--main-color: #040014`；header/footer 字号 `0.7em`，各配 1px 实线（`border-bottom`/`border-top`，色 `#040014`）；section padding 继承 Marp 默认主题固定值 `78.5px`（1280×720 画布下，即约 6.1% 边距）；blockquote 左边框 `10px solid var(--main-color)`；mark 高亮底色 `#98d6ff`。
- 装饰构件：纯 CSS 渐变网格（无图片/SVG依赖），配合 Work Sans 谷歌字体 `@import url(...)`；表格表头 `th` 背景 `#8ea2af` 白字；`tinytext` class 提供正文/列表/引用统一缩小 0.65em 的密度切换开关。
- 气质：工程笔记本般的坐标纸质感——克制、理性、略带手绘草稿气息，适合强调"可测量/可对齐"的内容。
- 建议映射幕型：worked-example（网格天然强化步骤对齐/坐标感，契合例题推导的分步呈现）、practice（网格线暗示"可填空/可作答"的练习纸质感）；light-only 包（背景为浅紫灰 `#e3e3f1`，未做 dark 变体，需要另配深色网格版本才能进 dark pack）。
- 源码路径或URL：https://github.com/rnd195/my-marp-themes（`graph_paper.css`，通过 GitHub Contents API 于 branch `live` 抓取），主题画廊页 https://rnd195.github.io/marp-community-themes/theme/graph_paper.html；padding 基准值来自 Marp 官方默认主题 https://github.com/marp-team/marp-core（`themes/default.scss` 第 215 行 `padding: 78.5px`）。
