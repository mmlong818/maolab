// ─── 主题 token 系统 v1 (canonical 9 themes) ─────────────────────────────────
// 主题是套在所有版式之上的"皮肤"。一个版式 × 9 主题 = 9 张视觉完全不同但信息结构一致的幻灯片。
// 新增主题：在此文件加 ThemeTokens 即可。版式组件读 tokens，不硬编码颜色字号。

import type { ThemeId } from './types';

export type EyebrowStyle =
  | 'plain'              // 默认无装饰
  | 'underline'          // 底部下划线
  | 'rule-top'           // 顶部一道横线
  | 'mono-prefix'        // 等宽 `> _ ` 前缀
  | 'caps-tracking'      // ALL CAPS letter-spacing 0.12em
  | 'serif-italic'       // 衬线斜体小写
  | 'caps-bold'          // ALL CAPS BOLD 无 tracking
  | 'numbered'           // § 2.3 章节编号
  | 'tag-block'          // 色块底反白小字
  | 'live-marker'        // ◉ LIVE 红点 + 等宽
  | 'gold-thin'          // 金色细 tracking-wide caps
  | 'circle-handwritten'; // 衬线斜体 + 波浪下划线

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  description: string;
  mode: 'light' | 'dark';

  // ── 颜色 ────────────────────────────────────────────────────────────────────
  /** 背景。可为纯色 / linear-gradient / radial-gradient */
  bg: string;
  paper: string;        // 卡片/容器底色
  text: string;
  muted: string;
  soft: string;
  border: string;
  rule: string;         // 分割线主色（与 border 可不同）
  accent: string;
  accent2?: string;
  /** 警示色。brutalist 留空表示用 +/- 文字代替 */
  danger?: string;

  // ── 字体 ────────────────────────────────────────────────────────────────────
  fontDisplay: string;
  fontBody: string;
  fontMono: string;
  /** eyebrow 是否强制衬线 */
  fontEyebrowSerif?: string;

  // ── type scale ──────────────────────────────────────────────────────────────
  hero: number;
  section: number;
  body: number;
  caption: number;

  // ── layout ──────────────────────────────────────────────────────────────────
  padding: number;
  radius: number;
  borderWeight: number;
  letterSpacingTitle: string;

  // ── 装饰 ────────────────────────────────────────────────────────────────────
  showFooter: boolean;
  eyebrowStyle: EyebrowStyle;
  /** 声明性：本主题是否允许渐变（运行时不强制，仅用于文档与未来 lint） */
  allowGradient: boolean;
  /** 装饰层（每张幻灯片背后）。CSS background 字符串。 */
  decoration?: string;
  /** 玻璃质感卡片 */
  glass?: boolean;
  /** 特殊纹理规则（仅作文档说明，渲染由组件自行决定） */
  textureRule?: string;
  /** HUD chrome：主题级别在 SlideRenderer 外加四角取景器 + 顶底安全条 */
  hudChrome?: boolean;

  // ── v2 多色主题扩展 ─────────────────────────────────────────────────────────
  /** 4-6 色"指标用色"序列。绑定到 KPI/六宫格的卡片位置 c1..c6（装饰序列，非语义色） */
  palette?: string[];
  /**
   * palette 应用方式：
   * - flat: 平涂色块当卡片底色
   * - gradient-stop: 渐变色段（每色一段）
   * - soft-tint: 半透明叠色（适合东方主题）
   * - risograph-stack: 卡片有彩色错位投影
   * - block-border: 卡片描边或顶部边色
   * - foil-text: 数值文本用渐变 background-clip
   */
  paletteRule?: 'flat' | 'gradient-stop' | 'soft-tint' | 'risograph-stack' | 'block-border' | 'foil-text';
}

