/**
 * classroom-theme — 课程视觉主题 token（呈现升级 P1）
 *
 * 一课一气质: 按学科映射一套视觉 token(背景/墨色/强调/纸纹/标题字), 全课贯穿。
 * 设计原则: 学科有真实视觉语言差异(不是换主色), 但都保持课堂的纸面质感。
 */

export interface ClassroomTheme {
  /** 舞台背景(含纹理) */
  stageBg: string
  /** 主文字色(墨) */
  ink: string
  /** 强调色(学科色) */
  accent: string
  /** 弱强调/边框 */
  accentSoft: string
  /** 标题字体栈 */
  headingFont: string
  /** 纸面卡片背景 */
  paper: string
  /** 舞台背景的纯色近似(PPTX 导出等不支持渐变的场景) */
  stageSolid: string
  /** 学科图形语言提示(给呈现器选装饰用) */
  motif: 'lab' | 'grid' | 'scroll' | 'map' | 'leaf' | 'plain'
}

/** 底图水印字符(配图方法论 6.3: 学科图形语言, 透明度 ≤8%, 不与内容争焦点) */
export const MOTIF_GLYPH: Record<ClassroomTheme['motif'], string> = {
  lab: '⌬',
  grid: '∑',
  scroll: '𝄞',
  map: '◬',
  leaf: '❧',
  plain: '',
}

const THEMES: Record<string, ClassroomTheme> = {
  化学: {
    stageBg: 'linear-gradient(180deg, #f0f7f6 0%, #e6f0ee 100%)',
    ink: '#16302b',
    accent: '#0d9488',
    accentSoft: '#99e6dd',
    headingFont: '"Noto Sans SC", system-ui, sans-serif',
    paper: '#fcfefd',
    stageSolid: '#ebf4f2',
    motif: 'lab',
  },
  物理: {
    stageBg: 'linear-gradient(180deg, #f0f4fa 0%, #e7edf7 100%)',
    ink: '#1a2740',
    accent: '#2563eb',
    accentSoft: '#bfd5fb',
    headingFont: '"Noto Sans SC", system-ui, sans-serif',
    paper: '#fdfdff',
    stageSolid: '#ecf1f9',
    motif: 'grid',
  },
  数学: {
    stageBg: 'repeating-linear-gradient(0deg, #f6f8fb, #f6f8fb 31px, #e9eef5 32px), repeating-linear-gradient(90deg, #f6f8fb, transparent 31px, #e9eef5 32px)',
    ink: '#1e293b',
    accent: '#4f46e5',
    accentSoft: '#c7d2fe',
    headingFont: '"Noto Sans SC", system-ui, sans-serif',
    paper: '#ffffff',
    stageSolid: '#f3f6fa',
    motif: 'grid',
  },
  语文: {
    stageBg: 'linear-gradient(180deg, #faf7f0 0%, #f3eee0 100%)',
    ink: '#3b2f23',
    accent: '#b45309',
    accentSoft: '#ecd5ab',
    headingFont: '"Noto Serif SC", serif',
    paper: '#fffdf7',
    stageSolid: '#f7f3e8',
    motif: 'scroll',
  },
  历史: {
    stageBg: 'linear-gradient(180deg, #f8f3ea 0%, #efe6d4 100%)',
    ink: '#44321f',
    accent: '#92400e',
    accentSoft: '#e5cfa8',
    headingFont: '"Noto Serif SC", serif',
    paper: '#fdf9f0',
    stageSolid: '#f4edde',
    motif: 'scroll',
  },
  地理: {
    stageBg: 'linear-gradient(180deg, #eef6f1 0%, #e2efe6 100%)',
    ink: '#1f3a2c',
    accent: '#15803d',
    accentSoft: '#b5e3c6',
    headingFont: '"Noto Sans SC", system-ui, sans-serif',
    paper: '#fbfefb',
    stageSolid: '#e8f3ec',
    motif: 'map',
  },
  生物: {
    stageBg: 'linear-gradient(180deg, #f2f8ee 0%, #e8f2e0 100%)',
    ink: '#27351c',
    accent: '#65a30d',
    accentSoft: '#d3e8b3',
    headingFont: '"Noto Sans SC", system-ui, sans-serif',
    paper: '#fcfef9',
    stageSolid: '#edf5e7',
    motif: 'leaf',
  },
  英语: {
    stageBg: 'linear-gradient(180deg, #f6f4fb 0%, #ece8f6 100%)',
    ink: '#2d2440',
    accent: '#7c3aed',
    accentSoft: '#d6c8f5',
    headingFont: '"Noto Sans SC", system-ui, sans-serif',
    paper: '#fefdff',
    stageSolid: '#f1eef9',
    motif: 'plain',
  },
}

const DEFAULT_THEME: ClassroomTheme = {
  stageBg: 'linear-gradient(180deg, #fafaf7 0%, #f2f1ec 100%)',
  ink: '#1c1917',
  accent: '#2563eb',
  accentSoft: '#c3d7fb',
  headingFont: '"Noto Sans SC", system-ui, sans-serif',
  paper: '#ffffff',
  stageSolid: '#f6f5f1',
  motif: 'plain',
}

/** 按学科取主题(模糊匹配: '生物学'→生物, '道德与法治'→默认) */
export function getClassroomTheme(subject?: string): ClassroomTheme {
  if (!subject) return DEFAULT_THEME
  for (const key of Object.keys(THEMES)) {
    if (subject.includes(key)) return THEMES[key]!
  }
  return DEFAULT_THEME
}
