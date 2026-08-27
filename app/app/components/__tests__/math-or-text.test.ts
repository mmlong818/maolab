import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import MathOrText from '../MathOrText.js'

describe('MathOrText 服务端首屏', () => {
  it('复杂公式先输出稳定纯文本，避免 MathJax 在 React 水合前改写节点', () => {
    const html = renderToStaticMarkup(createElement(
      MathOrText,
      { children: '加速度为 \\(a=\\frac{b}{c}+d\\)，再判断。' },
    ))

    expect(html).toContain('data-math-pending="true"')
    expect(html).toContain('a=b / c+d')
    expect(html).not.toContain('\\(a=')
    expect(html).not.toContain('mjx-container')
  })

  it('普通单位继续直接显示，不等待 MathJax', () => {
    const html = renderToStaticMarkup(createElement(MathOrText, { children: '\\(3.0\\,\\mathrm{s}\\)' }))

    expect(html).toContain('3.0 s')
    expect(html).not.toContain('data-math-pending')
  })

  it('裸 TeX 嵌在中文题干时保留正文换行，不把整段题干渲染成一条公式', () => {
    const html = renderToStaticMarkup(createElement(
      MathOrText,
      { children: '函数 y=\\frac{6}{x}（x≠0）已描出五个点，请判断连线方式。' },
    ))

    expect(html).toContain('函数 y=6 / x（x≠0）已描出五个点，请判断连线方式。')
    expect(html).not.toContain('data-math-pending')
    expect(html).not.toContain('white-space:nowrap')
  })
})
