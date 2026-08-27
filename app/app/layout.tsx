import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { MathJaxContext } from 'better-react-mathjax'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import './globals.css'
import NavBar from '@/components/NavBar'

export const metadata: Metadata = {
  title: '猫叔的教学研究室',
  description: 'AI 驱动的自适应教学平台',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

const mathJaxConfig = {
  loader: { load: ['input/tex', 'output/svg'] },
  tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
  // v4 默认开行内自动折行,长公式会在 =/× 处断成多行,与中文句子错位
  // (真检截图实证);行内公式保持单行,断行决策交给版式层(MathSegment nowrap)
  output: { linebreaks: { inline: false } },
  svg: { linebreaks: { inline: false } },
}

// 钉死单一版本(tex 输入 + svg 输出合并包):不指定 src 时库核心锁 4.1.0
// 而 loader 从 CDN 拉最新组件,产生「组件 4.1.3 / 运行时 4.1.0」版本漂移告警
const mathJaxSrc = 'https://cdn.jsdelivr.net/npm/mathjax@4.1.3/tex-svg.js'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <MathJaxContext config={mathJaxConfig} src={mathJaxSrc}>
          <NavBar />
          <div className="min-h-screen">{children}</div>
        </MathJaxContext>
      </body>
    </html>
  )
}
