'use client'

import type { LessonScene, MainlineCourse, ScenePresentation } from '@/lib/mainline'
import { spriteSideOf } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import { forceDiagramLayout } from '@/lib/mainline/presentation/content-aware-layout'
import { functionPlotSegments, type ForceVector, type GeoVertex, parseDialogueScript, parseForceVectors, parseFuncBreakpoints, parseFuncKeyPoints, parseRange, parseTimelineEvents } from '@/lib/mainline/presentation/content-forms'
import { type OpticsSegmentRole, type OpticsSolution, opticsSolutionFor, projectOptics } from '@/lib/mainline/presentation/optics'
import type { GeometryVisual } from '@/lib/mainline/presentation/subject-content'
import { fitType, projectionFontSize, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { cardSurface, MathText, SceneBadge, spritePad } from './shared'

/**
 * content-forms · 学科内容形态专属渲染器(方向二第一批,2026-07-22)
 *
 * 语文诗词 PoemDisplay 此前是全库唯一的学科内容形态专属版面,这里把它推广成
 * 形态家族:历史时间线(timelineEvents)、英语对话剧本(dialogueScript)。
 * 数理化公式不设独立版面——行内 LaTeX 由 MathText 在各母版原位渲染,公式属于
 * 推导/例题的上下文,抽离成独立幕反而破坏教学叙事。
 * 触发条件 = 显式槽键存在(SceneTechniqueView 派发),槽格式契约见
 * lib/mainline/presentation/content-forms.ts。
 */

/** 历史时间线:年代轴竖排,年代做 accent 节点章,事件文本随行——版式随事件数配平。 */
export function TimelineEventsView({ scene, course: _course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const events = parseTimelineEvents(scene.contentSlots.timelineEvents ?? '')
  const dense = events.length > 5
  return (
    <section className={`flex h-full flex-col justify-center gap-7 px-[10%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '时间线'} theme={theme} />
      <h2 style={fitType('heading', scene.visualFocus.length)}>{scene.visualFocus}</h2>
      <div className="relative flex flex-col" style={{ gap: dense ? '14px' : '22px' }}>
        <div aria-hidden className="absolute bottom-2 left-[88px] top-2 w-px" style={{ background: toRgba(theme.ink, 0.28) }} />
        {events.map(item => (
          <div key={`${item.time}-${item.event}`} className="grid grid-cols-[176px_1fr] items-baseline gap-6">
            <span className="justify-self-end rounded-full px-4 py-1 text-right" style={{ ...TYPE_SCALE.caption, background: item.time ? theme.accent : 'transparent', color: item.time ? theme.paper : toRgba(theme.ink, 0.5) }}>
              {item.time || '·'}
            </span>
            <span style={fitType(dense ? 'body' : 'heading', item.event.length)}>{item.event}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

/** 英语对话剧本:双声道气泡流(说话人按出现顺序分左右),原声台词大字、名牌胶囊。 */
export function DialogueScriptView({ scene, course: _course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const surface = cardSurface(theme, pres.pack.surface)
  const turns = parseDialogueScript(scene.contentSlots.dialogueScript ?? '')
  return (
    <section className={`flex h-full flex-col justify-center gap-6 px-[11%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '对话'} theme={theme} />
      <h2 style={fitType('heading', scene.visualFocus.length)}>{scene.visualFocus}</h2>
      <div className="flex flex-col gap-4">
        {turns.map((turn, index) => (
          <div key={`${turn.speaker}-${index}`} className={`flex max-w-[78%] flex-col gap-1 ${turn.side === 1 ? 'items-end self-end' : 'items-start self-start'}`}>
            <span className="rounded-full px-3 py-0.5" style={{ ...TYPE_SCALE.caption, background: turn.side === 1 ? theme.accent : toRgba(theme.ink, 0.12), color: turn.side === 1 ? theme.paper : theme.ink }}>
              {turn.speaker}
            </span>
            <div className="px-6 py-3.5" style={{ background: turn.side === 1 ? toRgba(theme.accent, 0.14) : theme.paper, border: `1px solid ${turn.side === 1 ? toRgba(theme.accent, 0.4) : toRgba(theme.ink, 0.18)}`, borderRadius: surface.borderRadius, boxShadow: surface.boxShadow }}>
              <span style={fitType('body', turn.line.length)}><MathText>{turn.line}</MathText></span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

/** 力角色→配色(白为主:白底 + 物件层彩色力箭头)。缺省回退 accent。 */
const FORCE_COLOR: Record<string, string> = {
  gravity: '#c25d4b', weight: '#c25d4b',
  normal: '#3b4e7e', support: '#3b4e7e',
  friction: '#0e7c7b',
  applied: '#b5872f', pull: '#b5872f', push: '#b5872f', force: '#b5872f',
  tension: '#3f7d63',
  buoyancy: '#2e7fa8',
}

/**
 * 物理受力分析图:标准自由体图——中心物体框 + 从中心辐射的力矢量箭头。
 * 角度以物体右侧水平为 0°、逆时针为正(屏幕 y 向下,故 dy=−sinθ);箭头长度按
 * 力大小归一化(等长兜底);role 映射配色;标签「符号 大小单位」贴箭头尖端外侧。
 * §0.7:受力是"精确矢量"类——大小/方向/角度由 LLM 给定(fact-audit 保准确),
 * 渲染器只精确绘制,不推导。这是理科专属渲染器第一枚(2026-07-23 真检 P0)。
 */
export function ForceDiagramView({ scene, course: _course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  return (
    <section className={`flex h-full flex-col justify-center gap-6 px-[8%] pb-[10%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '受力分析'} theme={theme} />
      <h2 style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <ForceDiagramGraphic scene={scene} theme={theme} />
      </div>
    </section>
  )
}

/** 只绘制受力图本体；作答页通过 forces 传入已按题面裁剪的已知量。 */
export function ForceDiagramGraphic({ scene, theme, width = '100%', forces: providedForces }: {
  scene: LessonScene
  theme: ScenePresentation['palette']
  width?: string
  forces?: readonly (ForceVector & { lengthMagnitude?: string })[]
}) {
  const forces = (providedForces ?? parseForceVectors(scene.contentSlots.forceVectors ?? '')).slice(0, 6)
  const layout = forceDiagramLayout(forces, Number.parseFloat(projectionFontSize('diagram')) || 22)
  const { center, frame } = layout
  const guideInset = Math.min(18, frame.width * 0.04, frame.height * 0.04)
  return (
    <svg
      data-testid="force-diagram-graphic"
      data-layout-rule="force-diagram-content-fit"
      data-force-count={forces.length}
      viewBox={layout.viewBox}
      width={width}
      height="100%"
      preserveAspectRatio="xMidYMid meet"
      style={{ display: 'block', maxWidth: '100%', maxHeight: '100%' }}
    >
      {/* 参考坐标虚线(过物体中心的水平/竖直细线,辅助读角度,不喧宾) */}
      <line x1={frame.x + guideInset} y1={center.y} x2={frame.x + frame.width - guideInset} y2={center.y} stroke={toRgba(theme.ink, 0.12)} strokeWidth="1" strokeDasharray="4 5" />
      <line x1={center.x} y1={frame.y + guideInset} x2={center.x} y2={frame.y + frame.height - guideInset} stroke={toRgba(theme.ink, 0.12)} strokeWidth="1" strokeDasharray="4 5" />
      {/* 中心物体框 */}
      <rect x={center.x - 34} y={center.y - 24} width="68" height="48" rx="7"
        fill={theme.accentSoft} stroke={toRgba(theme.ink, 0.35)} strokeWidth="1.5" />
      {layout.glyphs.map((glyph, i) => {
        const { dx, dy, tx, ty, lx, ly, anchor, displayLabel } = glyph
        const back = 15, half = 8, px = -dy, py = dx
        const color = FORCE_COLOR[glyph.role] ?? theme.accent
        return (
          <g key={`${glyph.label}-${i}`}>
            <line x1={center.x} y1={center.y} x2={tx} y2={ty} stroke={color} strokeWidth="3.5" strokeLinecap="round" />
            <polygon points={`${tx},${ty} ${tx - dx * back + px * half},${ty - dy * back + py * half} ${tx - dx * back - px * half},${ty - dy * back - py * half}`} fill={color} />
            <text x={lx} y={ly + 4} textAnchor={anchor} fill={color} style={{ fontSize: projectionFontSize('diagram'), fontWeight: 700 }}>{displayLabel}</text>
          </g>
        )
      })}
    </svg>
  )
}

/**
 * 函数图像与坐标系:LLM 给采样点(funcPlotPoints)与关键点(funcKeyPoints),渲染端
 * 只画不求值(§0.7 精确矢量类:坐标/刻度必须准,不交给生成位图)。坐标轴过原点(原点在
 * 范围内时)带箭头 + 整数刻度 + 淡网格;连续分支分别连线,断点绝不跨越;关键点描 accent
 * 圆点 + 标签(零点/顶点/交点…)。x 域取 funcDomain,y 域据点列自动配平加边距。
 * 理科专属渲染器第二枚(2026-07-24),沿用受力图同套接入模板。
 */
export function CoordinatePlotView({ scene, course: _course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const dom = parseRange(scene.contentSlots.funcDomain ?? '')
  const segments = functionPlotSegments(
    scene.contentSlots.funcPlotPoints ?? '',
    scene.contentSlots.funcBreakpoints ?? '',
    scene.contentSlots.funcKeyPoints ?? '',
    scene.contentSlots.funcDomain ?? '',
  )
  const pts = segments.flat()
  const allKeys = parseFuncKeyPoints(scene.contentSlots.funcKeyPoints ?? '')
  const keys = dom ? allKeys.filter(point => point.x >= dom[0] && point.x <= dom[1]) : allKeys
  const breakpoints = parseFuncBreakpoints(scene.contentSlots.funcBreakpoints ?? '', scene.contentSlots.funcKeyPoints ?? '')
  const all = [...pts, ...keys]
  const xs = all.map(p => p.x), ys = all.map(p => p.y)
  const xmin = dom ? dom[0] : Math.min(0, ...xs, -1), xmax = dom ? dom[1] : Math.max(0, ...xs, 1)
  let ymin = Math.min(0, ...ys), ymax = Math.max(0, ...ys)
  const yPad = Math.max(1, (ymax - ymin) * 0.12); ymin -= yPad; ymax += yPad
  const W = 640, H = 432, L = 52, R = 28, T = 26, B = 42
  const pw = W - L - R, ph = H - T - B
  const sx = (x: number) => L + ((x - xmin) / (xmax - xmin || 1)) * pw
  const sy = (y: number) => T + ((ymax - y) / (ymax - ymin || 1)) * ph
  const step = (span: number) => Math.max(1, Math.ceil(span / 11))
  const xStep = step(xmax - xmin), yStep = step(ymax - ymin)
  const xTicks: number[] = [], yTicks: number[] = []
  for (let x = Math.ceil(xmin / xStep) * xStep; x <= xmax; x += xStep) xTicks.push(x)
  for (let y = Math.ceil(ymin / yStep) * yStep; y <= ymax; y += yStep) yTicks.push(y)
  const axisY = ymin <= 0 && ymax >= 0 ? sy(0) : H - B   // x 轴屏幕纵坐标
  const axisX = xmin <= 0 && xmax >= 0 ? sx(0) : L       // y 轴屏幕横坐标
  const ink = theme.ink, faint = toRgba(theme.ink, 0.12), tickC = toRgba(theme.ink, 0.5)
  return (
    <section className={`flex h-full flex-col justify-center gap-5 px-[8%] pb-[10%] ${spritePad(sprite)}`} style={{ color: ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '函数图像'} theme={theme} />
      <h2 style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
      {scene.contentSlots.funcExpr ? (
        <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}><MathText>{scene.contentSlots.funcExpr}</MathText></div>
      ) : null}
      <div className="flex min-h-0 flex-1 items-center justify-center">
        {/* 左侧已由核心内容栏承担题面；函数图必须占满其余证据区，不能再以通用 70% 尺寸缩成注脚。 */}
        <svg data-layout-rule="function-plot-evidence" viewBox={`0 0 ${W} ${H}`} width="88%" style={{ display: 'block', maxHeight: '100%' }}>
          {/* 淡网格 */}
          {xTicks.map(x => <line key={`gx${x}`} x1={sx(x)} y1={T} x2={sx(x)} y2={H - B} stroke={faint} strokeWidth="1" />)}
          {yTicks.map(y => <line key={`gy${y}`} x1={L} y1={sy(y)} x2={W - R} y2={sy(y)} stroke={faint} strokeWidth="1" />)}
          {/* 坐标轴 + 箭头 */}
          <line x1={L - 6} y1={axisY} x2={W - R + 8} y2={axisY} stroke={ink} strokeWidth="1.6" />
          <polygon points={`${W - R + 8},${axisY} ${W - R},${axisY - 4} ${W - R},${axisY + 4}`} fill={ink} />
          <line x1={axisX} y1={H - B + 6} x2={axisX} y2={T - 8} stroke={ink} strokeWidth="1.6" />
          <polygon points={`${axisX},${T - 8} ${axisX - 4},${T} ${axisX + 4},${T}`} fill={ink} />
          <text x={axisX - 8} y={axisY + 22} textAnchor="end" fill={tickC} style={{ fontSize: projectionFontSize('diagram') }}>O</text>
          {/* 刻度值 */}
          {xTicks.filter(x => Math.abs(x) > 1e-9).map(x => <text key={`tx${x}`} x={sx(x)} y={axisY + 24} textAnchor="middle" fill={tickC} style={{ fontSize: projectionFontSize('diagram') }}>{x}</text>)}
          {yTicks.filter(y => Math.abs(y) > 1e-9).map(y => <text key={`ty${y}`} x={axisX - 9} y={sy(y) + 7} textAnchor="end" fill={tickC} style={{ fontSize: projectionFontSize('diagram') }}>{y}</text>)}
          {/* 无定义点只标连续分支边界,不把两侧曲线跨断口连接。 */}
          {breakpoints.filter(point => point.x > xmin && point.x < xmax).map(point => (
            <g key={`break-${point.x}`}>
              <line x1={sx(point.x)} y1={T} x2={sx(point.x)} y2={T + 18} stroke={toRgba(theme.ink, 0.42)} strokeWidth="1.4" strokeDasharray="4 3" />
              <text x={sx(point.x) + 8} y={T + 20} fill={tickC} style={{ fontSize: projectionFontSize('diagram'), fontWeight: 600 }}>x={point.x} 不取</text>
            </g>
          ))}
          {/* 每个连续分支独立连线；单点分支仍以实心点呈现。 */}
          {segments.map((segment, index) => segment.length >= 2 ? (
            <polyline
              key={`curve-${index}`}
              points={segment.map(point => `${sx(point.x).toFixed(1)},${sy(point.y).toFixed(1)}`).join(' ')}
              fill="none"
              stroke={theme.accent}
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : segment[0] ? (
            <circle key={`curve-${index}`} cx={sx(segment[0].x)} cy={sy(segment[0].y)} r="3.5" fill={theme.accent} />
          ) : null)}
          {/* 关键点 */}
          {keys.map((k, i) => (
            <g key={`k${i}`}>
              <circle cx={sx(k.x)} cy={sy(k.y)} r="5" fill={theme.paper} stroke="#3b4e7e" strokeWidth="2.5" />
              <text x={sx(k.x) + 10} y={sy(k.y) - 10} fill="#3b4e7e" style={{ fontSize: projectionFontSize('diagram'), fontWeight: 700 }}>{k.label ? `${k.label} ` : ''}({k.x},{k.y})</text>
            </g>
          ))}
        </svg>
      </div>
    </section>
  )
}

/**
 * 几何图形:LLM 给顶点坐标(geoVertices)+ 边(geoEdges)+ 角标(geoAngleLabels)+
 * 辅助线步骤(geoAuxLines),渲染端按坐标映射精确绘制(§0.7 几何=精确矢量,顶点/角度
 * 不容出错)。顶点名标在质心外侧;直角(角标含 90)在顶点画标准直角小方块;辅助线
 * 作图步骤(点名如 D 不在顶点集里,无法几何绘制)以侧栏文字步骤列呈现。
 * 理科专属渲染器第三枚(2026-07-24,同接入模板)。
 */
export function GeometryView({ scene, course: _course, pres, sceneNumber, model }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number; model: GeometryVisual }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const verts = model.vertices
  const byName = new Map(verts.map(v => [v.name, v]))
  const edges = model.edges
  const angles = model.angles
  const aux = (scene.contentSlots.geoAuxLines ?? '').split('→').map(s => s.trim()).filter(Boolean)
  const W = 560, H = 430, PAD = 60
  const xsv = verts.map(v => v.x), ysv = verts.map(v => v.y)
  const xmin = Math.min(...xsv), xmax = Math.max(...xsv), ymin = Math.min(...ysv), ymax = Math.max(...ysv)
  const spanX = xmax - xmin || 1, spanY = ymax - ymin || 1
  const scale = Math.min((W - 2 * PAD) / spanX, (H - 2 * PAD) / spanY)
  const ox = (W - spanX * scale) / 2, oy = (H - spanY * scale) / 2
  const S = (v: GeoVertexLike) => ({ x: ox + (v.x - xmin) * scale, y: H - (oy + (v.y - ymin) * scale) }) // y 翻转(数学上→屏幕下)
  const cxm = xsv.reduce((a, b) => a + b, 0) / (verts.length || 1), cym = ysv.reduce((a, b) => a + b, 0) / (verts.length || 1)
  const rightMark = (v: GeoVertex) => {
    const nb = edges.filter(e => e.includes(v.name)).map(e => byName.get(e[0] === v.name ? e[1] : e[0])!).filter(Boolean).slice(0, 2)
    if (nb.length < 2) return null
    const p = S(v), u = norm(S(nb[0]!), p), w = norm(S(nb[1]!), p), s = 15
    return `${p.x + u.x * s},${p.y + u.y * s} ${p.x + (u.x + w.x) * s},${p.y + (u.y + w.y) * s} ${p.x + w.x * s},${p.y + w.y * s}`
  }
  return (
    <section className={`flex h-full flex-col justify-center gap-5 px-[8%] pb-[10%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '几何图形'} theme={theme} />
      <h2 style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
      <div className="flex min-h-0 flex-1 items-center justify-center gap-6">
        <svg viewBox={`0 0 ${W} ${H}`} width={aux.length ? '58%' : '66%'} style={{ display: 'block', maxHeight: '100%' }}>
          {edges.map(([a, b], i) => {
            const p1 = S(byName.get(a)!), p2 = S(byName.get(b)!)
            return <line key={`e${i}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke={theme.ink} strokeWidth="2.5" strokeLinecap="round" />
          })}
          {angles.filter(a => a.isRight && byName.has(a.vertex)).map((a, i) => {
            const pts = rightMark(byName.get(a.vertex)!)
            return pts ? <polyline key={`r${i}`} points={pts} fill="none" stroke={toRgba(theme.ink, 0.55)} strokeWidth="1.6" /> : null
          })}
          {verts.map(v => {
            const p = S(v)
            const off = norm(p, S({ x: cxm, y: cym }), true) // 由质心指向顶点的外向
            return (
              <g key={`v${v.name}`}>
                <circle cx={p.x} cy={p.y} r="4" fill={theme.accent} />
                <text x={p.x + off.x * 22} y={p.y + off.y * 22 + 7} textAnchor="middle" fill={theme.ink} style={{ fontSize: projectionFontSize('diagram'), fontWeight: 700 }}>{v.name}</text>
              </g>
            )
          })}
          {angles.map((a, i) => {
            const v = byName.get(a.vertex); if (!v) return null
            const p = S(v), off = norm(S({ x: cxm, y: cym }), p, true) // 指向质心(内侧)放角标
            return <text key={`a${i}`} x={p.x + off.x * 38} y={p.y + off.y * 38 + 7} textAnchor="middle" fill={theme.accent} style={{ fontSize: projectionFontSize('diagram'), fontWeight: 600 }}>{a.text}</text>
          })}
        </svg>
        {aux.length ? (
          <div className="flex max-w-[36%] flex-col gap-2.5">
            <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>辅助线作法</div>
            {aux.map((step, i) => (
              <div key={i} className="flex gap-2.5">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: theme.accent, color: theme.paper, fontSize: projectionFontSize('auxiliary') }}>{i + 1}</span>
                <span style={fitType('body', step.length)}><MathText>{step}</MathText></span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

/** 光路线型:入射中性灰 / 反射蓝 / 折射橙(physics.md 方向甲配色),虚光线一律虚线。 */
const OPTICS_STROKE: Record<OpticsSegmentRole, { color: string; width: number; dash?: string }> = {
  incident: { color: '#6b6156', width: 2.6 },
  refracted: { color: '#b5872f', width: 2.8 },
  reflected: { color: '#3b4e7e', width: 2.8 },
  virtual: { color: '#b5872f', width: 1.8, dash: '6 5' },
  normal: { color: '#9a9086', width: 1.4, dash: '5 5' },
  object: { color: '#2f6b52', width: 3.2 },
  image: { color: '#c25d4b', width: 3.2 },
  element: { color: '#3a332c', width: 2 },
}

/** 色散光谱配色:三色必须真的分色,否则「色散」幕画出来是三条同色线。 */
const SPECTRUM_COLOR: Record<'red' | 'green' | 'violet', string> = {
  red: '#c0392b', green: '#2e8b57', violet: '#7d4fb5',
}

/** 圆弧折线(角度标注用)。等比投影下 SVG 角度=物理角度,可直接在屏幕空间采样。 */
function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  let delta = a1 - a0
  while (delta > Math.PI) delta -= 2 * Math.PI
  while (delta < -Math.PI) delta += 2 * Math.PI
  const steps = 14
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = a0 + (delta * i) / steps
    return `${i === 0 ? 'M' : 'L'}${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`
  }).join(' ')
}

/** 屏幕空间方向角(等比投影后可直接用于角度作图)。 */
function dirAngle(from: { x: number; y: number }, to: { x: number; y: number }): number {
  return Math.atan2(to.y - from.y, to.x - from.x)
}

/** 物/像的箭头(竖直矢量端点三角),实像实线、虚像虚线由调用方给 dash。 */
function OpticsArrow({ from, to, color, width, dash }: { from: { x: number; y: number }; to: { x: number; y: number }; color: string; width: number; dash?: string }) {
  const dir = norm(from, to)
  const back = 11, half = 6
  const px = -dir.y, py = dir.x
  return (
    <g>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={width} strokeDasharray={dash} strokeLinecap="round" />
      <polygon points={`${to.x},${to.y} ${to.x - dir.x * back + px * half},${to.y - dir.y * back + py * half} ${to.x - dir.x * back - px * half},${to.y - dir.y * back - py * half}`} fill={color} />
    </g>
  )
}

/**
 * 折射幕的角度作图:法线直角标记 + 入射角/折射角圆弧(physics.md 方向甲
 * 「几何证明作图仪」)。光标了数字不画弧,角度标注就少一半可信度。
 * 等比投影保证屏幕角度=物理角度,可直接在屏幕空间作图。
 */
function RefractionAngleMarks({ solution, project, origin, ink }: {
  solution: OpticsSolution
  project: (p: { x: number; y: number }) => { x: number; y: number }
  origin: { x: number; y: number }
  ink: string
}) {
  const incident = solution.segments.find(s => s.role === 'incident')
  const refracted = solution.segments.find(s => s.role === 'refracted')
  const upArm = dirAngle(origin, project({ x: 0, y: 1 }))
  const downArm = dirAngle(origin, project({ x: 0, y: -1 }))
  const rightArm = dirAngle(origin, project({ x: 1, y: 0 }))
  const mark = 13
  const stroke = toRgba(ink, 0.5)
  return (
    <g fill="none" stroke={stroke} strokeWidth="1.3">
      {/* 法线⊥界面的直角标记 */}
      <path d={
        `M${origin.x + Math.cos(rightArm) * mark},${origin.y + Math.sin(rightArm) * mark}` +
        ` L${origin.x + Math.cos(rightArm) * mark + Math.cos(upArm) * mark},${origin.y + Math.sin(rightArm) * mark + Math.sin(upArm) * mark}` +
        ` L${origin.x + Math.cos(upArm) * mark},${origin.y + Math.sin(upArm) * mark}`
      } />
      {incident && <path d={arcPath(origin.x, origin.y, 40, upArm, dirAngle(origin, project(incident.from)))} />}
      {refracted && <path d={arcPath(origin.x, origin.y, 54, downArm, dirAngle(origin, project(refracted.to)))} />}
    </g>
  )
}

/**
 * 几何光学光路图(A-1 typed-content P0,2026-07-27)。
 *
 * 与受力/函数图像的关键差别:**这里渲染器算定律,不只是画给定数据**。
 * LLM 在 opticsScene 槽只给原始物理量(物距/焦距/入射角/折射率),
 * 光线路径由 lib/mainline/presentation/optics.ts 按薄透镜成像公式 /
 * 反射定律 / Snell 定律算出——错误光路在架构上不可能被生成。
 * 覆盖凸透镜/凹透镜/平面镜/折射/棱镜五种场景,替代此前写死折射 SVG 的
 * RefractionSimulation「假通用」缺口(physics.md §光路图)。
 * 不可解时派发器不进入本版式(opticsSolutionFor 返回 null),回退通用板书。
 */
export function OpticsDiagramView({ scene, course: _course, pres, sceneNumber }: { scene: LessonScene; course: MainlineCourse; pres: ScenePresentation; sceneNumber: number }) {
  const theme = pres.palette
  const sprite = spriteSideOf(scene)
  const solution = opticsSolutionFor(scene.contentSlots.opticsScene)
  if (!solution) return null

  const W = 640, H = 380, PAD = 34
  // 等比投影:角度必须与标注一致(见 projectOptics 注释)
  const project = projectOptics(solution, W, H, PAD)
  const hasAxis = solution.kind !== 'refraction' && solution.kind !== 'prism'
  const origin = project({ x: 0, y: 0 })

  return (
    <section className={`flex h-full flex-col justify-center gap-5 px-[8%] pb-[9%] ${spritePad(sprite)}`} style={{ color: theme.ink }}>
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '光路图'} theme={theme} />
      <h2 style={fitType('heading', scene.visualFocus.length)}><MathText>{scene.visualFocus}</MathText></h2>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <svg viewBox={`0 0 ${W} ${H}`} width="80%" style={{ display: 'block', maxHeight: '100%' }}>
          {hasAxis && (
            <line
              x1={PAD * 0.5} y1={project({ x: 0, y: 0 }).y} x2={W - PAD * 0.5} y2={project({ x: 0, y: 0 }).y}
              stroke={toRgba(theme.ink, 0.22)} strokeWidth="1" strokeDasharray="6 6"
            />
          )}
          {solution.segments.map((seg, i) => {
            const a = project(seg.from), b = project(seg.to)
            const style = OPTICS_STROKE[seg.role]
            if (seg.role === 'object' || seg.role === 'image') {
              // 虚像用虚线箭头——实像/虚像的线型区分是教学红线,不是装饰
              const isVirtualImage = seg.role === 'image' && solution.imageIsVirtual
              return <OpticsArrow key={i} from={a} to={b} color={style.color} width={style.width} {...(isVirtualImage ? { dash: '6 5' } : {})} />
            }
            // 色散三色必须真的分色,否则「色散」幕是三条同色线
            const stroke = seg.spectrum ? SPECTRUM_COLOR[seg.spectrum] : style.color
            return (
              <line
                key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                stroke={stroke} strokeWidth={style.width} strokeDasharray={style.dash} strokeLinecap="round"
              />
            )
          })}
          {solution.kind === 'refraction' && <RefractionAngleMarks solution={solution} project={project} origin={origin} ink={theme.ink} />}
          {solution.labels.map((label, i) => {
            const p = project(label.at)
            return (
              <g key={`l-${i}`}>
                {label.kind === 'axis' && <circle cx={p.x} cy={p.y} r="3.2" fill={toRgba(theme.ink, 0.55)} />}
                <text
                  x={p.x} y={label.kind === 'axis' ? p.y + 20 : p.y - 7} textAnchor="middle"
                  fill={toRgba(theme.ink, 0.72)} style={{ fontSize: projectionFontSize('diagram'), fontWeight: 600 }}
                >
                  {label.text}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
      {/* 结论由引擎算出(非 LLM 断言),与图必然一致 */}
      <p className="self-center rounded-full px-5 py-1.5" style={{ ...TYPE_SCALE.caption, background: toRgba(theme.ink, 0.06), color: toRgba(theme.ink, 0.78) }}>
        {solution.verdict}
      </p>
    </section>
  )
}

interface GeoVertexLike { x: number; y: number }
/** 单位向量 from→to(屏幕坐标);flip=true 反向。用于顶点名外侧偏移与角标内侧偏移。 */
function norm(from: { x: number; y: number }, to: { x: number; y: number }, flip = false): { x: number; y: number } {
  let dx = to.x - from.x, dy = to.y - from.y
  const d = Math.hypot(dx, dy) || 1
  dx /= d; dy /= d
  return flip ? { x: -dx, y: -dy } : { x: dx, y: dy }
}
