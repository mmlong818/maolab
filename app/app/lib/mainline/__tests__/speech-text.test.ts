import { describe, expect, it } from 'vitest'
import { mathExpressionForSpeech, teacherScriptForSpeech } from '../speech-text.js'

describe('teacherScriptForSpeech', () => {
  it('保留普通中文讲稿', () => {
    const script = '请先观察，再说出你的判断依据。'
    expect(teacherScriptForSpeech(script)).toBe(script)
  })

  it('把物理公式和单位转成可朗读文本', () => {
    const result = teacherScriptForSpeech(
      '先算重力：\\(G=mg\\)，代入 \\(m=2\\,\\mathrm{kg}\\)、\\(g=9.8\\,\\mathrm{m/s^2}\\)，得 \\(G=19.6\\,\\mathrm{N}\\)。',
    )

    expect(result).toContain('G等于mg')
    expect(result).toContain('m等于2千克')
    expect(result).toContain('g等于9.8米每二次方秒')
    expect(result).toContain('G等于19.6牛')
    expect(result).not.toMatch(/[\\{}$]/)
  })

  it('把化学反应箭头、下标和焓变单位转成口语', () => {
    const result = teacherScriptForSpeech(
      '反应式是 \\(2H_2 + O_2 \\xrightarrow{\\text{点燃}} 2H_2O\\)，焓变为 \\(\\Delta H=-571.6\\,\\text{kJ/mol}\\)。',
    )

    expect(result.replace(/\s/g, '')).toContain('2H2加O2在点燃条件下生成2H2O')
    expect(result).toContain('德尔塔 H等于负571.6千焦每摩尔')
    expect(result).not.toMatch(/[\\{}$]/)
  })

  it('修复模型 JSON 中被解析成控制字符的 text 与 frac 命令', () => {
    const malformed = `反应式 \\(2H_2 \\xrightarrow{\text{点燃}} 2H_2O\\)，面积 \\(S=\frac{1}{2}ah\\)。`
    const result = teacherScriptForSpeech(malformed)
    expect(result.replace(/\s/g, '')).toContain('2H2在点燃条件下生成2H2O')
    expect(result).toContain('S等于2分之1ah')
    expect(result).not.toMatch(/[\u0000-\u001f\\{}$]/)
  })

  it('处理分数、角度和旧式美元定界符', () => {
    const result = teacherScriptForSpeech('面积是 \\(S=\\frac{1}{2}ah\\)，角 C 是 $90^\\circ$。')
    expect(result).toContain('S等于2分之1ah')
    expect(result).toContain('90度')
  })

  it('处理定界符外含嵌套命令的分数与根式', () => {
    const result = teacherScriptForSpeech('继续算 \\frac{\\sqrt{x}}{2}，再比较 \\frac{1}{\\sqrt{2}}。')
    expect(result).toContain('2分之根号x')
    expect(result).toContain('根号2分之1')
    expect(result).not.toMatch(/[\\{}]/)
  })

  it('转换结果可重复处理而不继续变化', () => {
    const once = teacherScriptForSpeech('速度是 \\(v=\\frac{s}{t}\\)。')
    expect(teacherScriptForSpeech(once)).toBe(once)
  })
})

describe('mathExpressionForSpeech', () => {
  it('未知命令至少不会把控制符交给语音引擎', () => {
    const result = mathExpressionForSpeech('\\foo{x}+1')
    expect(result).toBe('foox加1')
    expect(result).not.toContain('\\')
  })
})