export const THEMES: Record<ThemeId, ThemeTokens> = {

  // 1. ────────────────────────────────────────────────────────────────────────
  'editorial-monocle': {
    id: 'editorial-monocle',
    name: '杂志衬线',
    description: '知识编辑权威 · 黑红衬线 · 行业洞察、深度报告、媒体型 deck',
    mode: 'light',
    bg: '#faf8f3',
    paper: '#ffffff',
    text: '#0f0f0e',
    muted: '#5e5b54',
    soft: '#3d362d',
    border: '#0f0f0e',
    rule: '#0f0f0e',
    accent: '#8a1c1c',
    danger: '#8a1c1c',
    fontDisplay: '"Tiempos Headline","Source Serif 4","Source Han Serif SC",Georgia,serif',
    fontBody: '"Tiempos Text","Source Serif 4","Source Han Serif SC",Georgia,serif',
    fontMono: '"IBM Plex Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"Tiempos Headline","Source Serif 4",Georgia,serif',
    hero: 124, section: 64, body: 34, caption: 22,
    padding: 160, radius: 0, borderWeight: 1,
    letterSpacingTitle: '-0.005em',
    showFooter: true, eyebrowStyle: 'serif-italic', allowGradient: false,
  },

  // 3. ────────────────────────────────────────────────────────────────────────
  'modern-minimal': {
    id: 'modern-minimal',
    name: '现代极简',
    description: '中性通用 · 蓝 accent · 产品 review、跨部门汇报、通用兜底',
    mode: 'light',
    bg: '#ffffff',
    paper: '#f6f6f5',
    text: '#0a0a0a',
    muted: '#737373',
    soft: '#404040',
    border: '#e5e5e5',
    rule: '#e5e5e5',
    accent: '#1f6feb',
    danger: '#dc2626',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif',
    fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono","SF Mono",ui-monospace,monospace',
    hero: 132, section: 72, body: 36, caption: 22,
    padding: 140, radius: 0, borderWeight: 1,
    letterSpacingTitle: '-0.02em',
    showFooter: false, eyebrowStyle: 'caps-tracking', allowGradient: false,
  },

  // 4. ────────────────────────────────────────────────────────────────────────
  'tech-utility': {
    id: 'tech-utility',
    name: '工程暗色',
    description: '工程数据控制台 · 终端绿青 · 技术分享、SRE、架构评审',
    mode: 'dark',
    bg: '#0a0c0e',
    paper: '#14171a',
    text: '#e6e8eb',
    muted: '#7a8088',
    soft: '#c8ccd4',
    border: '#2a2f35',
    rule: '#2a2f35',
    accent: '#4ade80',
    accent2: '#38bdf8',
    danger: '#f87171',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif',
    fontBody: '"Inter","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono","SF Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"JetBrains Mono",ui-monospace,monospace',
    hero: 132, section: 64, body: 34, caption: 22,
    padding: 140, radius: 2, borderWeight: 1,
    letterSpacingTitle: '-0.015em',
    showFooter: false, eyebrowStyle: 'mono-prefix', allowGradient: false,
  },

  // 5. ────────────────────────────────────────────────────────────────────────
  'brutalist-mono': {
    id: 'brutalist-mono',
    name: '粗野黑白',
    description: '锋利反套路 · 纯黑白 + 反白强调 · 设计 talk、品牌 manifesto',
    mode: 'light',
    bg: '#ffffff',
    paper: '#ffffff',
    text: '#000000',
    muted: '#404040',
    soft: '#262626',
    border: '#000000',
    rule: '#000000',
    accent: '#000000',  // brutalist 无独立 accent，强调用反白
    fontDisplay: '"Helvetica Neue","Arial Black","PingFang SC",sans-serif',
    fontBody: '"Helvetica Neue","Inter","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 200, section: 100, body: 36, caption: 24,
    padding: 100, radius: 0, borderWeight: 2,
    letterSpacingTitle: '-0.04em',
    showFooter: true, eyebrowStyle: 'caps-bold', allowGradient: false,
  },

  // 6. ────────────────────────────────────────────────────────────────────────
  'academic-paper': {
    id: 'academic-paper',
    name: '学术论文',
    description: '严谨引用 · EB Garamond 衬线 · 白皮书、政策建议、学术报告',
    mode: 'light',
    bg: '#fdfdfb',
    paper: '#ffffff',
    text: '#1c1c1a',
    muted: '#5e5e58',
    soft: '#3d3d38',
    border: '#cfcfca',
    rule: '#cfcfca',
    accent: '#5b1a1a',
    danger: '#5b1a1a',
    fontDisplay: '"Computer Modern Serif","EB Garamond","Source Serif 4","Source Han Serif SC",Georgia,serif',
    fontBody: '"EB Garamond","Source Serif 4","Source Han Serif SC",Georgia,serif',
    fontMono: '"Computer Modern Typewriter","JetBrains Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"EB Garamond",Georgia,serif',
    hero: 116, section: 60, body: 32, caption: 22,
    padding: 160, radius: 0, borderWeight: 0.5,
    letterSpacingTitle: '0',
    showFooter: true, eyebrowStyle: 'numbered', allowGradient: false,
  },

  // 7. ────────────────────────────────────────────────────────────────────────
  'midnight-luxe': {
    id: 'midnight-luxe',
    name: '深夜奢华',
    description: '高端私享 · 衬线超大 + 金色细线 · 投资人路演、奢侈品/金融',
    mode: 'dark',
    bg: '#0e1116',
    paper: '#161a21',
    text: '#e8e2d4',
    muted: '#8a8478',
    soft: '#cfc7b5',
    border: '#2a2e36',
    rule: '#2a2e36',
    accent: '#c8a96a',
    accent2: '#d4b87f',  // per G review，调亮
    danger: '#c47266',
    fontDisplay: '"Cormorant Garamond","Tiempos Headline","Source Serif 4",Georgia,serif',
    fontBody: '"Inter","Söhne","Helvetica Neue","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"Inter",sans-serif',
    hero: 156, section: 72, body: 34, caption: 22,
    padding: 160, radius: 0, borderWeight: 0.5,
    letterSpacingTitle: '-0.01em',
    showFooter: false, eyebrowStyle: 'gold-thin', allowGradient: false,
  },

  // 8. ────────────────────────────────────────────────────────────────────────
  'risograph': {
    id: 'risograph',
    name: '油印套色',
    description: '设计师手作 · 红蓝错位双色叠印 · 设计周分享、内部 jam、创意提案',
    mode: 'light',
    bg: '#f0e8d8',
    paper: '#f0e8d8',
    text: '#1c1c1c',
    muted: '#6e6a5e',
    soft: '#3a3833',
    border: '#1c1c1c',
    rule: '#1c1c1c',
    accent: '#ff5a5f',
    accent2: '#3858bd',
    danger: '#ff5a5f',
    fontDisplay: '"Söhne Breit","Inter Tight","Inter","PingFang SC",sans-serif',
    fontBody: '"Inter","PingFang SC",sans-serif',
    fontMono: '"DM Mono","JetBrains Mono",ui-monospace,monospace',
    hero: 156, section: 84, body: 34, caption: 22,
    padding: 140, radius: 0, borderWeight: 1,
    letterSpacingTitle: '-0.02em',
    showFooter: false, eyebrowStyle: 'tag-block', allowGradient: false,
    textureRule: '关键图形元素 1-2px 错位双色叠印',
    decoration: 'radial-gradient(circle,rgba(255,90,95,0.35) 1.3px,transparent 1.8px)',
  },

  // 9. ────────────────────────────────────────────────────────────────────────
  'broadcast-hud': {
    id: 'broadcast-hud',
    name: '广播 HUD',
    description: '直播节奏 · 黄红 accent + 取景器角标 · 发布会、直播 deck、电竞',
    mode: 'dark',
    bg: '#050709',
    paper: 'rgba(255,255,255,0.04)',
    text: '#ffffff',
    muted: '#9ca3af',
    soft: '#d1d5db',
    border: 'rgba(255,255,255,0.30)',
    rule: 'rgba(255,255,255,0.30)',
    accent: '#fbbf24',
    accent2: '#ef4444',
    danger: '#ef4444',
    fontDisplay: '"Söhne Breit","Inter Tight","Inter","PingFang SC",sans-serif',
    fontBody: '"Inter","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 156, section: 76, body: 34, caption: 22,
    padding: 160, radius: 0, borderWeight: 1,
    letterSpacingTitle: '-0.025em',
    showFooter: true, eyebrowStyle: 'live-marker', allowGradient: false,
    glass: true,
    hudChrome: true,
  },

  // ────────────────────────────────────────────────────────────────────────────
  // v2 · 10 套浅色多色主题 (T11-T20)
  // ────────────────────────────────────────────────────────────────────────────

  // 11 ────────────────────────────────────────────────────────────────────────
  'pastel-bauhaus': {
    id: 'pastel-bauhaus',
    name: '柔色包豪斯',
    description: '几何拼贴 · 大圆+三角+方 · 教培、文创、设计周',
    mode: 'light',
    bg: '#fbf6ed', paper: '#fbf6ed',
    text: '#1a1a18', muted: '#5a5a55', soft: '#3a3a35',
    border: '#1a1a18', rule: '#1a1a18',
    accent: '#d65a3a', danger: '#d65a3a',
    fontDisplay: '"Archivo Black","Helvetica Neue","PingFang SC",sans-serif',
    fontBody: '"Inter","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 156, section: 80, body: 34, caption: 22,
    padding: 140, radius: 16, borderWeight: 0,
    letterSpacingTitle: '-0.03em',
    showFooter: false, eyebrowStyle: 'mono-prefix', allowGradient: false,
    palette: ['#ffd1a4','#a4d8e8','#f4b8c4','#c8e0a4','#ffe7a4','#d4c4e8'],
    paletteRule: 'flat',
  },

  // 12 ────────────────────────────────────────────────────────────────────────
  'summer-cocktail': {
    id: 'summer-cocktail',
    name: '夏日鸡尾酒',
    description: '透明色斑模糊 · 玻璃卡 · 节庆、饮品、生活方式',
    mode: 'light',
    bg: '#fff8e8', paper: 'rgba(255,248,232,0.65)',
    text: '#2a1a3a', muted: '#6a4a8a', soft: '#3a2a4a',
    border: 'rgba(106,74,138,0.25)', rule: 'rgba(106,74,138,0.25)',
    accent: '#ff5a8a', accent2: '#2a9a7a', danger: '#ff5a8a',
    fontDisplay: '"Playfair Display","Source Serif 4",Georgia,serif',
    fontBody: '"Inter","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"JetBrains Mono",ui-monospace,monospace',
    hero: 144, section: 72, body: 34, caption: 22,
    padding: 140, radius: 24, borderWeight: 1.5,
    letterSpacingTitle: '-0.015em',
    showFooter: false, eyebrowStyle: 'mono-prefix', allowGradient: true,
    glass: true,
    palette: ['#ff5a8a','#ffb85a','#c5b8ff','#2a9a7a','#5a8aff','#a55ad6'],
    paletteRule: 'soft-tint',
  },

  // 13 ────────────────────────────────────────────────────────────────────────
  'pop-magazine': {
    id: 'pop-magazine',
    name: '大字杂志',
    description: '撞色 + 大字 + 黑边 · 媒体、流行、节目宣传',
    mode: 'light',
    bg: '#f0e8d4', paper: '#ffffff',
    text: '#1a1a1a', muted: '#1a1a1a', soft: '#1a1a1a',
    border: '#1a1a1a', rule: '#1a1a1a',
    accent: '#ff3a5a', accent2: '#ffd13a', danger: '#ff3a5a',
    fontDisplay: '"Archivo Black","Helvetica Neue","PingFang SC",sans-serif',
    fontBody: '"Inter","PingFang SC",sans-serif',
    fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 220, section: 96, body: 36, caption: 24,
    padding: 160, radius: 0, borderWeight: 4,
    letterSpacingTitle: '-0.035em',
    showFooter: true, eyebrowStyle: 'caps-bold', allowGradient: false,
    palette: ['#ff3a5a','#ffd13a','#1a1a1a','#3a8aff','#2eb56a','#f0e8d4'],
    paletteRule: 'flat',
  },

  // ── v3 · html-ppt-skill 移植（26 套）───────────────────────────────────────

  'blueprint': {
    id: 'blueprint', name: '蓝图', description: '工程蓝图 · 等宽字体 · 建筑/工程/技术方案', mode: 'dark',
    bg: '#0b3a6f', paper: '#0a3260', text: '#e8f3ff', muted: '#7da8cf', soft: '#b0d0ef', border: '#3a6090', rule: '#3a6090',
    accent: '#ffffff', danger: '#ff8c42',
    fontDisplay: '"JetBrains Mono","SF Mono",ui-monospace,monospace', fontBody: '"JetBrains Mono","SF Mono",ui-monospace,monospace', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 120, section: 60, body: 30, caption: 20, padding: 140, radius: 0, borderWeight: 1, letterSpacingTitle: '0',
    showFooter: true, eyebrowStyle: 'mono-prefix', allowGradient: false,
    decoration: 'repeating-linear-gradient(0deg,rgba(255,255,255,0.12) 0,rgba(255,255,255,0.12) 1px,transparent 1px,transparent 60px),repeating-linear-gradient(90deg,rgba(255,255,255,0.12) 0,rgba(255,255,255,0.12) 1px,transparent 1px,transparent 60px)',
  },

  'cyberpunk-neon': {
    id: 'cyberpunk-neon', name: '赛博朋克', description: '黑底霓虹紫 · 游戏/科技/发布会', mode: 'dark',
    bg: '#000000', paper: '#0f0f1a', text: '#f5f7ff', muted: '#6b6e8a', soft: '#9a9dc0', border: '#1a0a20', rule: '#1a0a20',
    accent: '#ff2bd6', accent2: '#00e5ff', danger: '#ff2b2b',
    fontDisplay: '"JetBrains Mono","SF Mono",ui-monospace,monospace', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 144, section: 72, body: 34, caption: 22, padding: 140, radius: 0, borderWeight: 1, letterSpacingTitle: '0.02em',
    showFooter: false, eyebrowStyle: 'mono-prefix', allowGradient: true,
    decoration: 'radial-gradient(ellipse at 20% 50%,rgba(255,43,214,0.28) 0,transparent 45%),radial-gradient(ellipse at 80% 50%,rgba(0,229,255,0.20) 0,transparent 45%)',
  },

  'glassmorphism': {
    id: 'glassmorphism', name: '玻璃态', description: '深蓝玻璃质感 · 模糊半透明卡 · AI/科技/产品', mode: 'dark',
    bg: '#0b1024', paper: '#0e1530', text: '#f2f4ff', muted: '#8287a8', soft: '#b0b5d8', border: '#1a2040', rule: '#1a2040',
    accent: '#7dd3fc', accent2: '#a78bfa', danger: '#fb7185',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 144, section: 72, body: 34, caption: 22, padding: 140, radius: 16, borderWeight: 1, letterSpacingTitle: '-0.02em',
    showFooter: false, eyebrowStyle: 'mono-prefix', allowGradient: true,
    glass: true,
    decoration: 'radial-gradient(ellipse at 25% 30%,rgba(125,211,252,0.32) 0,transparent 50%),radial-gradient(ellipse at 75% 70%,rgba(167,139,250,0.28) 0,transparent 45%)',
  },

  'memphis-pop': {
    id: 'memphis-pop', name: '孟菲斯', description: '80年代几何图案 · 几何色块 · 创意/设计/文化', mode: 'light',
    bg: '#fef6e8', paper: '#ffffff', text: '#111111', muted: '#666666', soft: '#333333', border: '#111111', rule: '#111111',
    accent: '#ff3d8b', accent2: '#3d8bff', danger: '#ff3d8b',
    fontDisplay: '"Archivo Black","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 156, section: 80, body: 34, caption: 22, padding: 140, radius: 0, borderWeight: 3, letterSpacingTitle: '-0.025em',
    showFooter: false, eyebrowStyle: 'caps-bold', allowGradient: false,
    palette: ['#ff3d8b','#3d8bff','#ffe800','#00c9a7','#ff6b35','#a855f7'],
    paletteRule: 'flat',
  },

  'midcentury': {
    id: 'midcentury', name: '中世纪现代', description: '50-60年代暖色 · 衬线 + 黄金色调 · 品牌/历史/经典', mode: 'light',
    bg: '#f3ead8', paper: '#f9f2e0', text: '#201810', muted: '#9a8868', soft: '#4a3820', border: '#8c7050', rule: '#8c7050',
    accent: '#d4902a', danger: '#c0392b',
    fontDisplay: '"Source Serif 4","Noto Serif SC",Georgia,serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"Source Serif 4",Georgia,serif',
    hero: 132, section: 64, body: 34, caption: 22, padding: 140, radius: 0, borderWeight: 1, letterSpacingTitle: '-0.01em',
    showFooter: true, eyebrowStyle: 'serif-italic', allowGradient: false,
  },

  'minimal-white': {
    id: 'minimal-white', name: '纯白极简', description: '纯白无装饰 · 极简兜底 · 通用', mode: 'light',
    bg: '#ffffff', paper: '#fafafa', text: '#0c0d10', muted: '#9ca1b0', soft: '#4a4d5a', border: '#e0e0e2', rule: '#e0e0e2',
    accent: '#111216', danger: '#dc2626',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 132, section: 64, body: 36, caption: 22, padding: 160, radius: 0, borderWeight: 1, letterSpacingTitle: '-0.02em',
    showFooter: false, eyebrowStyle: 'plain', allowGradient: false,
  },

  'pitch-deck-vc': {
    id: 'pitch-deck-vc', name: 'VC Pitch', description: '标准 VC 风格 · 干净蓝白 · 融资路演', mode: 'light',
    bg: '#ffffff', paper: '#fafbfc', text: '#0b0d12', muted: '#8b93a8', soft: '#2a3048', border: '#e0e4eb', rule: '#e0e4eb',
    accent: '#0070f3', danger: '#ef4444',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 144, section: 72, body: 36, caption: 22, padding: 140, radius: 4, borderWeight: 1, letterSpacingTitle: '-0.025em',
    showFooter: false, eyebrowStyle: 'caps-tracking', allowGradient: false,
  },

  'retro-tv': {
    id: 'retro-tv', name: '复古电视', description: '70年代暖橙 · 衬线复古 · 媒体/品牌历史/怀旧', mode: 'light',
    bg: '#f5ecd7', paper: '#fbf5e2', text: '#2a1a08', muted: '#a68656', soft: '#4a2a10', border: '#c09060', rule: '#c09060',
    accent: '#e67e14', danger: '#c0392b',
    fontDisplay: '"Source Serif 4","Noto Serif SC",Georgia,serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"Source Serif 4",Georgia,serif',
    hero: 132, section: 64, body: 34, caption: 22, padding: 140, radius: 0, borderWeight: 1, letterSpacingTitle: '-0.01em',
    showFooter: true, eyebrowStyle: 'serif-italic', allowGradient: false,
  },

  'swiss-grid': {
    id: 'swiss-grid', name: '瑞士网格红', description: '瑞士国际风格 · 红黑网格 · 设计/平面/品牌', mode: 'light',
    bg: '#ffffff', paper: '#f4f4f4', text: '#111111', muted: '#888888', soft: '#2a2a2a', border: '#111111', rule: '#111111',
    accent: '#d6001c', danger: '#d6001c',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 144, section: 72, body: 34, caption: 22, padding: 140, radius: 0, borderWeight: 2, letterSpacingTitle: '-0.025em',
    showFooter: true, eyebrowStyle: 'caps-tracking', allowGradient: false,
  },

  'tokyo-night': {
    id: 'tokyo-night', name: '东京夜晚', description: '蓝紫夜色 · 开发者偏好 · 技术/ACG/夜间', mode: 'dark',
    bg: '#1a1b26', paper: '#24283b', text: '#c0caf5', muted: '#565f89', soft: '#9aa5ce', border: '#2f334d', rule: '#2f334d',
    accent: '#7aa2f7', accent2: '#bb9af7', danger: '#f7768e',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 132, section: 64, body: 34, caption: 22, padding: 140, radius: 4, borderWeight: 1, letterSpacingTitle: '-0.015em',
    showFooter: false, eyebrowStyle: 'mono-prefix', allowGradient: false,
    palette: ['#7aa2f7','#bb9af7','#7dcfff','#9ece6a','#ff9e64','#f7768e'],
    paletteRule: 'soft-tint',
  },

  'vaporwave': {
    id: 'vaporwave', name: '蒸汽波', description: '紫粉复古未来 · 80年代赛博 · 创意/音乐/潮流', mode: 'dark',
    bg: '#1a0938', paper: '#261050', text: '#fdf0ff', muted: '#8a6ba8', soft: '#d0a8f0', border: '#2a1050', rule: '#2a1050',
    accent: '#ff6ec7', accent2: '#00e5ff', danger: '#ff6b6b',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 144, section: 72, body: 34, caption: 22, padding: 140, radius: 0, borderWeight: 1, letterSpacingTitle: '0.02em',
    showFooter: false, eyebrowStyle: 'caps-tracking', allowGradient: true,
    decoration: 'linear-gradient(180deg,rgba(255,110,199,0.08) 0,rgba(0,229,255,0.06) 100%)',
  },

  'xiaohongshu': {
    id: 'xiaohongshu', name: '小红书', description: '暖白 + 红豆 · 生活方式内容 · 消费/美妆/种草', mode: 'light',
    bg: '#fffdfb', paper: '#ffffff', text: '#1a1210', muted: '#a08d85', soft: '#4a2820', border: '#e8d8d0', rule: '#e8d8d0',
    accent: '#ff2742', danger: '#ff2742',
    fontDisplay: '"Noto Serif SC","Source Han Serif SC",Georgia,serif', fontBody: '"PingFang SC","Microsoft YaHei",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    fontEyebrowSerif: '"Noto Serif SC",Georgia,serif',
    hero: 132, section: 64, body: 34, caption: 22, padding: 140, radius: 8, borderWeight: 1, letterSpacingTitle: '-0.01em',
    showFooter: false, eyebrowStyle: 'serif-italic', allowGradient: false,
  },

  'y2k-chrome': {
    id: 'y2k-chrome', name: 'Y2K 铬', description: '千禧金属铬 · 渐变紫蓝 · 潮流/科技回顾/时尚', mode: 'light',
    bg: '#dfe4ec', paper: '#eef1f6', text: '#1a1f2e', muted: '#8590a6', soft: '#2a3048', border: '#a0aabf', rule: '#a0aabf',
    accent: '#8a5cff', accent2: '#4ab8ff', danger: '#ff5c8a',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 132, section: 64, body: 34, caption: 22, padding: 140, radius: 12, borderWeight: 1, letterSpacingTitle: '-0.02em',
    showFooter: false, eyebrowStyle: 'caps-tracking', allowGradient: true,
    decoration: 'linear-gradient(135deg,rgba(138,92,255,0.08) 0,rgba(74,184,255,0.08) 100%)',
  },

  // ── v5 · swiss 变体（4 套）─────────────────────────────────────────────────

  'swiss-ikb': {
    id: 'swiss-ikb', name: '瑞士·IKB蓝', description: '克莱因蓝 · 瑞士网格 · 艺术/设计/品牌', mode: 'light',
    bg: '#fafaf8', paper: '#ffffff', text: '#0a0a0a', muted: '#737373', soft: '#1a1a1a', border: '#d4d4d2', rule: '#d4d4d2',
    accent: '#002FA7', danger: '#c0392b',
    fontDisplay: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","Helvetica Neue","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 144, section: 72, body: 34, caption: 22, padding: 140, radius: 0, borderWeight: 2, letterSpacingTitle: '-0.025em',
    showFooter: true, eyebrowStyle: 'caps-tracking', allowGradient: false,
  },

  // ── v6 · open-slide（1 套）─────────────────────────────────────────────────

  'open-sticker-pop': {
    id: 'open-sticker-pop', name: 'Open·贴纸波普', description: '热粉贴纸 · 撞色边框 · 年轻/潮流/消费', mode: 'light',
    bg: '#fff2e8', paper: '#ffe6d3', text: '#2d1b4e', muted: '#9a8aa8', soft: '#4a2a70', border: '#2d1b4e', rule: '#2d1b4e',
    accent: '#ff4d8d', accent2: '#ffd600', danger: '#ff4d8d',
    fontDisplay: '"Archivo Black","Helvetica Neue","PingFang SC",sans-serif', fontBody: '"Inter","PingFang SC",sans-serif', fontMono: '"JetBrains Mono",ui-monospace,monospace',
    hero: 156, section: 80, body: 34, caption: 22, padding: 120, radius: 12, borderWeight: 3, letterSpacingTitle: '-0.03em',
    showFooter: false, eyebrowStyle: 'caps-bold', allowGradient: false,
    palette: ['#ff4d8d','#ffd600','#2d1b4e','#00e5ff','#b6ff00','#fff2e8'],
    paletteRule: 'block-border',
  },
};

/**
 * Curated set of 12 themes shown in pickers. Other themes stay in `THEMES`
 * for backward compatibility with existing decks but are hidden from new UI
 * to reduce decision fatigue.
 *
 * Selection rule: every visible theme has a distinct typographic and color
 * personality. Themes with high overlap are hidden until they earn back a slot.
 */
export const VISIBLE_THEMES: ThemeId[] = [
  'modern-minimal',
  'editorial-monocle',
  'academic-paper',
  'midnight-luxe',
  'swiss-grid',
  'tech-utility',
  'blueprint',
  'cyberpunk-neon',
  'brutalist-mono',
  'pop-magazine',
  'risograph',
  'glassmorphism',
];

export function visibleThemes() {
  return VISIBLE_THEMES.map(id => THEMES[id]).filter(Boolean);
}
