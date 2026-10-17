'use client'

import AccessibleFormula from './AccessibleFormula'

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
  const plain = inner.replace(/\\text\{([^{}]+)\}/g, '$1').replace(/\\,/g, ' ')
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

function MathSegment({ children }: { children: string }) {
  if (!hasMath(children)) return <>{children}</>
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
  return (
    <span style={{ whiteSpace: 'nowrap', display: 'inline-block' }}>
      <AccessibleFormula tex={tex} />
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
