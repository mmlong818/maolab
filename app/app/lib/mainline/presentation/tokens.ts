import type { SubjectId } from '../domain.js'

/**
 * 学科呈现 token · docs/scene-presentation-redesign-2026-07-13 P0「token 先行」落地
 *
 * 共守稳定核心:暖纸底 + 深墨字(品牌基调不随学科漂移);
 * 每学科一个**强调色**(卡片描边/编号/路径节点/小标)和一组**幕布渐变**(底色向学科色相
 * 轻微偏移 ≤12%,保证跨科目一眼可辨但不破坏同一产品的整体感)。
 * 真检 round08:此前全部组件硬编码同一套暖米色,10 科目视觉同质。
 */

export interface SubjectTheme {
  /** 强调色:卡片描边、编号、stepper 节点、小节标签 */
  accent: string
  /** 强调色的浅底(卡片内衬/高亮块) */
  accentSoft: string
  /** 幕布渐变(顶→中→底) */
  backdrop: readonly [string, string, string]
}

// 白为主改造(2026-07-22):classic 托底同步——幕布渐变从米黄/灰调有色纸提进白族
// (底档 L≥0.92),化学/科学的紫系 accent 换为青绿/靛蓝(粉紫禁令波及)。
const THEMES: Partial<Record<SubjectId, SubjectTheme>> = {
  chinese: { accent: '#a8453a', accentSoft: '#f7e3dc', backdrop: ['#f8f3ec', '#f6f1ea', '#f4efe8'] },
  math: { accent: '#4a6ebd', accentSoft: '#cee1fe', backdrop: ['#f4f4ef', '#f2f2ed', '#f0f0eb'] },
  physics: { accent: '#358287', accentSoft: '#c6e7e9', backdrop: ['#f0f4f2', '#eff3f1', '#edf1ef'] },
  chemistry: { accent: '#0f766e', accentSoft: '#d7f0ed', backdrop: ['#f0f5f4', '#eef3f2', '#ecf1f0'] },
  biology: { accent: '#4a8a4f', accentSoft: '#e0efe1', backdrop: ['#f3f5ed', '#f1f3eb', '#eff1e9'] },
  english: { accent: '#3383ad', accentSoft: '#c3e6f9', backdrop: ['#f1f4f3', '#eff2f1', '#eef1f0'] },
  history: { accent: '#a06b2a', accentSoft: '#f5e8d5', backdrop: ['#f7f3ea', '#f5f1e8', '#f4f0e7'] },
  geography: { accent: '#6f7d3c', accentSoft: '#eaeed9', backdrop: ['#f4f4eb', '#f2f2e9', '#f1f1e8'] },
  science: { accent: '#406fca', accentSoft: '#c7e3ff', backdrop: ['#f2f4f6', '#f0f2f5', '#eef0f3'] },
}

const GENERAL_THEME: SubjectTheme = {
  accent: '#8a6a42',
  accentSoft: '#f1e7d4',
  backdrop: ['#f7f3ea', '#f5f1e8', '#f4f0e7'],
}

export function subjectTheme(subject: SubjectId): SubjectTheme {
  return THEMES[subject] ?? GENERAL_THEME
}

export function backdropGradient(theme: SubjectTheme): string {
  const [top, mid, bottom] = theme.backdrop
  return `linear-gradient(180deg, ${top} 0%, ${mid} 54%, ${bottom} 100%)`
}

/**
 * 中文类型音阶 · 方向 A「剧场刊物」排印骨架
 * (docs/design-refresh/2026-07-21-design-directions.md §3A「类型音阶落地」)
 *
 * 治「零展示级排印:通篇系统黑体加粗,无字号音阶」(诊断表病灶 4)。五档:
 * display(全课至多 2-3 处「英雄时刻」:开场课题/定理核心表述/收束一句话结论)、
 * heading(幕内小节标题、突出的单句陈述)、body(常规卡片正文)、
 * caption(标签/元信息,次级墨色由调用方叠 alpha)、decorative(超大装饰序号,低透明度)。
 *
 * 中文校准(区别于西文音阶):
 * - 行高比拉丁文高一档(中文字形无升降部,视觉行距需求更松,heti 同款结论);
 * - 字距硬顶 0.05em——galgame/西文 small-caps 那套宽 tracking 对汉字是伤害不是强调,
 *   诊断表已把旧版 0.12-0.22em tracking 列为需铲掉的病灶,新代码不得超此值。
 */
