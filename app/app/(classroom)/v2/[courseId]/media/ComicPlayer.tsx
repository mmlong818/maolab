'use client'

/**
 * ComicPlayer — 漫画播放器（媒介化方向 B）
 *
 * 横版一屏网格(像真实四格漫画): 3格=横排 / 4格=2×2 / 5-6格=2×3 / 7-8格=2×4。
 * 整部漫画一眼看全不滚动; 点任意格放大看细节(lightbox, ←→翻格)。
 * 每格: 图 + 对白气泡叠图 + 旁白条 + KP 落点标。逐格错峰淡现。
 */

import { useEffect, useState } from 'react'
import type { ComicPayload } from '@maolab/shared-types'
import { getClassroomTheme } from '../classroom-theme.js'
import AspectStage from '../AspectStage.js'

/** 格数 → 网格行列(整体保持横版、一屏装下) */
function gridFor(n: number): { cols: number; rows: number } {
  if (n <= 3) return { cols: Math.max(n, 1), rows: 1 }
  if (n === 4) return { cols: 2, rows: 2 }
  if (n <= 6) return { cols: 3, rows: 2 }
  return { cols: 4, rows: 2 }
}

export default function ComicPlayer({ payload, title, subject }: {
  payload: ComicPayload
  title: string
  subject?: string | undefined
}) {
  const theme = getClassroomTheme(subject)
  const [revealed, setRevealed] = useState(0)
  const [zoom, setZoom] = useState<number | null>(null)
  const n = payload.panels.length
  const { cols, rows } = gridFor(n)

  // 逐格错峰淡现(报纸四格漫画的"逐格读"节奏)
  useEffect(() => {
    if (revealed >= n) return
    const t = setTimeout(() => setRevealed(r => r + 1), 450)
    return () => clearTimeout(t)
  }, [revealed, n])

  // 方向键/Esc 操作 lightbox
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (zoom === null) return
      if (e.key === 'Escape') setZoom(null)
      if (e.key === 'ArrowRight' && zoom < n - 1) setZoom(zoom + 1)
      if (e.key === 'ArrowLeft' && zoom > 0) setZoom(zoom - 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom, n])

  const zp = zoom !== null ? payload.panels[zoom] : null

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* 功能条(画布外): 标题/主角/操作提示 */}
      <div style={{ textAlign: 'center', padding: '6px 0 10px', flexShrink: 0 }}>
        <span style={{ fontSize: 19, fontWeight: 800, color: theme.ink, fontFamily: theme.headingFont }}>🎨 {title}</span>
        <span style={{ fontSize: 12, color: theme.accent, fontWeight: 700, marginLeft: 12 }}>
          主角：{payload.protagonist.slice(0, 20)}… · 点任意格放大
        </span>
      </div>

      {/* 16:9 教学画布: 漫画网格(课程内容)全部在画布内 */}
      <AspectStage>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)`, gap: 12, width: '100%', height: '100%', padding: 12, background: theme.stageBg, boxSizing: 'border-box' }}>
        {payload.panels.map((p, i) => {
          const visible = i < revealed
          return (
            <div
              key={i}
              onClick={() => setZoom(i)}
              style={{
                background: theme.paper,
                borderRadius: 14,
                overflow: 'hidden',
                boxShadow: '0 4px 18px rgba(0,0,0,0.08)',
                border: `1px solid ${theme.accentSoft}`,
                cursor: 'zoom-in',
                opacity: visible ? 1 : 0,
                transform: visible ? 'scale(1)' : 'scale(0.92)',
                transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* 画面: 格号/KP标/对白全叠在图上; 高度弹性填满格子(cover 裁切) */}
              <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#f1f5f9' }}>
                {p.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.imageUrl} alt={p.scene} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} onError={(e) => { e.currentTarget.style.opacity = '0' }} />
                  : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>画面生成中…</div>}
                <span style={{ position: 'absolute', top: 8, left: 8, width: 22, height: 22, borderRadius: '50%', background: theme.accent, color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 6px rgba(0,0,0,0.25)' }}>{i + 1}</span>
                {p.kpHint && (
                  <span style={{ position: 'absolute', top: 8, right: 8, maxWidth: '70%', padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,0.92)', fontSize: 10.5, color: theme.accent, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>🎯 {p.kpHint}</span>
                )}
                {p.speech && (
                  <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, background: '#fff', borderRadius: 12, padding: '7px 11px', boxShadow: '0 4px 14px rgba(0,0,0,0.18)' }}>
                    <span style={{ fontSize: 10.5, fontWeight: 800, color: theme.accent, marginRight: 5 }}>{p.speech.who}:</span>
                    <span style={{ fontSize: 12.5, color: theme.ink, lineHeight: 1.5 }}>{p.speech.text}</span>
                  </div>
                )}
              </div>
              {/* 旁白: 图下细条 */}
              {p.narration && (
                <div style={{ padding: '7px 11px', background: '#fffbe8', borderTop: '1px solid #fce9a8', fontSize: 12, lineHeight: 1.55, color: '#78350f' }}>
                  {p.narration}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </AspectStage>

      {/* lightbox 放大格 */}
      {zp && zoom !== null && (
        <div onClick={() => setZoom(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(10,10,10,0.78)', zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}>
          <div onClick={e => e.stopPropagation()} style={{ maxWidth: 680, width: '100%', maxHeight: '92vh', overflow: 'auto', background: '#fff', borderRadius: 18, boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }}>
            <div style={{ position: 'relative', aspectRatio: '1 / 1', background: '#f1f5f9' }}>
              {zp.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={zp.imageUrl} alt={zp.scene} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              )}
              {zp.speech && (
                <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16, background: '#fff', borderRadius: 14, padding: '10px 16px', boxShadow: '0 4px 14px rgba(0,0,0,0.2)' }}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: theme.accent, marginRight: 6 }}>{zp.speech.who}:</span>
                  <span style={{ fontSize: 15, color: theme.ink }}>{zp.speech.text}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px' }}>
              <button onClick={() => zoom > 0 && setZoom(zoom - 1)} disabled={zoom === 0} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: zoom === 0 ? 'default' : 'pointer', color: zoom === 0 ? '#d1d5db' : theme.accent }}>←</button>
              <div style={{ flex: 1, fontSize: 13, color: '#374151', lineHeight: 1.6 }}>
                <b style={{ color: theme.accent }}>第 {zoom + 1} / {n} 格</b>
                {zp.kpHint && <span style={{ marginLeft: 8, fontSize: 11.5, color: theme.accent, fontWeight: 700 }}>🎯 {zp.kpHint}</span>}
                {zp.narration && <div style={{ marginTop: 2, color: '#78350f' }}>{zp.narration}</div>}
              </div>
              <button onClick={() => zoom < n - 1 && setZoom(zoom + 1)} disabled={zoom === n - 1} style={{ border: 'none', background: 'transparent', fontSize: 20, cursor: zoom === n - 1 ? 'default' : 'pointer', color: zoom === n - 1 ? '#d1d5db' : theme.accent }}>→</button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
