/**
 * content-forms · 学科内容形态的结构化槽解析(方向二第一批,2026-07-22)
 *
 * 槽格式由 fill-scenes 的 CONTENT_FORM_RULES 与本文件共同约定(生成端写、
 * 渲染端读,单一格式两处注释互指)。解析器是纯函数,渲染组件
 * (components/mainline/scene-views/content-forms.tsx)只管排版。
 * 铁律:触发靠显式槽键(timelineEvents/dialogueScript),禁按内容正则猜测类型。
 */

export interface TimelineEvent {
  /** 年代原文(如「220」「公元前 221」「1949」),不做数值化——历史年代格式多样。 */
  time: string
  event: string
}

/** 「年代|事件短句」每行一条;竖线缺失的行整行当事件、年代留空(容错不丢内容)。 */
export function parseTimelineEvents(raw: string): TimelineEvent[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const split = line.indexOf('|')
      if (split < 0) return { time: '', event: line }
      return { time: line.slice(0, split).trim(), event: line.slice(split + 1).trim() }
    })
    .filter(item => item.event.length > 0)
}

export interface ForceVector {
  /** 力的标签(如「mg」「F」「重力」),渲染在箭头旁。 */
  label: string
  /** 力的类型/中文名(如「重力」「支持力」),标签副文本。 */
  type: string
  /** 大小原文(如「50」;未知留空,用于长度归一化,非数值时按等长兜底)。 */
  magnitude: string
  unit: string
  /** 方向角:以物体右侧水平为 0°,逆时针为正(与 fill-scenes 生成约定一致)。 */
  angle: number
  /** 颜色角色:gravity/normal/friction/applied/tension/other,渲染端映射配色。 */
  role: string
}

/**
 * 「标签|类型|大小|单位|角度|颜色角色」每行一个力矢量。角度右 0° 逆时针为正。
 * 缺列容错(尾列缺失取兜底);角度非数值按 0 处理;role 缺失回退用 type。
 * 契约与 fill-scenes CONTENT_FORM_RULES.physics 的受力附加键格式一致。
 */
export function parseForceVectors(raw: string): ForceVector[] {
  return raw
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const p = line.split('|').map(s => s.trim())
      const angle = Number(p[4])
      return {
        label: p[0] ?? '',
        type: p[1] ?? '',
        magnitude: p[2] ?? '',
        unit: p[3] ?? '',
        angle: Number.isFinite(angle) ? angle : 0,
        role: (p[5] || p[1] || 'other').toLowerCase(),
      }
    })
    .filter(v => v.label.length > 0)
}

export interface CoordPoint { x: number; y: number }
export interface FuncKeyPoint extends CoordPoint { label: string }
export interface FuncBreakpoint { x: number; label: string }

/** 采样点串「x,y x,y …」(空白/换行/分号分隔的坐标对)→ 有序点列;非数值对丢弃。 */
export function parseCoordPairs(raw: string): CoordPoint[] {
  return raw
    .split(/[\s;]+/)
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => {
      const [xs, ys] = t.replace(/[()]/g, '').split(',')
      return { x: Number(xs), y: Number(ys) }
    })
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
}

/**
 * 函数曲线连续分支用 `|` 分隔。每一支仍使用原有「x,y x,y …」格式，旧数据没有
 * 分隔符时自然退化为单支，避免把受力图等其他槽位的竖线格式带进来。
 */
export function parseCoordSegments(raw: string): CoordPoint[][] {
  return raw
    .split('|')
    .map(parseCoordPairs)
    .filter(segment => segment.length > 0)
}

/**
 * 新格式 `funcBreakpoints` 使用「x=1;x=-2」；同时兼容旧课把
 * 「无定义断点:(1,不存在)」塞进 funcKeyPoints 的写法。
 */
export function parseFuncBreakpoints(raw: string, legacyKeyPoints = ''): FuncBreakpoint[] {
  const direct = raw
    .split(';')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const match = /x\s*=\s*(-?(?:\d+(?:\.\d*)?|\.\d+))/i.exec(item)
      return match ? { x: Number(match[1]), label: item } : null
    })
    .filter((item): item is FuncBreakpoint => item !== null && Number.isFinite(item.x))

  const legacy = legacyKeyPoints
    .split(';')
    .map(item => item.trim())
    .filter(item => /(无定义|断点|间断|不连续|渐近)/.test(item))
    .map(item => {
      const match = /[（(]\s*(-?(?:\d+(?:\.\d*)?|\.\d+))\s*[,，]/.exec(item)
      return match ? { x: Number(match[1]), label: item.split(/[:：]/)[0]?.trim() || '无定义点' } : null
    })
    .filter((item): item is FuncBreakpoint => item !== null && Number.isFinite(item.x))

  const seen = new Set<number>()
  return [...direct, ...legacy].filter(item => {
    if (seen.has(item.x)) return false
    seen.add(item.x)
    return true
  })
}

