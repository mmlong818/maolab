# 配色宇宙收割索引

本目录下每个 JSON 文件是一套开源配色宇宙的**精确 hex/token 全值**收割结果——非灵感摘要,是可直接程序读取的机器数据,供后续逐套落地为具名风格包用。收割日期均为 2026-07-21,每个色值均可在对应 JSON 的 `source.sourceUrls` 中溯源。

## 总量统计

- 配色宇宙(文件):14 个
- flavor 级色板(不含中国传统色):71 套(含 tweakcn 42 套预设)
- 色值/token 总量:4,970(其中纯色 1,810 + tweakcn 含非色 token 的完整主题 token 3,160)

## 索引表

| 文件 | 宇宙 | flavor 数 | 色数 | License | 气质一句话 | 建议映射(maolab 学科/学段) |
|---|---|---|---|---|---|---|
| `catppuccin.json` | Catppuccin | 4(Latte/Frappé/Macchiato/Mocha)× 26 色 | 104 | MIT | 柔雾马卡龙,低对比、猫系可爱 | 低龄向人文/语文课堂 UI 底色,情绪缓和的互动环节 |
| `rose-pine.json` | Rosé Pine | 3(Main/Moon/Dawn)× 15 色 | 45 | MIT | 玫瑰灰粉、克制的极简优雅 | 高中语文/诗词赏析、文学类课堂的沉浸底色 |
| `nord.json` | Nord | 1 × 16 色 | 16 | MIT | 极地冷调,克制、理性、极简 | 数学/物理/计算机等理科逻辑课堂 |
| `solarized.json` | Solarized | 1 × 16 色 | 16 | MIT(见下方 License 警示) | 经典程序员配色,低疲劳、功能主义 | 编程/信息技术课,长时间阅读场景 |
| `gruvbox.json` | Gruvbox | 1(统一常量,深浅色共用)× 39 色 | 39 | MIT | 复古暖色、做旧纸感 | 历史/社会课的"旧课本"质感包装 |
| `everforest.json` | Everforest | 6(dark/light × hard/medium/soft)× 27 色 | 162 | MIT | 森林绿意,柔和护眼 | 生物/环境科学、自然主题课堂 |
| `kanagawa.json` | Kanagawa | 3(Wave/Dragon/Lotus)× 40/23/40 色 | 103 | MIT | 北斋浮世绘配色,靛蓝与朱红的东方美学 | 美术/日本文化/古典文学等强审美人文课 |
| `tokyo-night.json` | Tokyo Night | 4(Night/Storm/Day/Moon)× 33 色 | 132 | Apache-2.0 | 都市霓虹夜色,科技感 | 编程/信息技术、未来科技主题课堂 |
| `tweakcn.json` | tweakcn 预设主题库 | 42 套预设 × light+dark 全 token | 3,160 token | Apache-2.0 | 当代 shadcn/ui 主题大合集,风格覆盖极广(极简/赛博朋克/复古/自然系等) | 直接作为课堂 UI 组件皮肤库,按课程气质挑选整套 token 而非单色 |
| `chinese-traditional-colors.json` | 中国传统色全库(2 仓合并) | 2 个全量列表(zerosoul 161 + nevertoday 742) | 903 | MIT(两仓均) | 中华传统色名 + 典故,文化厚重 | 语文/历史/传统文化课的具名色彩体系,节庆/国风类内容 |
| `dracula.json` | Dracula | 1 × 12 色 | 12 | MIT | 高饱和暗色,吸血鬼哥特电子感 | 编程/信息技术课堂暗色模式 |
| `one-dark.json` | One Dark | 1 × 12 色 | 12 | MIT | Atom 编辑器经典暗色,克制现代 | 编程课堂暗色模式备选 |
| `monokai.json` | Monokai(原始开源版,非 Monokai Pro) | 1 × 16 色 | 16 | MIT | 经典高对比编辑器配色 | 编程课堂暗色模式备选 |
| `nippon-colors.json` | 日本传统色(250 色) | 1 × 250 色 | 250 | MIT | 和风典雅,汉字+罗马音双标注 | 日语/日本文化/东方美学类课堂 |

## License 警示

- **Solarized**:官方页面 `ethanschoonover.com/solarized/` 本身未声明明确协议文字;License 字段引用的是关联仓库 `github.com/altercation/solarized` 的 MIT LICENSE 文件,非原始页面直接声明。使用前建议二次确认。
- **Monokai Pro**(monokai.pro 商业版)已被排除,未抓取任何数据——其配色为付费商业产品,非宽松协议。本库中的 `monokai.json` 仅为 Wimer Hazenberg 原始开源 Monokai 配色的 MIT 移植版。
- 其余全部为 MIT 或 Apache-2.0,可直接使用。

## 未拿到 / 未收录的条目

- **Nippon 官方站 nipponcolors.com**:未直接抓取——该站为个人商业站点,批量复用协议不明确。改用 GitHub 上明确 MIT 协议的 `syaning/nippon-colors`(250 色)替代,数据来源不同但同属日本传统色范畴。
- 曾评估但因协议不清放弃的候选:`lcat/nippon-colors`、`wsuzume/jpcolor`(均无可检测 LICENSE)、`oneKelvinSmith/monokai-emacs`(GPLv3,非宽松协议)。
- Rosé Pine 的 `highlightLow/Med/High` 三色未见于官方 `palette.json`(该文件仅 12 色/flavor),改从同组织的 `rose-pine/neovim` 仓库 `palette.lua` 取得(命名从 snake_case 改写为 camelCase 以对齐 schema,已在 JSON `source` 字段中说明改写事实)。
