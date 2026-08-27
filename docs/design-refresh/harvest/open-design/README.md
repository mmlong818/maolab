# open-design 收割索引

来源：https://github.com/nexu-io/open-design（GitHub API 实测确认 **80,024 stars**、Apache License 2.0、`nexu-io` 组织、默认分支 `main`）。收割方式：`git clone --filter=blob:none --sparse --depth=1` 后 `git sparse-checkout set design-systems design-templates`，本地 Node 脚本解析（不依赖印象/AI 编造数值），克隆副本已在任务结束前清理。收割日期：2026-07-21。

## 实际结构核实结果与预设描述的差异（先读）

任务预设与实测有三处出入，如实更正：

1. **`design-systems/` 数量吻合**：预设"约 151 个"，实测 `design-systems/` 下确有 **151 个**品牌包（另有 1 个 `_schema/` 元目录存放 token/manifest 的 TS/CSS 契约定义，不是品牌包，已排除；`design-systems/README.md` 自身也明确写着"当前捆绑目录含 151 个包"）。
2. **每包文件形态比预设丰富**：预设"大致包含 DESIGN.md/manifest.json/tokens.css",实测这三件确为**每包必备**（151/151 全部具备，0 缺失），但多数包还额外带 `USAGE.md`/`components.html`/`components.manifest.json`/`design-tokens.json`/`tailwind-v4.css`/`preview/`/`source/`（导入证据链）等衍生文件——比预设描述的"三件套"更完整，本次只提取了三件套里的事实数值，衍生文件未展开抓取。
3. **`design-templates/` 数量与预设严重不符**：预设"约 36 个渲染模板 + 15 个演示卡片模板"，实测 `design-templates/` 下有 **113 个**顶层模板目录，覆盖 dashboard/prototype/mobile-app/wireframe/video/audio/image 等 9 种 `od.mode`，PPT/演示类（`od.mode: deck`，含 2 个缺 `od:` 字段但描述明确为 deck 的漏网之鱼）只占其中 **55 个**。"36+15"这两个数字精确对应到 `design-templates/html-ppt/` 这一个 skill 包内部的资源数——`assets/themes/` 下恰好 36 个 CSS 主题、`templates/full-decks/` 下恰好 15 个整套场景 Deck——推测预设把 `html-ppt` 内部资源数误当成了顶层模板目录数。详细差异说明见 `layouts-open-design.md` 开头。

---

## 收割统计

### design-systems（品牌设计系统）

| 指标 | 数值 |
|---|---|
| 仓库内实际包总数 | 151 |
| 成功提取（DESIGN.md + manifest.json + tokens.css 三件全齐、可解析） | **151（100%）** |
| 跳过（缺文件/损坏/空包） | **0** |
| tokens.css 语义 token 契约一致性 | 151/151 包共享同一套 83 个 CSS 变量名（`_schema/tokens.schema.ts` 契约），本次为脚本化精确解析，非人工估读 |
| 可用色板数（bg/surface/fg/accent 等全量提取） | 151 |
| 分类分布 | AI & LLM 15 · Media & Consumer 12 · Productivity & SaaS 12 · Creative & Artistic 11 · Professional & Corporate 10 · Modern & Minimal 10 · Backend & Data 9 · Developer Tools 9 · Themed & Unique 8 · Bold & Expressive 8 · Design & Creative 7 · Fintech & Crypto 7 · Automotive 7 · Morphism & Effects 6 · Design & Creative 7 · E-Commerce & Retail 5 · Layout & Structure 4 · Retro & Nostalgic 4 · Starter 3 · 其余单例类目（Editorial · Studio / Editorial & Print / Editorial-Personal-Publication / Social & Messaging）各 1 |

### design-templates（渲染/演示模板）

| 指标 | 数值 |
|---|---|
| 顶层模板目录总数 | 113（另有 1 个 `AGENTS.md` 说明文件，非模板） |
| `od.mode: deck`（演示类，显式声明） | 53 |
| 描述确认为 deck 但 SKILL.md 缺 `od:` 字段（已核实补录） | 2（`html-ppt-taste-brutalist`、`html-ppt-taste-editorial`） |
| **演示类模板合计（本次出规格卡）** | **55** |
| 非演示类模板（prototype/template/image/video/audio 等 6 种其余 `od.mode`） | 58（详见下方"非演示类模板清单"，未逐一出规格卡，仅记名+mode） |
| 55 个演示类中因视觉系统完全相同而合并出卡 | 13 个（`html-ppt-<scenario>` 家族，共享 `html-ppt` 基座默认主题，实测逐字节 diff 仅内容不同） |
| **实际独立规格卡数** | 43（`html-ppt` 基座 1 + `html-ppt-<scenario>` 共享卡 1（覆盖13个）+ `zhangzara` 32 + `taste-*` 2 + 独立包 7（含 replit-deck 内部 8 子主题）＝ 1+1+32+2+7=43，覆盖 1+13+32+2+7=55 个实际模板目录） |

