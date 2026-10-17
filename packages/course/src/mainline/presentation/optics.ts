/**
 * optics · 几何光学规则引擎(A-1 typed-content P0,2026-07-27)
 *
 * 架构红线(docs/design-refresh/2026-07-23-typed-content/physics.md §光路图):
 * **渲染器管定律,LLM 管取值。** LLM 只在 opticsScene 槽给原始物理量(物距/焦距/
 * 入射角/折射率),光线路径一律由本文件按反射定律 / Snell 定律 / 薄透镜成像公式
 * 算出——错误光路在架构上不可能被生成,不依赖事后审核。
 *
 * 坐标系:物理坐标,主光轴为 x 轴,y 向上为正,光学元件在 x=0。
 * 渲染端(components/mainline/scene-views/content-forms.tsx)负责映射到 SVG。
 * 缩放方式由 `anglesAreSemantic` 决定:标注角度的场景(折射/棱镜)必须等比,
 * 否则图与标注自相矛盾;标注距离的场景(透镜/平面镜)允许纵向夸张,
 * 这是教材惯例,也避免物距远大于物高时整幅图被压成一条线。
 *
 * 覆盖七种场景(替代写死折射 SVG 的 RefractionSimulation 假通用缺口):
 * 凸/凹透镜成像 · 凸/凹透镜平行光 · 平面镜反射 · 折射(含全反射) · 三棱镜色散。
 */

export type OpticsSceneKind =
  | 'convex-lens'
  | 'concave-lens'
  | 'convex-parallel'
  | 'concave-parallel'
  | 'plane-mirror'
  | 'refraction'
  | 'prism'

const SCENE_KINDS: readonly OpticsSceneKind[] = [
  'convex-lens', 'concave-lens', 'convex-parallel', 'concave-parallel',
  'plane-mirror', 'refraction', 'prism',
]

/**
 * 物距/焦距超过此比值即视为「物在无穷远」——入射光实际平行,成像位置与焦点
 * 之差在图上不可分辨。2026-07-27 真检:生成器为表达「平行光会聚」用 u=999
 * 模拟,原实现照单全收,把透镜/焦点/三条光线压成约 3px,还算出「放大率 0」的
 * 荒谬结论。此处改为升格到平行光场景,而不是画一张看不清的图。
 */
const AT_INFINITY_RATIO = 50

export interface OpticsInput {
  kind: OpticsSceneKind
  /** 原始物理量。凸/凹透镜:u,f,h;平面镜:u,h;折射:n1,n2,theta1;棱镜:n,theta1,apex。 */
  values: Readonly<Record<string, number>>
}

export interface OpticsPoint { x: number; y: number }

/** 线段角色 → 渲染端配色与线型(virtual 一律虚线,是实像/虚像的视觉区分红线)。 */
export type OpticsSegmentRole =
  | 'incident'   // 入射光线
  | 'refracted'  // 折射/出射光线
  | 'reflected'  // 反射光线
  | 'virtual'    // 虚光线(反向延长),必须虚线
  | 'normal'     // 法线,虚线
  | 'object'     // 物(带箭头竖线)
  | 'image'      // 像(实像实线/虚像虚线,由 imageIsVirtual 决定)
  | 'element'    // 光学元件轮廓(透镜/镜面/棱镜)

export interface OpticsSegment {
  from: OpticsPoint
  to: OpticsPoint
  role: OpticsSegmentRole
  /** 色散场景的光谱归属。渲染端据此上红/绿/紫,缺省走 role 配色。 */
  spectrum?: 'red' | 'green' | 'violet'
}

export interface OpticsLabel {
  at: OpticsPoint
  text: string
  /** axis 标记(F/O/2F 等)贴轴排布,其余贴点。 */
  kind: 'axis' | 'point' | 'angle'
}

export interface OpticsSolution {
  kind: OpticsSceneKind
  segments: OpticsSegment[]
  labels: OpticsLabel[]
  /** 求解出的关键量,供测试断言与渲染端标注(不由 LLM 提供)。 */
  solved: Readonly<Record<string, number>>
  /** 一句话结论(如「倒立缩小实像」),渲染端展示,也可与讲稿交叉核对。 */
  verdict: string
  imageIsVirtual: boolean
  /** 建议绘图范围(物理坐标),渲染端据此定缩放。 */
  extent: { xMin: number; xMax: number; yMin: number; yMax: number }
  /**
   * 本场景的**角度是否承载语义**。折射/棱镜标注了具体角度值,屏幕角度必须等于
   * 物理角度,只能等比缩放;透镜/平面镜标注的是距离不是角度(教材本就纵向夸张),
   * 允许 x/y 独立缩放换取可读性——否则物距远大于物高时整幅图被压成一条线。
   * 不变量:凡带 `kind:'angle'` 标签的解,此值必须为 true(有测试锁)。
   */
  anglesAreSemantic: boolean
}

