/**
 * 并列条目识别(2026-08-26 用户裁决「问题和回答都应该把三个学生的断行显示」):
 * 题面/反馈常含「甲同学:…乙同学:…丙同学:…」「①…②…③…」式并列结构,
 * LLM 输出为单段字符串,整段渲染极难读。这里做确定性拆分——同类标记 ≥2 个
 * 才拆(单个「甲」出现在普通句子里不误伤),拆不动就原样返回 null 由调用方
 * 按原段落渲染,绝不改写文字内容本身。
 */

export interface EnumeratedSplit {
  /** 首个条目标记之前的引导句;可为空。 */
  lead: string
  /** 各并列条目(含标记本身,如「甲同学:「…」判断:__」)。 */
  items: string[]
}

interface MarkerFamily {
  id: string
  pattern: RegExp
}

// 每族独立匹配:跨族混用(「甲同学…②…」)不拆,避免把不同层级的列表搅在一起
const MARKER_FAMILIES: MarkerFamily[] = [
  { id: 'person', pattern: /(?:甲|乙|丙|丁|戊)(?:同学|组|队)?\s*[:：「]/g },
  { id: 'circled', pattern: /[①②③④⑤⑥⑦⑧⑨]/g },
  { id: 'paren-number', pattern: /[（(]\s*[1-9一二三四五六七八九]\s*[)）]/g },
  { id: 'condition', pattern: /条件[一二三四五六1-6]\s*[:：]/g },
]

export function splitEnumeratedItems(text: string): EnumeratedSplit | null {
  const value = text.trim()
  if (value.length < 24) return null
  for (const family of MARKER_FAMILIES) {
    family.pattern.lastIndex = 0
    const starts: number[] = []
    for (let match = family.pattern.exec(value); match; match = family.pattern.exec(value)) {
      starts.push(match.index)
    }
    if (starts.length < 2) continue
    // 条目平均长度过短说明标记只是行内点缀(如「①②③都对」),不值得拆行
    const avgSpan = (value.length - starts[0]!) / starts.length
    if (avgSpan < 10) continue
    const lead = value.slice(0, starts[0]).trim()
    const items = starts.map((start, index) => value.slice(start, starts[index + 1] ?? value.length).trim())
    if (items.some(item => item.length === 0)) continue
    return { lead, items }
  }
  return null
}