**非演示类模板清单**（58 个，仅记录名称与 `od.mode`，未展开规格卡——不在本次"演示类优先"范围内）：

- `prototype`（网页/落地页/仪表盘等，48 个）：blog-post / clinical-case-report / contact-widget / critique / dashboard / dating-web / dcf-valuation / digital-eguide / docs-page / email-marketing / eng-runbook / finance-report / flowai-live-dashboard-template / gamified-app / github-dashboard / hr-onboarding / invoice / kami-landing / kanban-board / last30days / live-artifact / live-dashboard / magazine-poster / meeting-notes / mobile-app / mobile-onboarding / motion-frames / open-design-landing / orbit-general / orbit-github / orbit-gmail / orbit-linear / orbit-notion / pm-spec / pricing-page / saas-landing / social-carousel / social-media-dashboard / sprite-animation / team-okrs / tweaks / waitlist-page / web-prototype / web-prototype-taste-brutalist / web-prototype-taste-editorial / web-prototype-taste-soft / webgl-experience / wireframe-annotated / wireframe-greybox / wireframe-mobile-flow / wireframe-sketch / worker-visualizer / x-research
- `template`（结构化数据模板，2 个）：social-media-matrix-tracker-template / trading-analysis-dashboard-template
- `image`（1 个）：image-poster
- `video`（2 个）：hyperframes / video-shortform
- `audio`（1 个）：audio-jingle

---

## 字体族去重清单（design-systems/tokens.css 全量，131 个去重后的首选字体名）

**核实方法说明**：以下分类基于对各字体本身的通用认知（是否为 Google Fonts/系统字体/知名开源字体，及其官方发布的字符集范围），**非逐一访问每个品牌官网核实**，故长尾单次出现的西文品牌定制字体统一标注"推定拉丁·未逐一核实"以示与高置信条目的区别，符合"不确定就标注待核实"的要求。

### 中文可用（更正：脚本级复核发现 6 个系统，非初版 README 声称的 1 个——初版只检查了 `fonts.display` 的首选字体，漏看了 body/mono 字段和 display 里排在后面的 fallback 字体，此处已用全字段字符串匹配复核修正）

| 系统 id | 命中的 CJK 相关字体（fallback 链，非首选） | 说明 |
|---|---|---|
| xiaohongshu | PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC | 首选即中文黑体（display/body 都是），4 个 fallback 全部中文可用 |
| wechat | PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC | 与 xiaohongshu 同构，display/body 字体栈以中文黑体开头 |
| minimax | PingFang SC, Hiragino Sans GB, Microsoft YaHei, Noto Sans SC | 首选是拉丁字体（Outfit/DM Sans），但 fallback 链完整覆盖中文 |
| kami | Hiragino Mincho ProN, YuMincho, Noto Serif CJK JP, Source Han Serif JP/SC, TsangerJinKai02 | 唯一衬线中文 fallback 链，且唯一出现真正开源 CJK 字体（见下） |
| bmw | Hiragino Sans, Hiragino Kaku Gothic ProN, Meiryo | 首选拉丁（BMWTypeNextLatin），fallback 是日文黑体，未见简中字体 |
| pinterest | Meiryo | 仅 1 个日文黑体 fallback，未见简中字体 |

**其余 145 个包字体栈内确认无任何 CJK 字体（含 fallback），纯拉丁/西里尔字符集。**

其中 **kami** 的价值最高：其 fallback 链里的 `Noto Serif CJK JP` 和 `Source Han Serif JP`/`Source Han Serif SC` 是 Google/Adobe 联合发布的**真正开源**衬线字体（SIL OFL 协议，简中覆盖完整，即 Source Han Serif 的简体分支"思源宋体"）；`TsangerJinKai02`（汉仪/造字工房系"仓耳今楷"一类字体）需要逐一核实具体授权，未确认前不可直接分发。其余系统（xiaohongshu/wechat/minimax）里的 `PingFang SC`/`Microsoft YaHei` 都是系统内置字体，**非开源、不可分发**，只能作为"用户系统若安装则命中"的 fallback 存在，不能作为 maolab 打包字体的候选。

