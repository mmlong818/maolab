'use client'

import { useEffect, useState, type ReactNode } from 'react'

/**
 * ScaleStage — 等比缩放舞台 (PPT 全屏模式)
 *
 * 把子内容渲染在固定 baseWidth × baseHeight 设计画布上,
 * transform: scale + translate 缩放并居中到浏览器视口,
 * 永远不会出现裁切、滚动条或留白错位。
 *
 * 关键: SSR 时 visibility=hidden (避免出现 1920x1080 box 溢出小视口被裁的"内容缩为视口 1/4"现象),
 * client mount 后立刻测量 viewport 算出真实 scale 并显示。
 */
interface Props {
  children: ReactNode
  baseWidth?: number
  baseHeight?: number
  background?: string
}

export default function ScaleStage({
  children,
  baseWidth = 1920,
  baseHeight = 1080,
  background = '#fafaf7',
}: Props) {
  const [scale, setScale] = useState(1)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    function recalc() {
      setScale(Math.min(window.innerWidth / baseWidth, window.innerHeight / baseHeight))
    }
    recalc()
    setReady(true)
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [baseWidth, baseHeight])

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: baseWidth,
          height: baseHeight,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: '50% 50%',
          visibility: ready ? 'visible' : 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  )
}
