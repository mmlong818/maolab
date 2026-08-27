# 画廊套件(所有学科可视样例统一骨架)

目标:把各学科 spec 的「超越设计」方向**画成真实可看的 mock 幻灯**,汇成 `<subject>-gallery.html`。全学科共用本套件的 token 与稳健规则,视觉才统一、且不重复踩坑。

## 一、必须复用的设计 token(原样粘进 `<style>`)
```css
:root{
  --bg:#fcfbf9;--surface:#ffffff;--ink:#16181d;--sub:#5b606b;--faint:#9aa0ab;
  --line:#e9e6df;--hair:#efece6;
  --indigo:#3b4e7e;--teal:#0e7c7b;--gold:#b5872f;--jade:#3f7d63;--coral:#c25d4b;--plum:#7a5c8e;
  --serif:"Songti SC","STSong","Noto Serif CJK SC",serif;
  --sans:"PingFang SC","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif;
  --mono:"SF Mono","JetBrains Mono",ui-monospace,Menlo,monospace;
  --shadow:0 22px 55px -30px rgba(20,22,28,.30);--radius:16px;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--sans);line-height:1.6;-webkit-font-smoothing:antialiased}
```
> 强调色:每个方向选 1 枚,从 indigo/teal/gold/jade/coral 里挑(**禁粉紫 --plum 作地色或主强调**,仅极少数情况点缀);地色永远近纯白 `--surface`/`--bg`,颜色只在物件层。避开 cream+宋体+朱砂 的陈词滥调组合。

## 二、稳健规则(古诗校准踩坑总结,违反必翻车)
1. **禁用会裁切的 stage**:mock 幻灯容器**给固定高度**(如 `min-height:340px` 或 `height:360px`),**不要用 `aspect-ratio` + `overflow:hidden`**——那会把内容裁掉、看着像空白。
2. **复杂卡片用内联 style 或直白 flex/grid**,别把关键内容塞进多层自定义 class 再靠 class 规则渲染(古诗 C 卡因 class 规则 gremlin 整块空白,改内联样式才好)。宁可啰嗦、要能出。
3. **SVG 必带显式 `width="" height=""` 属性**(不能只靠 CSS),否则按默认 300×150 撑爆布局。inline SVG 画示意图(受力箭头/电路/分子键/坐标轴)很鼓励,但每个都要显式尺寸 + `style="display:block"`。
4. **文字要真能读**:深色文字(--ink/#24262d)配近白底;小标签用 --faint/--sub。别白字白底。
5. **竖排(writing-mode:vertical-rl)**:每行单独一个 span,`white-space:nowrap`,别把整段塞一个容器靠自动换列(会重叠)。
6. **响应式无所谓**:这是给桌面截图看的,固定宽度布局即可(页面 max-width 1180)。

## 三、页面结构(每个 `<subject>-gallery.html`)
```
<title>{学科} · 特殊内容呈现画廊</title>
<style>… token + 你的样式 …</style>
<header>大标题「{学科}·超越教材的呈现」+ 一句定位 lede</header>
每个内容类型一个 <section>:
  <h2>类型名 + 教育内核一句</h2>
  一行并排 2–3 张 mock 幻灯卡(方向甲/乙/丙),每张:
    - 顶部小 tag「方向甲·名」(强调色)
    - 主体:该方向的真实视觉 mock(固定高度 ~340px,白底,真实学科示例内容)
    - 底部 caption:一句视觉语法说明
  类型下方一条「学段四档」小带(低小/高小/初中/高中 各一句,可用 4 个小卡)
footer:学科 + 日期 + 「白为主·颜色只在物件层」
```

## 四、内容要真实
用该学科真实的教学示例(真实的诗句/单词/方程/受力情境/地图要素/朝代),**不要 lorem、不要占位**。示例要正确(音标、配平、平仄、键角、年代都不能错)。

## 五、参考
- 古诗校准页 `C:\Users\nd851\AppData\Local\Temp\claude\E--CC-code-maolab\8da6a22b-042c-42f7-95b9-36656bea5999\scratchpad\gushi-calibration.html`(境/律/叙三方向 + 学段带的完成度标杆,读它对齐质量)
- 你学科的文字 spec:`2026-07-23-typed-content/<subject>.md`(方向定义的事实源,画的就是它)
