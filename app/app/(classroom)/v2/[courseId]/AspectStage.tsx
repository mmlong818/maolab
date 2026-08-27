'use client'

/**
 * AspectStage — 16:9 教学画布（全局基本原则）
 *
 * 课程内容一律显示在 16:9 有效空间内; 逻辑设计尺寸固定为 1920×1080。
 * 页面会按容器等比 contain 缩放, 但所有课堂层级都按这张 16:9 画布设计。
 * aspect-ratio CSS 在 max 约束下会破比, 必须用 ResizeObserver contain 计算。
 */

import { useEffect, useRef, useState } from 'react'

export default function AspectStage({ children }: { children: React.ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    // 用 contentRect(本地坐标)而非 getBoundingClientRect: 后者受祖先 transform scale 影响,
    // 会量出超过真实可用宽的值, 导致画布被 flex 压缩破比(自学模式入场 scale 踩过)
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0]!.contentRect
      if (width < 10 || height < 10) return
      const w = Math.min(width, height * 16 / 9)
      setDim({ w, h: w * 9 / 16 })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={hostRef} style={{ width: '100%', height: '100%', minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div data-stage-design-size="1920x1080" data-stage-canvas="true" style={{ width: dim?.w ?? '100%', height: dim?.h ?? '100%', aspectRatio: '16 / 9', display: 'flex', position: 'relative', overflow: 'hidden', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.08)' }}>
        {children}
      </div>
    </div>
  )
}