const DEG = Math.PI / 180

/**
 * 解析 opticsScene 槽。首行 `scene|<kind>` 声明场景,其余每行 `键|数值`。
 * 契约与 fill-scenes CONTENT_FORM_RULES 的 physics 光路附加键一致。
 * 行内 `#` 起的注释被丢弃(设计文档示例带注释,生成端可能照抄)。
 */
export function parseOpticsScene(raw: string): OpticsInput | null {
  const lines = raw.split('\n').map(l => l.split('#')[0]!.trim()).filter(Boolean)
  if (lines.length === 0) return null

  let kind: OpticsSceneKind | null = null
  const values: Record<string, number> = {}
  for (const line of lines) {
    const split = line.indexOf('|')
    if (split < 0) continue
    const key = line.slice(0, split).trim().toLowerCase()
    const rest = line.slice(split + 1).trim()
    if (key === 'scene') {
      const candidate = rest.toLowerCase() as OpticsSceneKind
      if (SCENE_KINDS.includes(candidate)) kind = candidate
      continue
    }
    const n = Number(rest)
    if (Number.isFinite(n)) values[key] = n
  }
  return kind ? { kind, values } : null
}

/** 在 x=xEnd 处截断从 origin 出发、方向 dir 的射线;dir.x 为 0 时按 y 截断。 */
function extend(origin: OpticsPoint, dir: OpticsPoint, xEnd: number): OpticsPoint {
  if (Math.abs(dir.x) < 1e-9) return { x: origin.x, y: origin.y + Math.sign(dir.y || 1) * Math.abs(xEnd - origin.x) }
  const t = (xEnd - origin.x) / dir.x
  return { x: xEnd, y: origin.y + dir.y * t }
}

function unit(p: OpticsPoint): OpticsPoint {
  const len = Math.hypot(p.x, p.y) || 1
  return { x: p.x / len, y: p.y / len }
}

function rotate(v: OpticsPoint, rad: number): OpticsPoint {
  const c = Math.cos(rad), s = Math.sin(rad)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c }
}

/** 物(竖直箭头,底在轴上)。 */
function objectSegments(u: number, h: number): OpticsSegment[] {
  return [{ from: { x: -u, y: 0 }, to: { x: -u, y: h }, role: 'object' }]
}

/**
 * 薄透镜成像:1/f = 1/u + 1/v。凹透镜取 f<0。
 * 三条特殊光线全部由本函数按几何算出,不接受外部给定的光线角度。
 */
