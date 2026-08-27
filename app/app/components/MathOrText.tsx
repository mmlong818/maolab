'use client'

import { MathJax } from 'better-react-mathjax'
import React, { useEffect, useState } from 'react'

function hasMath(s: string): boolean {
  return /\\[a-zA-Z]{2,}\b|\\[([]|\$[^$\n]{1,200}\$/.test(s)
}

/**
 * 修复 JSON 转义损伤:LLM 在 JSON 字符串里写单反斜杠 TeX 命令时,\t \b \f \n \r
 * 会被 JSON.parse 吃成控制字符(如 \times → TAB+imes、\frac → FF+rac)。数学段内
 * 控制字符后紧跟字母 = 必然是被吞的 TeX 命令,按逆映射还原;真正的排版换行/制表
 * 不会出现在行内公式里,无误伤面。
 */
function repairJsonEscapeDamage(s: string): string {
  return s
    .replace(/\t(?=[a-zA-Z])/g, '\\t')
    .replace(/\x08(?=[a-zA-Z])/g, '\\b')
    .replace(/\f(?=[a-zA-Z])/g, '\\f')
    .replace(/\n(?=[a-zA-Z])/g, '\\n')
    .replace(/\r(?=[a-zA-Z])/g, '\\r')
}

function normalizeTex(s: string): string {
  return repairJsonEscapeDamage(s).replace(/\\text\{([^{}]+)\}/g, '\\mathrm{$1}')
}

function plainUnitMath(s: string): string | null {
  const inner = s.trim()
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    .trim()
  if (/\\frac|[\^_]/.test(inner)) return null
  const plain = inner.replace(/\\(?:text|mathrm)\{([^{}]+)\}/g, '$1').replace(/\\,/g, ' ')
  return /^[0-9a-zA-Z+\-=./\s]+$/.test(plain) ? plain : null
}

function plainSimpleFormula(s: string): string | null {
  const inner = s.trim()
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    .trim()
    .replace(/\s+/g, '')
  if (/^v=\\frac\{s\}\{t\}$/.test(inner)) return 'v = s / t'
  return null
}

function mathFallback(s: string): string {
  const inner = normalizeTex(s.trim())
    .replace(/^\\\(/, '')
    .replace(/\\\)$/, '')
    .replace(/^\\\[/, '')
    .replace(/\\\]$/, '')
    .replace(/^\$\$/, '')
    .replace(/\$\$$/, '')
    .replace(/^\$/, '')
    .replace(/\$$/, '')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '$1 / $2')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\(?:mathrm|text)\{([^{}]+)\}/g, '$1')
    .replace(/\\times/g, '×')
    .replace(/\\cdot/g, '·')
    .replace(/\\theta/g, 'θ')
    .replace(/\\alpha/g, 'α')
    .replace(/\\beta/g, 'β')
    .replace(/\\gamma/g, 'γ')
    .replace(/\\,/g, ' ')
    .replace(/\\[a-zA-Z]+/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return inner || '数学公式'
}

function MathSegment({ children }: { children: string }) {
  const [mathReady, setMathReady] = useState(false)
  useEffect(() => setMathReady(true), [])

  if (!hasMath(children)) return <>{children}</>
  // 课程旧数据里可能把 \frac 直接嵌进整句中文而没有 \(...\) 定界符。此时不能把
  // 整段题干交给 MathJax：它会生成不可换行的一整条公式，挤出右侧图形。保留自然
  // 正文换行，并把裸 TeX 化为可读的文本公式；带定界符的正式公式仍走 MathJax。
  const isDelimitedMath = /^(?:\\\([\s\S]*\\\)|\\\[[\s\S]*\\\]|\$\$[\s\S]*\$\$|\$[^$\n]+\$)$/.test(children.trim())
  if (!isDelimitedMath && /[\u3400-\u9fff]/.test(children)) return <>{mathFallback(children)}</>
  const plain = plainUnitMath(children)
  if (plain) return <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>{plain}</span>
  const simpleFormula = plainSimpleFormula(children)
  if (simpleFormula) return <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>{simpleFormula}</span>
  const trimmed = normalizeTex(children.trim())
  const tex = /^\\[([]/.test(trimmed)
    ? normalizeTex(children)
    : trimmed.startsWith('$$') && trimmed.endsWith('$$')
      ? `\\(${trimmed.slice(2, -2).trim()}\\)`
      : `\\(${trimmed}\\)`
  if (!mathReady) {
    const fallback = mathFallback(children)
    return <span data-math-pending="true" style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>{fallback}</span>
  }
  return (
    <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>
      <MathJax inline dynamic>{tex}</MathJax>
    </span>
  )
}

function renderMathAware(text: string) {
  return text.split(/(\\\([^]*?\\\)|\\\[[^]*?\\\]|\$\$[^$]+\$\$|\$[^$\n]+\$)/g)
    .filter(Boolean)
    .map((part, i) => hasMath(part) ? <MathSegment key={i}>{part}</MathSegment> : <span key={i}>{part}</span>)
}

export default function MathOrText({ children }: { children: string }) {
  if (!children.includes('**')) return <>{renderMathAware(children)}</>
  return (
    <>
      {children.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
        const strong = part.startsWith('**') && part.endsWith('**')
        const text = strong ? part.slice(2, -2) : part
        return strong
          ? <strong key={i}>{renderMathAware(text)}</strong>
          : <span key={i}>{renderMathAware(text)}</span>
      })}
    </>
  )
}
