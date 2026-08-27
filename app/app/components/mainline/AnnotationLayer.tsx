'use client'

import { getStroke } from 'perfect-freehand'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { ChromeColors } from '@/lib/mainline'

/**
 * AnnotationLayer · 教师舞台批注层(自研,受 tldraw 架构启发,零代码移植)
 *
 * 学 tldraw 三思路、全部自研:① 屏↔页坐标——舞台固定 1920×1080(只 fit 缩放、无
 * pan/zoom),按 SVG getBoundingClientRect 线性映射即可,不需 camera 矩阵;② shape 即
 * 数据——每个标注是一条记录(自由笔迹/箭头/矩形/文字),渲染=把记录画成 SVG;③ tool
 * 状态——pen/highlighter/eraser/arrow/rect/text 是最小工具状态机;④ 撤销是快照栈
 * (变更前压前像,擦除/清除同样可撤回),每幕上限 50 步。
 * 压感笔迹用 perfect-freehand(MIT,唯一引入的授权干净"必要资源");文字编辑用 SVG 外
 * HTML textarea 叠层(foreignObject 内焦点在 Chromium 不可靠),已提交文字回落 SVG <text>
 * 显示,textarea 定位在 1920×1080 缩放空间内随舞台缩放。除 perfect-freehand 外全本仓自有。
 */

export type AnnoTool = 'pen' | 'highlighter' | 'eraser' | 'arrow' | 'rect' | 'text'
interface Pt { x: number; y: number; p?: number }
type Item =
  | { id: string; kind: 'free'; tool: 'pen' | 'highlighter'; color: string; points: Pt[] }
  | { id: string; kind: 'arrow'; color: string; a: Pt; b: Pt }
  | { id: string; kind: 'rect'; color: string; a: Pt; b: Pt }
  | { id: string; kind: 'text'; color: string; at: Pt; text: string }

const COLORS = ['#e5484d', '#2563c9', '#16a34a', '#eab308', '#16181d', '#ffffff']
const HL_W = 26, ERASE_R = 26, TEXT_SIZE = 30

export function useAnnotations() {
  const [on, setOn] = useState(false)
  const [tool, setTool] = useState<AnnoTool>('pen')
  const [color, setColor] = useState(COLORS[0]!)
  const [bySceneId, setBySceneId] = useState<Record<string, Item[]>>({})
  const idRef = useRef(0)
  const nextId = useCallback(() => `a${idRef.current++}`, [])
  // 快照式撤销:每次变更前压入前像,撤销=整体回滚——橡皮擦除、清除也能撤回。
  // liveRef 让渲染间隙的连续变更(橡皮拖动一帧多次)拿到最新值,不吃 setState 过期闭包。
  const liveRef = useRef(bySceneId)
  liveRef.current = bySceneId
  const histRef = useRef<Record<string, Item[][]>>({})
  const apply = useCallback((sceneId: string, fn: (prev: Item[]) => Item[], snapshot = true) => {
    const prev = liveRef.current[sceneId] ?? []
    const next = fn(prev)
    if (next === prev || (next.length === prev.length && next.every((x, i) => x === prev[i]))) return
    if (snapshot) {
      const h = histRef.current[sceneId] ??= []
      h.push(prev)
      if (h.length > 50) h.shift()
    }
    liveRef.current = { ...liveRef.current, [sceneId]: next }
    setBySceneId(liveRef.current)
  }, [])
  const undo = useCallback((sceneId: string) => {
    const prev = histRef.current[sceneId]?.pop()
    if (!prev) return
    liveRef.current = { ...liveRef.current, [sceneId]: prev }
    setBySceneId(liveRef.current)
  }, [])
  return { on, setOn, tool, setTool, color, setColor, bySceneId, nextId, apply, undo }
}
export type AnnotationState = ReturnType<typeof useAnnotations>