function solveLens(kind: 'convex-lens' | 'concave-lens', values: Readonly<Record<string, number>>): OpticsSolution | null {
  const u = values.u
  const hRaw = values.h
  const fMag = values.f
  if (!Number.isFinite(u) || !Number.isFinite(fMag) || u! <= 0 || fMag! <= 0) return null
  const h = Number.isFinite(hRaw) && hRaw! > 0 ? hRaw! : 1

  // 物距远大于焦距 = 物在无穷远 = 平行光入射。升格到平行光场景,
  // 而不是画一张透镜被压成几个像素、放大率显示为 0 的图(2026-07-27 真检)。
  if (u! / fMag! >= AT_INFINITY_RATIO) {
    const parallel = solveParallel(kind === 'convex-lens' ? 'convex-parallel' : 'concave-parallel', { f: fMag! })
    if (parallel) {
      return { ...parallel, verdict: `${parallel.verdict}——物距 ${fmt(u!)} 远大于焦距,按平行光处理` }
    }
  }

  const f = kind === 'convex-lens' ? fMag! : -fMag!

  const segments: OpticsSegment[] = []
  const labels: OpticsLabel[] = []
  const objTip: OpticsPoint = { x: -u!, y: h }

  // 透镜本体 + 主光轴 + 焦点标记
  const lensHalf = Math.max(h * 1.5, Math.abs(f) * 0.5)
  segments.push({ from: { x: 0, y: -lensHalf }, to: { x: 0, y: lensHalf }, role: 'element' })
  labels.push({ at: { x: 0, y: 0 }, text: 'O', kind: 'axis' })
  labels.push({ at: { x: fMag!, y: 0 }, text: 'F', kind: 'axis' })
  labels.push({ at: { x: -fMag!, y: 0 }, text: 'F', kind: 'axis' })
  segments.push(...objectSegments(u!, h))

  // v:成像位置。u==f 时平行出射不成像。
  const invV = 1 / f - 1 / u!
  const parallelOut = Math.abs(invV) < 1e-9
  const v = parallelOut ? Number.POSITIVE_INFINITY : 1 / invV
  const m = parallelOut ? Number.NaN : -v / u!
  const hImage = parallelOut ? Number.NaN : m * h
  const isVirtual = !parallelOut && v < 0

  const xMax = parallelOut ? u! * 1.6 : Math.max(Math.abs(v) * 1.25, fMag! * 2.2, u! * 0.6)
  const xMin = -Math.max(u! * 1.15, fMag! * 2.2, isVirtual ? Math.abs(v) * 1.15 : 0)

  // 光线 1:平行主光轴入射 → 凸透镜过后焦点 / 凹透镜反向延长过前焦点
  const hit1: OpticsPoint = { x: 0, y: h }
  segments.push({ from: objTip, to: hit1, role: 'incident' })
  // 光线 2:过光心不偏折
  const hit2: OpticsPoint = { x: 0, y: 0 }
  segments.push({ from: objTip, to: hit2, role: 'incident' })
  // 光线 3:凸透镜过前焦点入射 → 出射平行主光轴(u==f 时该光线退化,跳过)
  const useRay3 = kind === 'convex-lens' && Math.abs(u! - fMag!) > 1e-9
  const y3 = useRay3 ? (-h * fMag!) / (u! - fMag!) : 0
  const hit3: OpticsPoint = { x: 0, y: y3 }
  if (useRay3) segments.push({ from: objTip, to: hit3, role: 'incident' })

  if (parallelOut) {
    // u==f:出射平行,不成像。出射方向由光心光线决定。
    const dir = unit({ x: 0 - objTip.x, y: 0 - objTip.y })
    for (const hit of [hit1, hit2]) {
      segments.push({ from: hit, to: extend(hit, dir, xMax), role: 'refracted' })
    }
    return {
      kind, segments, labels,
      solved: { u: u!, f, v: Number.POSITIVE_INFINITY },
      verdict: '物在焦点上:折射光线平行射出,不成像',
      imageIsVirtual: false,
      extent: { xMin, xMax, yMin: -lensHalf * 1.2, yMax: Math.max(h, lensHalf) * 1.2 },
      anglesAreSemantic: false,
    }
  }

  const imgTip: OpticsPoint = { x: v, y: hImage }
  const hits = useRay3 ? [hit1, hit2, hit3] : [hit1, hit2]
  for (const hit of hits) {
    if (isVirtual) {
      // 虚像:出射光线发散,方向为「从像点指向入射点」;虚线反向延长交于像点
      const dir = unit({ x: hit.x - imgTip.x, y: hit.y - imgTip.y })
      segments.push({ from: hit, to: extend(hit, dir, xMax), role: 'refracted' })
      segments.push({ from: hit, to: imgTip, role: 'virtual' })
    } else {
      // 实像:出射光线实际会聚于像点,并继续延伸
      segments.push({ from: hit, to: imgTip, role: 'refracted' })
      const dir = unit({ x: imgTip.x - hit.x, y: imgTip.y - hit.y })
      segments.push({ from: imgTip, to: extend(imgTip, dir, xMax), role: 'refracted' })
    }
  }
  segments.push({ from: { x: v, y: 0 }, to: imgTip, role: 'image' })

  const upright = hImage > 0
  const size = Math.abs(m) > 1.0001 ? '放大' : Math.abs(m) < 0.9999 ? '缩小' : '等大'
  const verdict = `${upright ? '正立' : '倒立'}${size}${isVirtual ? '虚像' : '实像'}` +
    `(v=${fmt(Math.abs(v))}${isVirtual ? ',与物同侧' : ''},放大率 ${fmt(Math.abs(m))})`

  return {
    kind, segments, labels,
    solved: { u: u!, f, v, magnification: m, imageHeight: hImage },
    verdict,
    imageIsVirtual: isVirtual,
    anglesAreSemantic: false,
    extent: {
      xMin, xMax,
      yMin: -Math.max(lensHalf, Math.abs(hImage)) * 1.2,
      yMax: Math.max(h, lensHalf, Math.abs(hImage)) * 1.2,
    },
  }
}