/**
 * 给渲染器的安全曲线分支。函数图按 x 递增绘制；定义域外采样点会被忽略；显式断点
 * 以及旧数据里的无定义点都会切断折线，绝不允许曲线跨断口连接。
 */
export function functionPlotSegments(
  rawPoints: string,
  rawBreakpoints = '',
  legacyKeyPoints = '',
  rawDomain = '',
): CoordPoint[][] {
  const domain = parseRange(rawDomain)
  const breakXs = parseFuncBreakpoints(rawBreakpoints, legacyKeyPoints).map(item => item.x)
  const atBreak = (x: number) => breakXs.some(value => Math.abs(value - x) < 1e-9)
  const crossesBreak = (left: number, right: number) => breakXs.some(value => left < value && value < right)
  const result: CoordPoint[][] = []

  for (const rawSegment of parseCoordSegments(rawPoints)) {
    const sorted = [...rawSegment]
      .filter(point => !domain || (point.x >= domain[0] && point.x <= domain[1]))
      .sort((a, b) => a.x - b.x)
      .filter((point, index, points) => index === 0 || Math.abs(point.x - points[index - 1]!.x) > 1e-9)
    let current: CoordPoint[] = []

    for (const point of sorted) {
      if (atBreak(point.x)) {
        if (current.length > 0) result.push(current)
        current = []
        continue
      }
      const previous = current[current.length - 1]
      if (previous && crossesBreak(previous.x, point.x)) {
        result.push(current)
        current = []
      }
      current.push(point)
    }
    if (current.length > 0) result.push(current)
  }

  return result
}

function coordinateNumber(value: number): string {
  return String(Object.is(value, -0) ? 0 : value)
}

function hasConflictingDuplicateX(segments: readonly CoordPoint[][]): boolean {
  return segments.some(segment => {
    const valuesByX = new Map<number, number>()
    for (const point of segment) {
      const previous = valuesByX.get(point.x)
      if (previous !== undefined && Math.abs(previous - point.y) > 1e-9) return true
      valuesByX.set(point.x, point.y)
    }
    return false
  })
}

/**
 * 模型输出进入课程前的保守规范化。只修正不改变数学含义的格式问题：定义域过滤、
 * 分支内按 x 排序、完全重复点去重、断点删除与分支切开。若同一 x 给出互相冲突的
 * y，则保持原值交给质量闸门阻断，不能任选一个答案掩盖数学矛盾。
 */
export function normalizeFunctionPlotSlots(slots: Record<string, string>): Record<string, string> {
  const rawPoints = slots.funcPlotPoints ?? ''
  if (!rawPoints.trim()) return slots

  const rawSegments = parseCoordSegments(rawPoints)
  if (rawSegments.length === 0 || hasConflictingDuplicateX(rawSegments)) return slots

  const segments = functionPlotSegments(
    rawPoints,
    slots.funcBreakpoints ?? '',
    slots.funcKeyPoints ?? '',
    slots.funcDomain ?? '',
  )
  if (segments.length === 0) return slots

  const funcPlotPoints = segments
    .map(segment => segment.map(point => `${coordinateNumber(point.x)},${coordinateNumber(point.y)}`).join(' '))
    .join(' | ')
  const breakpoints = parseFuncBreakpoints(slots.funcBreakpoints ?? '', slots.funcKeyPoints ?? '')
  const funcBreakpoints = breakpoints.map(point => `x=${coordinateNumber(point.x)}`).join(';')

  if (funcPlotPoints === rawPoints.trim()
    && (!funcBreakpoints || funcBreakpoints === (slots.funcBreakpoints ?? '').trim())) return slots
  return {
    ...slots,
    funcPlotPoints,
    ...(funcBreakpoints ? { funcBreakpoints } : {}),
  }
}

export type FunctionPlotProblemCode =
  | 'missing-expression'
  | 'invalid-domain'
  | 'insufficient-points'
  | 'unordered-points'
  | 'point-outside-domain'
  | 'point-on-breakpoint'
  | 'point-off-curve'
  | 'missing-rational-breakpoint'