/* ── 几何/路径工具(自研) ── */
/** perfect-freehand 轮廓点 → 闭合填充路径(经中点的二次贝塞尔)。 */
function pfPath(pts: number[][]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0]![0]!.toFixed(1)} ${pts[0]![1]!.toFixed(1)} Q`
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i]!, [x1, y1] = pts[(i + 1) % pts.length]!
    d += ` ${x0!.toFixed(1)} ${y0!.toFixed(1)} ${((x0! + x1!) / 2).toFixed(1)} ${((y0! + y1!) / 2).toFixed(1)}`
  }
  return d + ' Z'
}
/** 荧光笔用等宽平滑路径(不填充,宽+半透明+multiply)。 */
function smoothPath(pts: Pt[]): string {
  if (pts.length < 2) return pts.length ? `M${pts[0]!.x},${pts[0]!.y} l0.1,0.1` : ''
  let d = `M${pts[0]!.x},${pts[0]!.y}`
  for (let i = 1; i < pts.length - 1; i++) d += ` Q${pts[i]!.x},${pts[i]!.y} ${(pts[i]!.x + pts[i + 1]!.x) / 2},${(pts[i]!.y + pts[i + 1]!.y) / 2}`
  const last = pts[pts.length - 1]!
  return d + ` L${last.x},${last.y}`
}
function penOutline(points: Pt[]): string {
  return pfPath(getStroke(points.map(p => [p.x, p.y, p.p ?? 0.5]), { size: 10, thinning: 0.6, smoothing: 0.5, streamline: 0.5, simulatePressure: true }) as number[][])
}
function distToSeg(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy
  const t = l2 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / l2)) : 0
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}
/** 粗估一行文字宽度:CJK 按全宽、其余按 0.55em。 */
function textWidth(line: string): number {
  let w = 0
  for (const ch of line) w += ch.charCodeAt(0) > 0x2e7f ? 1 : 0.55
  return w * TEXT_SIZE
}
function itemHit(it: Item, p: Pt): boolean {
  if (it.kind === 'free') return it.points.some((pt, i) => i > 0 && distToSeg(p.x, p.y, it.points[i - 1]!, pt) < ERASE_R)
  if (it.kind === 'arrow') return distToSeg(p.x, p.y, it.a, it.b) < ERASE_R
  if (it.kind === 'rect') {
    const c = [it.a, { x: it.b.x, y: it.a.y }, it.b, { x: it.a.x, y: it.b.y }]
    return c.some((v, i) => distToSeg(p.x, p.y, v, c[(i + 1) % 4]!) < ERASE_R)
  }
  const lines = it.text.split('\n')
  const w = Math.max(TEXT_SIZE, ...lines.map(textWidth))
  const h = lines.length * TEXT_SIZE * 1.3
  return p.x > it.at.x - ERASE_R && p.x < it.at.x + w + ERASE_R
    && p.y > it.at.y - TEXT_SIZE - ERASE_R && p.y < it.at.y - TEXT_SIZE + h + ERASE_R
}

/** 舞台内画布层(inset-0,1920×1080)。仅 on 时吃指针,否则穿透。 */
export function AnnotationCanvas({ state, sceneId }: { state: AnnotationState; sceneId: string }) {
  const { on, tool, color, bySceneId, nextId, apply } = state
  const svgRef = useRef<SVGSVGElement>(null)
  const draft = useRef<Item | null>(null)
  const [, force] = useState(0)
  const [editing, setEditing] = useState<string | null>(null)
  const editRef = useRef<HTMLTextAreaElement>(null)
  const cancelRef = useRef(false)
  const pathCache = useRef(new Map<string, string>())
  useEffect(() => { if (editing) { const el = editRef.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } } }, [editing])
  const items = bySceneId[sceneId] ?? []

  // 编辑中切幕时 textarea 随卸载消失且不触发 onBlur——清掉各幕遗留的空文字项(不进撤销栈)。
  const bySceneRef = useRef(bySceneId)
  bySceneRef.current = bySceneId
  useEffect(() => {
    setEditing(null)
    for (const k of Object.keys(bySceneRef.current)) apply(k, prev => prev.filter(it => !(it.kind === 'text' && !it.text.trim())), false)
  }, [sceneId, apply])

  const toStage = useCallback((e: ReactPointerEvent): Pt => {
    const r = svgRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * 1920, y: ((e.clientY - r.top) / r.height) * 1080, p: e.pressure || 0.5 }
  }, [])
  const setItems = useCallback((fn: (prev: Item[]) => Item[]) => apply(sceneId, fn), [apply, sceneId])

  function onDown(e: ReactPointerEvent) {
    if (!on || editing) return
    const p = toStage(e)
    // 文字在 pointerup 放置:若在 down 建 item+聚焦,同一次点击的 up 会触发 onBlur(空)立即删除。
    if (tool === 'text') { draft.current = { id: nextId(), kind: 'text', color, at: p, text: '' }; force(n => n + 1); return }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    if (tool === 'eraser') { setItems(prev => prev.filter(it => !itemHit(it, p))); return }
    draft.current = tool === 'arrow' ? { id: nextId(), kind: 'arrow', color, a: p, b: p }
      : tool === 'rect' ? { id: nextId(), kind: 'rect', color, a: p, b: p }
      : { id: nextId(), kind: 'free', tool, color, points: [p] }
    force(n => n + 1)
  }
  function onMove(e: ReactPointerEvent) {
    if (!on) return
    const p = toStage(e)
    if (tool === 'eraser') { if (e.buttons) setItems(prev => prev.filter(it => !itemHit(it, p))); return }
    const d = draft.current; if (!d) return
    if (d.kind === 'free') { const last = d.points[d.points.length - 1]!; if (Math.hypot(p.x - last.x, p.y - last.y) > 2) d.points.push(p) }
    else if (d.kind === 'arrow' || d.kind === 'rect') d.b = p
    force(n => n + 1)
  }
  function onUp() {
    const d = draft.current; draft.current = null
    if (d) {
      if (d.kind === 'text') { setItems(prev => [...prev, d]); setEditing(d.id) }
      else {
        const ok = d.kind === 'free' ? d.points.length > 1 : Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y) > 6
        if (ok) setItems(prev => [...prev, d])
      }
    }
    force(n => n + 1)
  }

  const commit = useCallback((id: string, raw: string) => {
    if (raw.trim()) setItems(prev => prev.map(x => x.id === id && x.kind === 'text' ? { ...x, text: raw } : x))
    // 空文本/Esc 取消:静默移除,不进撤销栈(项从未可见)。
    else apply(sceneId, prev => prev.filter(x => x.id !== id), false)
    setEditing(null)
  }, [setItems, apply, sceneId])

  /** 已提交笔迹的 path 只算一次(draft 每帧变,不缓存)。 */
  function freePath(it: Item & { kind: 'free' }): string {
    if (it === draft.current) return it.tool === 'pen' ? penOutline(it.points) : smoothPath(it.points)
    let d = pathCache.current.get(it.id)
    if (d === undefined) {
      d = it.tool === 'pen' ? penOutline(it.points) : smoothPath(it.points)
      if (pathCache.current.size > 300) pathCache.current.clear()
      pathCache.current.set(it.id, d)
    }
    return d
  }

  const shown = [...items, ...(draft.current ? [draft.current] : [])]
  const editItem = editing ? items.find(x => x.id === editing && x.kind === 'text') : undefined
  return (
    <div className="absolute inset-0 z-40" style={{ pointerEvents: 'none' }}>
      <svg ref={svgRef} viewBox="0 0 1920 1080" className="absolute inset-0 h-full w-full"
        style={{ pointerEvents: on ? 'auto' : 'none', cursor: on ? (tool === 'eraser' ? 'cell' : tool === 'text' ? 'text' : 'crosshair') : 'default', touchAction: 'none' }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp}
        onPointerCancel={() => { draft.current = null; force(n => n + 1) }}>
        <defs>
          {COLORS.map(c => <marker key={c} id={`ah-${c.slice(1)}`} markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill={c} /></marker>)}
        </defs>
        {shown.map(it => {
          if (it.kind === 'free') return it.tool === 'pen'
            ? <path key={it.id} d={freePath(it)} fill={it.color} />
            : <path key={it.id} d={freePath(it)} fill="none" stroke={it.color} strokeWidth={HL_W} strokeOpacity={0.32} strokeLinecap="round" strokeLinejoin="round" style={{ mixBlendMode: 'multiply' }} />
          if (it.kind === 'arrow') return <line key={it.id} x1={it.a.x} y1={it.a.y} x2={it.b.x} y2={it.b.y} stroke={it.color} strokeWidth={5} strokeLinecap="round" markerEnd={`url(#ah-${it.color.slice(1)})`} />
          if (it.kind === 'rect') return <rect key={it.id} x={Math.min(it.a.x, it.b.x)} y={Math.min(it.a.y, it.b.y)} width={Math.abs(it.b.x - it.a.x)} height={Math.abs(it.b.y - it.a.y)} fill="none" stroke={it.color} strokeWidth={4} rx={6} />
          if (editing === it.id) return null
          // SVG <text> 无行盒,多行用 tspan 逐行绝对定位(y 而非 dy,空行不塌)。
          return it.text ? (
            <text key={it.id} fill={it.color} style={{ fontSize: TEXT_SIZE, fontWeight: 700, fontFamily: 'var(--pack-font-body, sans-serif)' }}>
              {it.text.split('\n').map((ln, i) => <tspan key={i} x={it.at.x} y={it.at.y + i * TEXT_SIZE * 1.3}>{ln}</tspan>)}
            </text>
          ) : null
        })}
      </svg>
      {editItem && editItem.kind === 'text' && (
        <textarea
          ref={editRef} autoFocus defaultValue={editItem.text}
          onBlur={e => { const cancelled = cancelRef.current; cancelRef.current = false; commit(editItem.id, cancelled ? '' : e.target.value) }}
          onKeyDown={e => { if (e.key === 'Escape') { cancelRef.current = true; e.currentTarget.blur() } }}
          style={{ position: 'absolute', left: editItem.at.x - 8, top: editItem.at.y - TEXT_SIZE - 2, pointerEvents: 'auto', font: `700 ${TEXT_SIZE}px var(--pack-font-body, sans-serif)`, color: editItem.color, background: 'rgba(255,255,255,0.7)', border: `2px dashed ${editItem.color}`, borderRadius: 4, padding: '2px 6px', resize: 'none', minWidth: 240, minHeight: TEXT_SIZE * 1.8, outline: 'none', lineHeight: 1.3 }}
        />
      )}
    </div>
  )
}