/**
 * 平行光入射(物在无穷远)——凸透镜「会聚于焦点」/ 凹透镜「发散,反向延长过焦点」。
 * 这是透镜最经典的教学场景,不是成像问题:没有物、没有像距、没有放大率,
 * 只有「平行光被会聚/发散到哪里」。原实现漏了它,导致生成器只能用超大物距硬凑。
 */
function solveParallel(kind: 'convex-parallel' | 'concave-parallel', values: Readonly<Record<string, number>>): OpticsSolution | null {
  const fMag = values.f
  if (!Number.isFinite(fMag) || fMag! <= 0) return null
  const isConvex = kind === 'convex-parallel'
  const spread = Number.isFinite(values.h) && values.h! > 0 ? values.h! : fMag! * 0.55
  const focus: OpticsPoint = { x: isConvex ? fMag! : -fMag!, y: 0 }

  const segments: OpticsSegment[] = []
  const lensHalf = spread * 1.35
  segments.push({ from: { x: 0, y: -lensHalf }, to: { x: 0, y: lensHalf }, role: 'element' })

  const xStart = -fMag! * 1.9
  const xEnd = fMag! * 2.1
  for (const y of [spread, 0, -spread]) {
    const hit: OpticsPoint = { x: 0, y }
    // 入射:平行主光轴
    segments.push({ from: { x: xStart, y }, to: hit, role: 'incident' })
    if (Math.abs(y) < 1e-9) {
      // 沿主光轴的光线不偏折,直穿
      segments.push({ from: hit, to: { x: xEnd, y: 0 }, role: 'refracted' })
      continue
    }
    if (isConvex) {
      // 凸透镜:折射后过后焦点,并继续延伸
      segments.push({ from: hit, to: focus, role: 'refracted' })
      const dir = unit({ x: focus.x - hit.x, y: focus.y - hit.y })
      segments.push({ from: focus, to: extend(focus, dir, xEnd), role: 'refracted' })
    } else {
      // 凹透镜:折射后发散,其反向延长线过前焦点(虚焦点)
      const dir = unit({ x: hit.x - focus.x, y: hit.y - focus.y })
      segments.push({ from: hit, to: extend(hit, dir, xEnd), role: 'refracted' })
      segments.push({ from: hit, to: focus, role: 'virtual' })
    }
  }

  return {
    kind,
    segments,
    labels: [
      { at: { x: 0, y: 0 }, text: 'O', kind: 'axis' },
      { at: focus, text: 'F', kind: 'axis' },
    ],
    solved: { f: isConvex ? fMag! : -fMag!, focusX: focus.x },
    verdict: isConvex
      ? `平行于主光轴的光经凸透镜后会聚于焦点 F(f=${fmt(fMag!)})`
      : `平行于主光轴的光经凹透镜后发散,反向延长线交于虚焦点 F(f=${fmt(fMag!)})`,
    imageIsVirtual: !isConvex,
    extent: { xMin: xStart, xMax: xEnd, yMin: -lensHalf * 1.15, yMax: lensHalf * 1.15 },
    anglesAreSemantic: false,
  }
}

