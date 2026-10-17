/**
 * 把讲稿里的数学/科学 LaTeX 转成适合中文语音和教师提词的文本。
 *
 * 页面内容仍保留 LaTeX 交给 MathJax；这里只处理口语通道。转换刻意覆盖 K12
 * 讲稿中高频的分数、根式、上下标、角度、单位和化学反应箭头，不尝试成为
 * 完整 TeX 解析器。未知命令至少会去掉控制符，避免 TTS 读出“反斜杠”。
 */

const MATH_SEGMENT_PATTERN = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$([^$\n]+)\$/g
const UNDELIMITED_MATH_COMMAND_PATTERN = /\\(?:frac|sqrt|text|mathrm|mathbf|operatorname)\s*\{(?:[^{}]|\{[^{}]*\})*\}(?:\s*\{(?:[^{}]|\{[^{}]*\})*\})?/g

const GREEK_COMMANDS: Record<string, string> = {
  Delta: '德尔塔',
  delta: '德尔塔',
  theta: '西塔',
  alpha: '阿尔法',
  beta: '贝塔',
  gamma: '伽马',
  lambda: '拉姆达',
  mu: '缪',
  pi: '派',
  rho: '柔',
  sigma: '西格马',
  omega: '欧米伽',
}

function replaceNestedCommands(value: string): string {
  let result = value
  for (let pass = 0; pass < 4; pass += 1) {
    const before = result
    result = result
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$2分之$1')
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, '根号$1')
      .replace(/\\(?:text|mathrm|mathbf|operatorname)\s*\{([^{}]*)\}/g, '$1')
    if (result === before) break
  }
  return result
}

function replaceUnits(value: string): string {
  return value
    .replace(/kJ\s*\/\s*mol/gi, '千焦每摩尔')
    .replace(/J\s*\/\s*mol/gi, '焦耳每摩尔')
    .replace(/m\s*\/\s*s\s*\^\s*\{?2\}?/gi, '米每二次方秒')
    .replace(/m\s*\/\s*s/gi, '米每秒')
    .replace(/(\d(?:\.\d+)?)\s*(kg|千克)/gi, '$1千克')
    .replace(/(\d(?:\.\d+)?)\s*(km|千米)/gi, '$1千米')
    .replace(/(\d(?:\.\d+)?)\s*(cm|厘米)/gi, '$1厘米')
    .replace(/(\d(?:\.\d+)?)\s*(mm|毫米)/gi, '$1毫米')
    .replace(/(\d(?:\.\d+)?)\s*(kJ|千焦)/g, '$1千焦')
    .replace(/(\d(?:\.\d+)?)\s*(mol|摩尔)/gi, '$1摩尔')
    .replace(/(\d(?:\.\d+)?)\s*N\b/g, '$1牛')
    .replace(/(\d(?:\.\d+)?)\s*J\b/g, '$1焦耳')
    .replace(/(\d(?:\.\d+)?)\s*m\b/g, '$1米')
    .replace(/(\d(?:\.\d+)?)\s*s\b/g, '$1秒')
}

function replaceUndelimitedMathCommands(value: string): string {
  let result = value
  for (let pass = 0; pass < 4; pass += 1) {
    const converted = result.replace(
      UNDELIMITED_MATH_COMMAND_PATTERN,
      segment => mathExpressionForSpeech(segment),
    )
    if (converted === result) break
    result = converted
  }
  return result
}

export function mathExpressionForSpeech(raw: string): string {
  // 部分模型会忘记在 JSON 中双写反斜杠，`\text` / `\frac` 被 JSON 解析成
  // tab+ext / form-feed+rac。先恢复两个高频命令，再进入正常转换。
  let text = raw
    .replace(/\u0009(?=ext\b)/g, '\\t')
    .replace(/\u000c(?=rac\b)/g, '\\f')
    .trim()

  text = text
    .replace(/\\xrightarrow\s*\{\\text\s*\{([^{}]*)\}\}/g, '在$1条件下生成')
    .replace(/\\xrightarrow\s*\{([^{}]*)\}/g, '在$1条件下生成')
    .replace(/\\(?:longrightarrow|rightarrow|to)\b/g, '生成')
    .replace(/\\(?:leftrightarrow|rightleftharpoons)\b/g, '可逆生成')

  text = replaceNestedCommands(text)
    .replace(/\\left\b|\\right\b/g, '')
    .replace(/\\,/g, '')
    .replace(/\\;/g, ' ')
    .replace(/\\!/g, '')

  for (const [command, spoken] of Object.entries(GREEK_COMMANDS)) {
    text = text.replace(new RegExp(`\\\\${command}\\b`, 'g'), spoken)
  }

  text = text
    .replace(/\\angle\b/g, '角')
    .replace(/\^\s*\{?\\circ\}?|\\circ\b/g, '度')

  text = replaceUnits(text)
    .replace(/\^\s*\{?2\}?/g, '平方')
    .replace(/\^\s*\{?3\}?/g, '立方')
    .replace(/_\s*\{([^{}]*)\}/g, '$1')
    .replace(/_\s*([A-Za-z0-9]+)/g, '$1')
    .replace(/\\times\b|\\cdot\b|×/g, '乘')
    .replace(/\\div\b|÷/g, '除以')
    .replace(/\\neq\b|≠/g, '不等于')
    .replace(/\\leq?\b|≤/g, '小于等于')
    .replace(/\\geq?\b|≥/g, '大于等于')
    .replace(/\\pm\b|±/g, '正负')
    .replace(/\\infty\b|∞/g, '无穷大')
    .replace(/(^|[=<>])\s*-\s*(?=\d|[A-Za-z德])/g, '$1负')
    .replace(/=/g, '等于')
    .replace(/</g, '小于')
    .replace(/>/g, '大于')
    .replace(/\+/g, '加')
    .replace(/-/g, '减')
    .replace(/\*/g, '乘')
    .replace(/\//g, '除以')
    .replace(/\\([A-Za-z]+)/g, '$1')
    .replace(/[{}]/g, '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*([，。！？；：、])\s*/g, '$1')
    .trim()

  return text
}

export function teacherScriptForSpeech(raw: string): string {
  const delimitedMathConverted = raw.replace(
    MATH_SEGMENT_PATTERN,
    (_match, inline: string | undefined, display: string | undefined, dollar: string | undefined) => (
      mathExpressionForSpeech(inline ?? display ?? dollar ?? '')
    ),
  )

  return replaceUndelimitedMathCommands(delimitedMathConverted)
    // 兜底:模型偶尔在定界符之外裸写 \frac{a}{b} / \sqrt{x} / \text{...},
    // MATH_SEGMENT_PATTERN 抓不到,TTS 会照读 LaTeX 原文(2026-08-26 code-review CONFIRMED)。
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