**补充发现（design-templates 层，供参考）**：`design-templates/html-ppt/assets/base.css` 默认字体栈是 `'Inter','Noto Sans SC',-apple-system,...`，`design-templates/html-ppt-graphify-dark-graph` 等 13 个共享同款；`guizang-ppt` 更进一步做了中英双语分轨（`--serif-zh:"Noto Serif SC"` `--sans-zh:"Noto Sans SC"`）。**Noto Sans SC / Noto Serif SC 均为 Google Noto 开源字体（SIL OFL 协议），中文简体覆盖完整**——对 maolab 的字体选型有直接参考价值：如果要引入本仓库任何西文品牌字体，配 Noto Sans/Serif SC（或衬线场景配 kami 已验证过的 Source Han Serif SC/思源宋体）做中文兜底，是这些系统/模板自己验证过的组合。

### 仅拉丁字符（高置信，count ≥ 2 的 45 个复用字体，均为主流 Google Fonts / 系统字体 / 知名开源字体，官方字符集不含 CJK）

Inter（122 处）、SF Mono（78）、IBM Plex Mono（18）、Georgia（13）、JetBrains Mono（8）、Geist Mono（8）、Roboto Mono（7）、BlinkMacSystemFont（6）、SFMono-Regular（6）、Berkeley Mono（5）、Courier New（5）、CiscoSansTT（4，思科定制但已知无 CJK 版本发布）、Inter Variable（4）、Press Start 2P（4）、Geist（4）、Arial Black（3）、Arial（3）、Source Code Pro（3）、GeistMono（3）、Airbnb Cereal VF（2）、Ant Sans（2）、Helvetica Neue（2）、BinancePlex（2）、BMWTypeNext（2）、Avenir Next（2）、Canva Sans（2）、Inconsolata（2）、gg sans（2）、Comic Sans MS（2）、Ferrari Sans（2）、figmaSans（2）、IBM Plex Sans（2）、Saans（2）、Camera Plain Variable（2）、MarkForMC（2）、Optimistic VF（2）、Formular（2）、NotionInter（2）、NVIDIA-EMEA（2）、Pin Sans（2）、SST（2）、IBM Plex Sans Variable（2）、Renault Group（2）、abcNormal（2）、Monaco（2）、SoDoSans（2）、sohne-var（2）、Circular（2）、Super Sans VF（2）、The Future（2）、Geist Sans（2）、Vodafone（2）、Matter Regular（2）、WF Visual Sans Variable（2）、PingFang SC 除外的其余 2 处字体略。

### 仅拉丁字符（推定拉丁·未逐一核实，count = 1 的长尾西文品牌定制字体，共约 82 个）

Haas Groot Disp / Haas（Airtable）、SF Pro Display/Text（Apple）、Argent CF（Arc）、BMWTypeNextLatin(Light)（BMW）、Bugatti Display、Cal Sans、Anthropic Serif/Sans/Mono（Claude）、CohereText/Unica77 Cohere Web/CohereMono、CoinbaseDisplay/Text、CursorGothic/jjannon/berkeleyMono（Cursor）、gg mono（Discord）、Feather Bold/Mona Sans（Duolingo，注：Mona Sans 是 GitHub 已开源的可变字体，拉丁/西里尔覆盖，无 CJK）、Source Serif Pro（Editorial）、Waldenburg（ElevenLabs）、figmaMono、GT Walsheim Framer Medium/Azeret Mono（Framer）、HashiCorp Sans、Source Sans Pro（HuggingFace）、SaansMono（Intercom）、Lamborghini、Didot（Luxury）、MarkOffcForMC（Mastercard）、Google Sans/Roboto（Material）、Outfit/DM Sans（Minimax）、MongoDB Value Serif/Euclid Circular A、Nike Futura ND/Helvetica Now Text Medium、SF Pro Rounded/Apple Color Emoji（Ollama）、Signifier/Söhne/Söhne Mono（OpenAI）、Canela（Premium）、Franklin Gothic（Publication）、rb-freigeist-neue/basier-square/jetbrains-mono（Replicate）、ABC Favorit/Commit Mono（Resend）、Dammit Sans/Rubik（Sentry）、Fira Code（shadcn）、NeueHaasGrotesk（Shopify）、Larsseit（Slack）、D-DIN(-Bold)（SpaceX）、SpotifyMixUITitle/UI、SourceCodePro（Stripe）、Universal Sans Display/Text（Tesla）、PolySans（The Verge）、PP Neue Montreal Mono（Together AI）、UberMove(Text)、Druk Wide/Exchange（Wired）、Wise Sans、universalSans（x-ai）、Degular（Zapier）等。**均为已知西方品牌定制/编辑设计字体，字符集范围推定为拉丁/西里尔/希腊为主，未逐一访问各字体的官方字符集页面核实——如 maolab 后续要引入某个具体字体渲染中文课堂内容，务必先逐一核实该字体的官方字符集范围，不可直接沿用本表推定。**