export interface FunctionPlotContractProblem {
  code: FunctionPlotProblemCode
  message: string
}

const RATIONAL_X_DENOMINATOR = /\\(?:d?frac)\s*\{[^{}]*\}\s*\{[^{}]*x[^{}]*\}/i

function numericToken(raw: string | undefined, implicit = 0): number | null {
  if (raw === undefined || raw === '') return implicit
  if (raw === '+') return 1
  if (raw === '-') return -1
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * 保守求值器：只识别渲染契约当前最常见的一次函数和 a/(x+b) 型分式函数。
 * 识别不了就返回 null，不对任意 LaTeX 做猜测，也不使用 eval。
 */
export function functionValueAt(rawExpression: string, x: number): number | null {
  let expression = rawExpression
    .replace(/^\s*\\\(|\\\)\s*$/g, '')
    .replace(/^\s*y\s*=\s*/i, '')
    .replace(/\\left|\\right/g, '')
    .replace(/\s+/g, '')

  const reciprocal = /^\\(?:d?frac)\{([+-]?(?:\d+(?:\.\d*)?|\.\d+))\}\{x([+-](?:\d+(?:\.\d*)?|\.\d+))?\}$/.exec(expression)
  if (reciprocal) {
    const numerator = Number(reciprocal[1])
    const offset = Number(reciprocal[2] ?? 0)
    const denominator = x + offset
    return Math.abs(denominator) < 1e-12 ? null : numerator / denominator
  }

  expression = expression.replace(
    /\\(?:d?frac)\{([+-]?(?:\d+(?:\.\d*)?|\.\d+))\}\{(\d+(?:\.\d*)?|\.\d+)\}/g,
    (_, numerator: string, denominator: string) => String(Number(numerator) / Number(denominator)),
  )
  const linear = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)?)x([+-](?:\d+(?:\.\d*)?|\.\d+))?$/.exec(expression)
  if (!linear) return null
  const slope = numericToken(linear[1], 1)
  const intercept = numericToken(linear[2], 0)
  return slope === null || intercept === null ? null : slope * x + intercept
}

/** 发布前的函数图数据检查。只验证渲染契约，不尝试在浏览器里解释任意 LaTeX。 */
export function functionPlotContractProblems(slots: Record<string, string>): FunctionPlotContractProblem[] {
  const rawPoints = slots.funcPlotPoints ?? ''
  if (!rawPoints.trim()) return []

  const problems: FunctionPlotContractProblem[] = []
  const rawSegments = parseCoordSegments(rawPoints)
  const points = rawSegments.flat()
  const domain = parseRange(slots.funcDomain ?? '')
  const breakpoints = parseFuncBreakpoints(slots.funcBreakpoints ?? '', slots.funcKeyPoints ?? '')
  const drawableSegments = functionPlotSegments(
    rawPoints,
    slots.funcBreakpoints ?? '',
    slots.funcKeyPoints ?? '',
    slots.funcDomain ?? '',
  )

  if (!slots.funcExpr?.trim()) {
    problems.push({ code: 'missing-expression', message: '函数图缺少函数表达式。' })
  }
  if (!domain) {
    problems.push({ code: 'invalid-domain', message: '函数图定义域缺失或格式无效。' })
  }
  if (drawableSegments.length === 0 || drawableSegments.some(segment => segment.length < 2)) {
    problems.push({ code: 'insufficient-points', message: '函数图每个连续分支都必须至少有两个可绘制点。' })
  }
  if (rawSegments.some(segment => segment.some((point, index) => index > 0 && point.x <= segment[index - 1]!.x))) {
    problems.push({ code: 'unordered-points', message: '函数图采样点没有按横坐标严格递增排列。' })
  }
  if (domain && points.some(point => point.x < domain[0] || point.x > domain[1])) {
    problems.push({ code: 'point-outside-domain', message: '函数图采样点超出声明的定义域。' })
  }
  if (points.some(point => breakpoints.some(breakpoint => Math.abs(point.x - breakpoint.x) < 1e-9))) {
    problems.push({ code: 'point-on-breakpoint', message: '函数图把无定义点写进了采样点。' })
  }
  const plottedPoints = [...points, ...parseFuncKeyPoints(slots.funcKeyPoints ?? '')]
  if (plottedPoints.some(point => {
    const expected = functionValueAt(slots.funcExpr ?? '', point.x)
    if (expected === null || !Number.isFinite(expected)) return false
    const tolerance = Math.max(0.005, Math.abs(expected) * 0.005)
    return Math.abs(point.y - expected) > tolerance
  })) {
    problems.push({ code: 'point-off-curve', message: '函数图采样点或关键点与函数表达式不一致。' })
  }
  if (RATIONAL_X_DENOMINATOR.test(slots.funcExpr ?? '') && breakpoints.length === 0) {
    problems.push({ code: 'missing-rational-breakpoint', message: '分母含 x 的函数图没有声明无定义点或连续分支边界。' })
  }

  return problems
}