/** 平面镜:像与物关于镜面对称,等大正立虚像。两条光线反射 + 虚线反向延长交于像点。 */
function solvePlaneMirror(values: Readonly<Record<string, number>>): OpticsSolution | null {
  const u = values.u
  if (!Number.isFinite(u) || u! <= 0) return null
  const h = Number.isFinite(values.h) && values.h! > 0 ? values.h! : 1

  const segments: OpticsSegment[] = []
  const objTip: OpticsPoint = { x: -u!, y: h }
  const imgTip: OpticsPoint = { x: u!, y: h }
  const mirrorHalf = Math.max(h * 1.6, u! * 0.5)

  segments.push({ from: { x: 0, y: -mirrorHalf }, to: { x: 0, y: mirrorHalf }, role: 'element' })
  segments.push(...objectSegments(u!, h))
  segments.push({ from: { x: u!, y: 0 }, to: imgTip, role: 'image' })

  // 两条入射光线打在镜面不同高度,反射方向按镜面(竖直)对称:dx → −dx
  for (const yHit of [h * 0.15, -h * 0.55]) {
    const hit: OpticsPoint = { x: 0, y: yHit }
    segments.push({ from: objTip, to: hit, role: 'incident' })
    const din = unit({ x: hit.x - objTip.x, y: hit.y - objTip.y })
    const dref = { x: -din.x, y: din.y }
    segments.push({ from: hit, to: extend(hit, dref, -u! * 1.5), role: 'reflected' })
    segments.push({ from: hit, to: imgTip, role: 'virtual' })
  }

  return {
    kind: 'plane-mirror',
    segments,
    labels: [{ at: { x: 0, y: 0 }, text: '镜面', kind: 'axis' }],
    solved: { u: u!, v: u!, magnification: 1 },
    verdict: `正立等大虚像(像距 ${fmt(u!)} = 物距,像在镜后)`,
    imageIsVirtual: true,
    extent: { xMin: -u! * 1.6, xMax: u! * 1.45, yMin: -mirrorHalf * 1.15, yMax: mirrorHalf * 1.15 },
    anglesAreSemantic: false,
  }
}

/**
 * 折射:界面取水平线 y=0(法线竖直),介质 1 在上、介质 2 在下。
 * Snell:n1·sinθ1 = n2·sinθ2;n1·sinθ1/n2 > 1 判全反射(此时无折射线,只画反射线)。
 */
function solveRefraction(values: Readonly<Record<string, number>>): OpticsSolution | null {
  const n1 = Number.isFinite(values.n1) ? values.n1! : 1
  const n2 = values.n2
  const theta1 = values.theta1
  if (!Number.isFinite(n2) || n2! <= 0 || !Number.isFinite(theta1)) return null
  if (theta1! < 0 || theta1! >= 90) return null

  const t1 = theta1! * DEG
  const sinT2 = (n1 * Math.sin(t1)) / n2!
  const tir = sinT2 > 1
  const t2 = tir ? Number.NaN : Math.asin(sinT2)
  const L = 10

  const segments: OpticsSegment[] = []
  // 界面 + 法线
  segments.push({ from: { x: -L, y: 0 }, to: { x: L, y: 0 }, role: 'element' })
  segments.push({ from: { x: 0, y: L * 0.75 }, to: { x: 0, y: -L * 0.75 }, role: 'normal' })
  // 入射:自左上射向原点,与法线夹角 θ1
  const start: OpticsPoint = { x: -Math.sin(t1) * L, y: Math.cos(t1) * L }
  segments.push({ from: start, to: { x: 0, y: 0 }, role: 'incident' })
  // 反射线始终存在(全反射时是唯一出射)
  segments.push({ from: { x: 0, y: 0 }, to: { x: Math.sin(t1) * L, y: Math.cos(t1) * L }, role: 'reflected' })
  if (!tir) {
    segments.push({ from: { x: 0, y: 0 }, to: { x: Math.sin(t2) * L, y: -Math.cos(t2) * L }, role: 'refracted' })
  }

  const labels: OpticsLabel[] = [
    { at: { x: -L * 0.62, y: L * 0.12 }, text: `n₁=${fmt(n1)}`, kind: 'point' },
    { at: { x: -L * 0.62, y: -L * 0.18 }, text: `n₂=${fmt(n2!)}`, kind: 'point' },
    { at: { x: -Math.sin(t1) * L * 0.32, y: Math.cos(t1) * L * 0.32 }, text: `θ₁=${fmt(theta1!)}°`, kind: 'angle' },
  ]
  if (!tir) {
    labels.push({ at: { x: Math.sin(t2) * L * 0.34, y: -Math.cos(t2) * L * 0.34 }, text: `θ₂=${fmt(t2 / DEG)}°`, kind: 'angle' })
  }

  const critical = n1 > n2! ? Math.asin(n2! / n1) / DEG : Number.NaN
  return {
    kind: 'refraction',
    segments,
    labels,
    solved: { n1, n2: n2!, theta1: theta1!, theta2: tir ? Number.NaN : t2 / DEG, ...(Number.isFinite(critical) ? { criticalAngle: critical } : {}) },
    verdict: tir
      ? `发生全反射(入射角 ${fmt(theta1!)}° > 临界角 ${fmt(critical)}°,光全部返回介质 1)`
      : n1 < n2!
        ? `由光疏入光密:折射角 ${fmt(t2 / DEG)}° < 入射角 ${fmt(theta1!)}°,光线向法线偏折`
        : `由光密入光疏:折射角 ${fmt(t2 / DEG)}° > 入射角 ${fmt(theta1!)}°,光线偏离法线`,
    imageIsVirtual: false,
    extent: { xMin: -L, xMax: L, yMin: -L * 0.8, yMax: L * 0.8 },
    // 折射幕标注了 θ₁/θ₂ 具体数值,屏幕角度必须等于物理角度
    anglesAreSemantic: true,
  }
}