export type TypeTier = 'display' | 'heading' | 'body' | 'caption' | 'decorative'

export interface TypeStyle {
  fontSize: string
  lineHeight: number
  fontWeight: number
  letterSpacing?: string
  fontFamily?: string
}

/**
 * StylePack 字体身份轴(2026-07-21 起,10 族 · 硬指标「字体 ≥10 族」docs/design-refresh/
 * hard-targets-spec.md 指标 2)· 数值见 globals.css 顶部的 webfont @import 说明
 * (unicode-range 切片,按需懒加载)。
 *
 * 正文可读三族(ReadableFontRole,body 档只许出现这三族):
 * - kai:霞鹜文楷屏显版(cn-fontsource-lxgw-wen-kai-screen)——楷体气质,水墨/童话类包用。
 * - song:Noto Serif SC——宋体气质,期刊/论文类包用。
 * - hei:Noto Sans SC(叠加站点既有 GeistSans 作 Latin/数字优先栈)——黑体气质,
 *   工程蓝图/科技类包用。
 *
 * 美术/书法七族(仅 display 档可用,TypeStyle.fontFamily / typography.display 才可引用):
 * - xiaowei:ZCOOL XiaoWei(站酷小薇体,清瘦手写感)
 * - huangyou:ZCOOL QingKe HuangYou(站酷庆科黄油体,圆润卡通感)
 * - kuaile:ZCOOL KuaiLe(站酷快乐体,童趣圆体)
 * - mashan:Ma Shan Zheng(马善政毛笔楷书)
 * - longcang:Long Cang(龙藏行书)
 * - zhimang:Zhi Mang Xing(志莽行书)
 * - liujian:Liu Jian Mao Cao(刘建毛草体)——候选池「朱雀仿宋」无 npm 包,按预案替补
 */
export type ReadableFontRole = 'kai' | 'song' | 'hei'
export type DisplayOnlyFontRole =
  | 'xiaowei' | 'huangyou' | 'kuaile' | 'mashan' | 'longcang' | 'zhimang' | 'liujian'
export type FontRole = ReadableFontRole | DisplayOnlyFontRole

export const READABLE_FONT_ROLES: readonly ReadableFontRole[] = ['kai', 'song', 'hei']

export const FONT_STACKS: Record<FontRole, string> = {
  kai: "'LXGW WenKai Screen', 'Kaiti SC', STKaiti, KaiTi, serif",
  song: "'Noto Serif SC', 'Songti SC', SimSun, serif",
  hei: "'Noto Sans SC', var(--font-geist-sans), 'PingFang SC', 'Microsoft YaHei', sans-serif",
  xiaowei: "'ZCOOL XiaoWei', 'Kaiti SC', KaiTi, serif",
  huangyou: "'ZCOOL QingKe HuangYou', 'PingFang SC', sans-serif",
  kuaile: "'ZCOOL KuaiLe', 'PingFang SC', sans-serif",
  mashan: "'Ma Shan Zheng', 'Kaiti SC', KaiTi, cursive, serif",
  longcang: "'Long Cang', 'Kaiti SC', KaiTi, cursive, serif",
  zhimang: "'Zhi Mang Xing', 'Kaiti SC', KaiTi, cursive, serif",
  liujian: "'Liu Jian Mao Cao', 'Kaiti SC', KaiTi, cursive, serif",
}

export function isReadableFontRole(role: FontRole): role is ReadableFontRole {
  return (READABLE_FONT_ROLES as readonly FontRole[]).includes(role)
}

/**
 * 1920×1080 学生投影片的强制字号下限。
 * 内容超过画面容量时必须拆页，不允许通过缩字绕过这些值。
 */
export const PROJECTION_TEXT_MIN_PX = {
  display: 36,
  heading: 36,
  body: 28,
  auxiliary: 20,
  diagram: 22,
} as const