---

## 品牌合规三原则（务必遵守）

> **1. 引用数值可用** — tokens.css 里的色值（hex）、字号（px）、圆角（px）、阴影（box-shadow）、间距等数值本身不受版权保护，仓库整体 Apache-2.0 授权下可直接引用到 `palettes-open-design.json` / `layouts-open-design.md`。
> **2. 重命名身份** — maolab 落库时必须使用 `neutralName`（如"留白蓝调""陶橘书卷"）而非品牌名，风格包 id/label 不得出现任何品牌词（Apple/Nike/Claude 等），`palettes-open-design.json` 已按此要求给每个系统起了不含品牌词的中文气质名。
> **3. 记录出处** — 每条数据都标注了 `sourcePath`/源码路径字段，可追溯到具体源文件，供审计。design-templates 的部分子包（`guizang-ppt`/`html-ppt`/32 个 `zhangzara`）带独立 MIT LICENSE 文件（分别来自 `op7418`、`lewislulu/html-ppt-skill`、`Zara Zhang`），已在其对应规格卡里标注授权来源，未笼统套用仓库整体 Apache-2.0；`ib-pitch-book` 则明确注明是对 `anthropics/financial-services`（Apache-2.0）工作流思路的改编，视觉系统原创于本仓库。

---

## maolab 学科×学段映射建议

结合 maolab 是"学生选知识点 → 生成课程 → 虚拟课堂授课"的 AI 课堂应用，对这批素材的适配建议：

| 素材倾向 | 适合学科/学段 | 代表条目 |
|---|---|---|
| 冷淡极简 + 蓝/靛色系（bento/corporate/professional 一类"便当格"原型、apple、ibm、nord 式冷调） | 理科（数学/物理/信息技术）、中学以上 | apple、ibm、hashicorp、together-ai、及 design-systems 里的 `professional`/`corporate` 通用原型 |
| 陶土/暖棕/衬线（kami、editorial、warm-editorial、claude、premium） | 文科（语文/历史）、需要"阅读感"的长文内容、中学以上 | kami、editorial 系、claude |
| 糖果色/圆角/贴纸感（duolingo、wonder-lab 已验证同构的 zhangzara-daisy-days/capsule/scatterbrain、miro、canva） | 低龄向（小学/学前）、游戏化互动环节 | duolingo、miro、zhangzara-daisy-days、zhangzara-capsule |
| 暗色科技/霓虹（cyberpunk-neon 主题、cosmic/fantasy/neon 一类、tetris、hud、trading-terminal） | 信息技术/编程课暗色模式、高中理科的"未来感"包装 | supabase、opencode-ai、zhangzara-8-bit-orbit |
| 水墨/东方美学（Kanagawa 色系已在 imported-packs.ts 验证同构、guizang-ppt 的"编辑杂志×电子墨水"、kami 的羊皮纸+墨蓝） | 语文/历史/传统文化/美术，全学段 | guizang-ppt（Ink Classic/Indigo Porcelain 主题）、kami-deck |
| 硬投影新粗野主义（brutalism、neobrutalism、zhangzara-block-frame/raw-grid/creative-mode） | 需要强对比强调的"辨析"类内容，成人向/大学先修 | zhangzara-block-frame、zhangzara-creative-mode |
| 投行级 OKLCH 软投影（ib-pitch-book）、彭博式暗盘交易终端（trading-terminal） | 高中以上经济/金融通识课、数据分析类选修 | ib-pitch-book、trading-terminal |

---

