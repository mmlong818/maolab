import type { ReactNode } from 'react'
import './prep-render.css'

// 投影舞台专用样式只挂在渲染页上，不影响 /learn 等其他页面
export default function PrepRenderLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