/** 色散:红→紫折射率递增(同一介质对短波长折射更强),偏折角随之增大。 */
const PRISM_COLORS: readonly { name: 'red' | 'green' | 'violet'; dn: number }[] = [
  { name: 'red', dn: -0.008 },
  { name: 'green', dn: 0 },
  { name: 'violet', dn: 0.008 },
]

/**
 * 三棱镜色散:顶角 A 的等腰棱镜,光线经左右两面各折射一次。
 * θ2 = asin(sinθ1/n);θ3 = A − θ2;θ4 = asin(n·sinθ3)。三色取不同 n 产生色散扇。
 * 第二面若 n·sinθ3 > 1 则该色全反射,不出射(如实反映,不伪造出射线)。
 */
function solvePrism(values: Readonly<Record<string, number>>): OpticsSolution | null {
  const nBase = values.n
  const theta1 = values.theta1
  const apex = Number.isFinite(values.apex) ? values.apex! : 60
  if (!Number.isFinite(nBase) || nBase! <= 1 || !Number.isFinite(theta1)) return null
  if (theta1! <= 0 || theta1! >= 90 || apex <= 0 || apex >= 180) return null

  const A = apex * DEG
  const half = A / 2
  const size = 6
  const apexPt: OpticsPoint = { x: 0, y: size * Math.cos(half) }
  const leftDir = { x: -Math.sin(half), y: -Math.cos(half) }
  const rightDir = { x: Math.sin(half), y: -Math.cos(half) }
  const baseL: OpticsPoint = { x: apexPt.x + leftDir.x * size, y: apexPt.y + leftDir.y * size }
  const baseR: OpticsPoint = { x: apexPt.x + rightDir.x * size, y: apexPt.y + rightDir.y * size }

  const segments: OpticsSegment[] = [
    { from: apexPt, to: baseL, role: 'element' },
    { from: apexPt, to: baseR, role: 'element' },
    { from: baseL, to: baseR, role: 'element' },
  ]

  // 入射点取左面中点;左面内法线指向棱镜内部
  const q1: OpticsPoint = { x: (apexPt.x + baseL.x) / 2, y: (apexPt.y + baseL.y) / 2 }
  const nInLeft = unit({ x: Math.cos(half), y: -Math.sin(half) })
  const t1 = theta1! * DEG
  // 入射方向:内法线绕 +θ1 旋转,使光线自左上方入射
  const d1 = rotate(nInLeft, t1)
  segments.push({ from: { x: q1.x - d1.x * size * 0.9, y: q1.y - d1.y * size * 0.9 }, to: q1, role: 'incident' })

  const nOutRight = unit({ x: Math.cos(half), y: Math.sin(half) })
  const solved: Record<string, number> = { n: nBase!, theta1: theta1!, apex }
  let anyExit = false

  for (const color of PRISM_COLORS) {
    const n = nBase! + color.dn
    const t2 = Math.asin(Math.sin(t1) / n)
    const d2 = rotate(nInLeft, t2)
    // 与右面求交:右面过 apexPt,方向 rightDir
    const hit = intersect(q1, d2, apexPt, rightDir)
    if (!hit) continue
    segments.push({ from: q1, to: hit, role: 'refracted', spectrum: color.name })
    const t3 = A - t2
    const sinT4 = n * Math.sin(t3)
    if (sinT4 > 1) continue // 该色全反射,不出射——如实不画
    const t4 = Math.asin(sinT4)
    // 出射光线与内部光线必须位于外法线的**同一侧**——取内部光线相对外法线的
    // 旋向作为出射旋向。写死 +t4 会把光画到法线另一侧(2026-07-27 Codex 复审
    // 抓到:n=1.5/θ1=45/顶角60 时出射被画成 +82.4°,正确是 −22.4°)。
    const side = Math.sign(nOutRight.x * d2.y - nOutRight.y * d2.x) || 1
    const d3 = rotate(nOutRight, side * t4)
    segments.push({ from: hit, to: { x: hit.x + d3.x * size * 1.5, y: hit.y + d3.y * size * 1.5 }, role: 'refracted', spectrum: color.name })
    anyExit = true
    if (color.name === 'green') {
      solved.theta2 = t2 / DEG
      solved.theta4 = t4 / DEG
      solved.deviation = (t1 + t4 - A) / DEG
    }
  }

  return {
    kind: 'prism',
    segments,
    labels: [{ at: apexPt, text: `${fmt(apex)}°`, kind: 'angle' }],
    solved,
    verdict: anyExit
      ? `白光经两次折射分解为彩色光带(紫光偏折最大,红光最小;绿光偏向角 ${fmt(solved.deviation ?? 0)}°)`
      : '在第二面发生全反射,光线未从右面射出',
    imageIsVirtual: false,
    extent: { xMin: -size * 1.5, xMax: size * 2.1, yMin: -size * 0.9, yMax: size * 1.3 },
    anglesAreSemantic: true,
  }
}