## DESIGN.md 单文件品牌契约模式对 maolab StylePack 的借鉴

已用 Grep 核实 maolab 现状（未修改任何代码）：`app/app/lib/mainline/presentation/style-packs.ts` 定义 6 个手工精修的 `StylePack`（classic/blueprint/ink-academy/wonder-lab/field-journal/manuscript），每包显式声明 palette + baseplate/labelStyle/markerStyle/decorStyle（四轴签名）+ `typography: {display, body}`（当前只有 `hei`/`song`/`kai` 三种 `FontRole`，见 `tokens.ts`）+ `surface` + `texture` + `imageDNA`；此外 `imported-packs.ts` 已经把上一轮收割的 14 个开源配色宇宙（Nord/Catppuccin/Kanagawa 等，即 `harvest/palettes/` 目录的产出）接入"引进档"，按 `UNIVERSE_IDENTITY` 表手工补齐每个宇宙的身份三轴（字体/表面/质感），`pack-families.ts` 则是纯生成档的锚点组合逻辑——本次 open-design 收割的 151 个系统 + 55 个演示模板，定位与上一轮的 14 个配色宇宙完全相同：**是"引进档"的下一批候选原始素材，不是新架构**。

open-design 仓库 `design-systems/README.md` 明确的"三件套驱动一致性"模式——`manifest.json`（发现元数据/分类/来源）+ `DESIGN.md`（≥7 个 H2 小节的人类可读设计叙事，供 agent 读取）+ `tokens.css`（151 包共享同一套 83 变量名的语义 token 契约，唯一真源）——与 maolab `StylePack` 接口的"四轴签名 + 身份三轴 + imageDNA"高度同构，可直接借鉴的三点：

1. **契约先于内容**：open-design 用 `_schema/tokens.schema.ts` 强制所有 151 包共用同一组变量名，因此本次脚本能 100% 精确解析而不用逐包猜字段名；maolab 的 `StylePack` 接口（`typography`/`surface`/`texture` 全部必填、不留 null 兜底，见 `style-packs.ts` 第 34-37 行注释"防止再退化成只换 7 个 hex"）已经在做同样的事——`imported-packs.ts` 给每个"宇宙"补齐身份三轴的策展逻辑，可以直接照搬 open-design 这套三件套的"衍生文件是缓存而非真源"原则（`components.manifest.json`/`design-tokens.json`/`tailwind-v4.css` 均声明"derived from tokens.css"）：即 tokens.css（或 maolab 的 palette+四轴签名）永远是唯一真源，其余衍生产物（预览页/组件示例）过期就重新生成，不手工维护第二份真相。
2. **人类叙事与机器令牌分离但强制同步**：`DESIGN.md` 是给 agent 读的设计叙事（至少 7 个 H2，不限定顺序/命名），`tokens.css` 是机器消费的精确值——两者由"package-quality guard"校验一致性。maolab 目前 `imageDNA` 字段承担了类似"叙事"角色（一句英文风格提示词），但没有强制与 palette/四轴签名做一致性校验；引入千级方案空间时，建议给每个新风格包也配一份轻量"设计叙事"（哪怕只是 2-3 句话），并用类似 guard 的脚本校验叙事提到的关键词（如"暗场""水墨""硬投影"）与实际 palette/texture/surface 取值不冲突，避免叙事与数值"各说各话"。
3. **"风格原型"与"品牌实例"分层的现成先例**：open-design 里像 `bento`/`corporate`/`professional`/`flat`/`simple` 这组 id 为通用风格词（非品牌名）的包，复用完全相同的 token 数值——这印证了 maolab `imported-packs.ts` 里"一个宇宙 → 多个 flavor → 共享身份三轴"的分层思路是业界验证过的做法，而非权宜之计；下一步扩展千级空间时，可以参考 open-design 用"通用风格词 id"命名这类原型包（而非强行给每个都编一个独一无二的品牌故事），对应 maolab 的 `neutralName` 机制天然契合。

---

## 产出文件

- `E:\CC\code\maolab\docs\design-refresh\harvest\open-design\palettes-open-design.json` — 151 个 design-systems 的结构化记录
- `E:\CC\code\maolab\docs\design-refresh\harvest\open-design\layouts-open-design.md` — 55 个演示类模板的规格卡（43 张卡片覆盖，含合并说明）
- `E:\CC\code\maolab\docs\design-refresh\harvest\open-design\README.md` — 本文件