/** 工具栏。variant='fixed' 视口固定(课堂);'panel' 相对父面板绝对定位(备课台,父需 relative)。 */
export function AnnotationToolbar({ state, sceneId, chrome, variant = 'fixed' }: { state: AnnotationState; sceneId: string; chrome: ChromeColors; variant?: 'fixed' | 'panel' }) {
  const { on, setOn, tool, setTool, color, setColor, bySceneId, apply, undo } = state
  const items = bySceneId[sceneId] ?? []
  const chip = (active: boolean) => active
    ? { borderColor: chrome.activeBorder, background: chrome.activeBg, color: chrome.activeText }
    : { borderColor: chrome.chipBorder, background: chrome.chipBgFloating, color: chrome.chipText }
  const clear = () => apply(sceneId, () => [])
  const Btn = ({ label, active, onClick, title }: { label: string; active?: boolean; onClick: () => void; title?: string }) => (
    <button type="button" onClick={onClick} title={title} className="rounded-[8px] border px-2.5 py-1.5 text-[13px] font-semibold transition hover:brightness-110" style={chip(!!active)}>{label}</button>
  )
  const TOOLS: { t: AnnoTool; label: string }[] = [{ t: 'pen', label: '画笔' }, { t: 'highlighter', label: '荧光笔' }, { t: 'arrow', label: '箭头' }, { t: 'rect', label: '矩形' }, { t: 'text', label: '文字' }, { t: 'eraser', label: '橡皮' }]
  const pos = variant === 'fixed' ? 'fixed left-1/2 top-3' : 'absolute left-1/2 top-2'
  return (
    <div className={`${pos} z-[100] flex -translate-x-1/2 flex-wrap items-center justify-center gap-1.5 rounded-[10px] border px-2 py-1.5`} style={{ borderColor: chrome.barBorder, background: chrome.barBg, maxWidth: 'calc(100% - 16px)' }}>
      <Btn label={on ? '批注 · 开' : '批注'} active={on} onClick={() => setOn(v => !v)} title="切换舞台批注" />
      {on && (
        <>
          <span className="mx-0.5 h-5 w-px" style={{ background: chrome.chipBorder }} />
          {TOOLS.map(({ t, label }) => <Btn key={t} label={label} active={tool === t} onClick={() => setTool(t)} />)}
          <span className="mx-0.5 h-5 w-px" style={{ background: chrome.chipBorder }} />
          {COLORS.map(c => (
            <button key={c} type="button" onClick={() => setColor(c)} title={c} className="h-6 w-6 rounded-full border transition hover:brightness-110"
              style={{ background: c, borderColor: color === c ? chrome.activeText : chrome.chipBorder, borderWidth: color === c ? 2.5 : 1.5 }} />
          ))}
          <span className="mx-0.5 h-5 w-px" style={{ background: chrome.chipBorder }} />
          <Btn label="撤销" onClick={() => undo(sceneId)} title="撤销(含擦除/清除)" />
          <Btn label={`清除${items.length ? ` (${items.length})` : ''}`} onClick={clear} title="清除本幕批注" />
        </>
      )}
    </div>
  )
}