/** 射线 p+t·d 与直线 q+s·e 的交点(平行返回 null)。 */
function intersect(p: OpticsPoint, d: OpticsPoint, q: OpticsPoint, e: OpticsPoint): OpticsPoint | null {
  const den = d.x * e.y - d.y * e.x
  if (Math.abs(den) < 1e-9) return null
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den
  if (t <= 0) return null
  return { x: p.x + d.x * t, y: p.y + d.y * t }
}

/** 数值显示:整数不带小数点,否则保留一位。 */
function fmt(n: number): string {
  if (!Number.isFinite(n)) return '—'
  return Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1)
}

/**
 * 物理坐标 → SVG 坐标的投影器。**必须等比缩放**:x/y 独立缩放虽保共线与交点,
 * 却不保角度——折射场景标着 θ₁=45° 却画成 55.7°,图与标注自相矛盾,
 * 而光路图是角度精确级红线(2026-07-27 Codex 复审抓到)。
 * 等比后按实际占用居中,y 轴翻转(物理 y 向上,SVG y 向下)。
 */
export function projectOptics(solution: OpticsSolution, w: number, h: number, pad: number) {
  const { extent } = solution
  const spanX = Math.max(extent.xMax - extent.xMin, 1e-6)
  const spanY = Math.max(extent.yMax - extent.yMin, 1e-6)
  const fitX = (w - pad * 2) / spanX
  const fitY = (h - pad * 2) / spanY
  // 角度承载语义 → 必须等比;否则各轴独立铺满(教材式纵向夸张)
  const [sx, sy] = solution.anglesAreSemantic
    ? [Math.min(fitX, fitY), Math.min(fitX, fitY)]
    : [fitX, fitY]
  const offX = (w - spanX * sx) / 2
  const offY = (h - spanY * sy) / 2
  return (p: OpticsPoint): OpticsPoint => ({
    x: offX + (p.x - extent.xMin) * sx,
    y: h - offY - (p.y - extent.yMin) * sy,
  })
}

/**
 * 渲染端入口:槽原文 → 解。不可解(缺场景声明/取值非法)返回 null,
 * 派发器据此**不进入光路版式**,回退通用板书——绝不画一条算错的光路。
 */
export function opticsSolutionFor(raw: string | undefined): OpticsSolution | null {
  if (!raw) return null
  const input = parseOpticsScene(raw)
  return input ? solveOptics(input) : null
}

/**
 * 主入口:按场景类型分派求解。取值缺失/非法一律返回 null,
 * 渲染端据此回退到通用版式——绝不画一条"看起来像但算错了"的光路。
 */
export function solveOptics(input: OpticsInput): OpticsSolution | null {
  switch (input.kind) {
    case 'convex-lens':
    case 'concave-lens':
      return solveLens(input.kind, input.values)
    case 'convex-parallel':
    case 'concave-parallel':
      return solveParallel(input.kind, input.values)
    case 'plane-mirror':
      return solvePlaneMirror(input.values)
    case 'refraction':
      return solveRefraction(input.values)
    case 'prism':
      return solvePrism(input.values)
    default:
      return null
  }
}
