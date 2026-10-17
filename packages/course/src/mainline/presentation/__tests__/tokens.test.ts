import { describe, it, expect } from 'vitest'
import { fitType, MEASURE_CHARS_MAX, PROJECTION_TEXT_MIN_PX, projectionFontSize, TYPE_SCALE } from '../tokens.js'

describe('fitType 内容感知字号', () => {
  it('display 档按字符量降档,边界值命中正确一侧', () => {
    expect(fitType('display', 16).fontSize).toBe('72px')
    expect(fitType('display', 17).fontSize).toBe('58px')
    expect(fitType('display', 32).fontSize).toBe('58px')
    expect(fitType('display', 33).fontSize).toBe('46px')
    expect(fitType('display', 64).fontSize).toBe('46px')
    expect(fitType('display', 65).fontSize).toBe('36px')
  })

  it('heading 使用固定语义字号,不随字符量改变', () => {
    expect(fitType('heading', 12).fontSize).toBe('42px')
    expect(fitType('heading', 13).fontSize).toBe('42px')
    expect(fitType('heading', 24).fontSize).toBe('42px')
    expect(fitType('heading', 25).fontSize).toBe('42px')
    expect(fitType('heading', 48).fontSize).toBe('42px')
    expect(fitType('heading', 49).fontSize).toBe('42px')
  })

  it('body 使用固定语义字号,不随字符量改变', () => {
    expect(fitType('body', 20).fontSize).toBe('30px')
    expect(fitType('body', 21).fontSize).toBe('30px')
    expect(fitType('body', 50).fontSize).toBe('30px')
    expect(fitType('body', 51).fontSize).toBe('30px')
    expect(fitType('body', 100).fontSize).toBe('30px')
    expect(fitType('body', 101).fontSize).toBe('30px')
  })

  it('超长文本不跌破投影片地板(display 36px / heading 36px / body 28px)', () => {
    expect(fitType('display', 10000).fontSize).toBe('36px')
    expect(fitType('heading', 10000).fontSize).toBe('42px')
    expect(fitType('body', 10000).fontSize).toBe('30px')
  })

  it('各角色下限与投影规则一致', () => {
    expect(PROJECTION_TEXT_MIN_PX).toEqual({ display: 36, heading: 36, body: 28, auxiliary: 20, diagram: 22 })
    const px = Number(fitType('body', 10000).fontSize.replace('px', ''))
    expect(px).toBeGreaterThanOrEqual(PROJECTION_TEXT_MIN_PX.body)
    expect(projectionFontSize('diagram', 12)).toBe('22px')
    expect(projectionFontSize('auxiliary', 24)).toBe('24px')
  })

  it('空字符串(0 字)落进各 tier 的有效档,不报错', () => {
    expect(fitType('display', 0).fontSize).toBe('72px')
    expect(fitType('heading', 0).fontSize).toBe('42px')
    expect(fitType('body', 0).fontSize).toBe('30px')
  })

  it('行高随字号增大而收紧(大字标题松于正文密排,但都在合理阅读区间)', () => {
    expect(fitType('display', 10).lineHeight).toBeLessThan(fitType('body', 10).lineHeight)
  })

  it('保留 tier 基准的 fontWeight/fontFamily(display/heading 走 pack 显示字体)', () => {
    expect(fitType('display', 10).fontWeight).toBe(TYPE_SCALE.display.fontWeight)
    expect(fitType('display', 10).fontFamily).toBe(TYPE_SCALE.display.fontFamily)
    expect(fitType('body', 10).fontWeight).toBe(TYPE_SCALE.body.fontWeight)
  })

  it('MEASURE_CHARS_MAX 是正文行长硬顶,用于"该分段/收窄行宽"判断而非缩字号', () => {
    expect(MEASURE_CHARS_MAX).toBe(34)
  })
})