export type ProjectionTextRole = keyof typeof PROJECTION_TEXT_MIN_PX

/** 专用图表和非标准母版使用；preferredPx 只可放大，不能突破角色下限。 */
export function projectionFontSize(role: ProjectionTextRole, preferredPx?: number): string {
  return `${Math.max(preferredPx ?? 0, PROJECTION_TEXT_MIN_PX[role])}px`
}

/**
 * display/heading 走 CSS 变量 `--pack-font-display`(StageCanvas 按当前课程
 * pack.typography.display 注入具体字体栈,见 StageCanvas.tsx);body/caption/
 * decorative 不显式声明 fontFamily,靠 CSS 继承拿到舞台根节点的 `--pack-font-body`
 * ——这样新增/调整字体角色只改 StageCanvas 一处注入点,TYPE_SCALE 本身不用为每个
 * tier 都写一遍 fontFamily(单一事实源)。
 */
export const TYPE_SCALE: Record<TypeTier, TypeStyle> = {
  display: { fontSize: '68px', lineHeight: 1.12, fontWeight: 700, fontFamily: 'var(--pack-font-display)' },
  heading: { fontSize: '40px', lineHeight: 1.24, fontWeight: 700, fontFamily: 'var(--pack-font-display)' },
  body: { fontSize: '30px', lineHeight: 1.5, fontWeight: 600 },
  caption: { fontSize: '20px', lineHeight: 1.4, fontWeight: 600, letterSpacing: '0.04em' },
  decorative: { fontSize: '220px', lineHeight: 1, fontWeight: 800 },
}

/**
 * 内容感知字号 · 专家排版三原则之一(docs/design-refresh/2026-07-21-typography)
 *
 * 封面主标题可按长度在 display 层级内降档。普通页标题固定 42px，正文固定
 * 30px：相同语义不能仅因字数不同就忽大忽小；内容超出画面容量时靠分段、
 * 收窄行长或拆页处理，不通过缩放普通页标题或正文解决。
 *
 * 1920×1080 舞台、3-5 米观看距离下校准:display/heading 地板 36px、
 * heading 标准 42px、body 标准 30px。辅助文字与图表标签分别走 20px/22px 下限。封面标题行高随字号增大而收紧
 * (大字标题 1.15-1.28,正文 1.5-1.65,中文无升降部、行距需求更松)。
 * 单一事实源:各母版改字号一律走这张表,不许在调用点散落 if/三元。
 */
export type FitTypeTier = 'display' | 'heading' | 'body'

interface FitRung {
  /** 该档命中的字符数上限(含),最后一档为 Infinity 兜底(硬地板)。 */
  maxChars: number
  fontSize: number
  lineHeight: number
}

const FIT_TABLE: Record<FitTypeTier, readonly FitRung[]> = {
  display: [
    { maxChars: 16, fontSize: 72, lineHeight: 1.12 },
    { maxChars: 32, fontSize: 58, lineHeight: 1.16 },
    { maxChars: 64, fontSize: 46, lineHeight: 1.2 },
    { maxChars: Infinity, fontSize: 36, lineHeight: 1.25 },
  ],
  heading: [
    { maxChars: Infinity, fontSize: 42, lineHeight: 1.24 },
  ],
  body: [
    { maxChars: Infinity, fontSize: 30, lineHeight: 1.5 },
  ],
}

/** 正文行长硬顶(字/行)——超长文本用它判断"该分段/收窄行宽"而非"该缩字号"。 */
export const MEASURE_CHARS_MAX = 34

/** 按字符量在 tier 内部降档,取代死 px；fontWeight/fontFamily 沿用该 tier 的 TYPE_SCALE 基准值。 */
export function fitType(tier: FitTypeTier, charCount: number): TypeStyle {
  const rungs = FIT_TABLE[tier]
  const rung = rungs.find(r => charCount <= r.maxChars) ?? rungs[rungs.length - 1]!
  return { ...TYPE_SCALE[tier], fontSize: `${rung.fontSize}px`, lineHeight: rung.lineHeight }
}