/** 关键点串「类型:(x,y);…」→ {label,x,y};坐标非数值丢弃(如渐近线 x=2 这类无点坐标者略过)。 */
export function parseFuncKeyPoints(raw: string): FuncKeyPoint[] {
  return raw
    .split(';')
    .map(t => t.trim())
    .filter(Boolean)
    .map(seg => {
      const c = seg.indexOf(':')
      const label = c >= 0 ? seg.slice(0, c).trim() : ''
      const coord = (c >= 0 ? seg.slice(c + 1) : seg).replace(/[()（）]/g, '').trim()
      const [xs, ys] = coord.split(',')
      return { label, x: Number(xs), y: Number(ys) }
    })
    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
}

/** 「min,max」→ [min,max];缺任一端或非数值返回 null(渲染端据点列兜底)。 */
export function parseRange(raw: string): [number, number] | null {
  const parts = raw.split(',').map(s => Number(s.trim()))
  const a = parts[0], b = parts[1]
  return a !== undefined && b !== undefined && Number.isFinite(a) && Number.isFinite(b) && a < b ? [a, b] : null
}

export interface GeoVertex { name: string; x: number; y: number }
export interface GeoAngle { vertex: string; text: string; isRight: boolean }

/** 顶点串「A(0,0);B(4,0);C(4,3)」→ {name,x,y}[];坐标非数值/格式错的丢弃。 */
export function parseGeoVertices(raw: string): GeoVertex[] {
  return raw
    .split(';')
    .map(t => t.trim())
    .filter(Boolean)
    .map(seg => {
      const m = /^([A-Za-z][A-Za-z0-9']*)\s*[（(]\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*[）)]$/.exec(seg)
      return m ? { name: m[1]!, x: Number(m[2]), y: Number(m[3]) } : null
    })
    .filter((v): v is GeoVertex => v !== null && Number.isFinite(v.x) && Number.isFinite(v.y))
}

/** 边串「AB;BC;CA」→ 顶点名对;每段取前后两个字母(顶点名单字母约定)。 */
export function parseGeoEdges(raw: string): [string, string][] {
  return raw
    .split(';')
    .map(t => t.trim())
    .filter(t => t.length >= 2)
    .map(t => [t[0]!, t[t.length - 1]!] as [string, string])
}

/** 角标串「∠ABC=90°;∠BAC=37°」→ {vertex(中间字母),text(整条),isRight(含90)}。 */
export function parseGeoAngles(raw: string): GeoAngle[] {
  return raw
    .split(';')
    .map(t => t.trim())
    .filter(Boolean)
    .map(seg => {
      const m = /[∠<]?\s*[A-Za-z]([A-Za-z])[A-Za-z]\s*=\s*(.+)/.exec(seg)
      if (!m) return null
      return { vertex: m[1]!, text: seg.replace(/^[∠<]\s*/, '∠'), isRight: /\b90\b|90\s*°/.test(m[2]!) }
    })
    .filter((a): a is GeoAngle => a !== null)
}

export interface DialogueTurn {
  speaker: string
  line: string
  /** 台词按说话人出现顺序分配声道(0 左 / 1 右),第三人起复用其首次声道。 */
  side: 0 | 1
}

/** 「说话人: 台词」每行一句;无冒号的行归入上一位说话人(长台词换行容错)。 */
export function parseDialogueScript(raw: string): DialogueTurn[] {
  const turns: DialogueTurn[] = []
  const sideOf = new Map<string, 0 | 1>()
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const match = /^([A-Za-z][\w .'-]{0,24})\s*[:：]\s*(.+)$/.exec(line)
    if (!match) {
      const prev = turns[turns.length - 1]
      if (prev) prev.line += ` ${line}`
      continue
    }
    const speaker = match[1]!.trim()
    if (!sideOf.has(speaker)) sideOf.set(speaker, (sideOf.size % 2) as 0 | 1)
    turns.push({ speaker, line: match[2]!.trim(), side: sideOf.get(speaker)! })
  }
  return turns
}
