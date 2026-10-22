import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { MathJaxContext } from 'better-react-mathjax'
import { GeistSans } from 'geist/font/sans'
import { GeistMono } from 'geist/font/mono'
import AuthGate from './components/AuthGate'
import './globals.css'

export const metadata: Metadata = {
  title: '云一助教',
  description: '老师选知识点，和备课助理一起把它做成一节能上的课',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

const mathJaxConfig = {
  loader: {
    load: ['input/tex', 'output/svg'],
    paths: {
      'mathjax-mhchem-extension': '/vendor/mathjax/font-extensions/mhchem',
    },
  },
  tex: { inlineMath: [['$', '$'], ['\\(', '\\)']] },
  // v4 默认开行内自动折行,长公式会在 =/× 处断成多行,与中文句子错位
  // (真检截图实证);行内公式保持单行,断行决策交给版式层(MathSegment nowrap)
  output: { linebreaks: { inline: false } },
  svg: { linebreaks: { inline: false } },
}

// 构建前由 scripts/sync-mathjax-assets.mjs 从锁定的官方包复制白名单文件。
// 主包、动态 TeX 扩展、语音 worker 和语言映射均从同源客户端目录加载。
const mathJaxSrc = '/vendor/mathjax/tex-svg.js'

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-CN" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <MathJaxContext config={mathJaxConfig} src={mathJaxSrc}>
          <div className="min-h-screen"><AuthGate>{children}</AuthGate></div>
        </MathJaxContext>
      </body>
    </html>
  )
}
