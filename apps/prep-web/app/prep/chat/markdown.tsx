'use client'

// 对话气泡的有限 Markdown（终审修复，T15 走查第 6 条）：只认粗体（**…**）、行内代码（`…`）、标题行（# …，显示成粗体段落）、
// 无序与有序列表、代码块（```…```，原样显示）、段落与换行。全部用 React 元素拼出，文字一律作为文本子节点交给 React 转义——
// 不注入任何 HTML 字符串，不生成链接、图片或任何属性来自输入的元素，HTML 与脚本原样显示成文字。
import React, { Fragment, type ReactNode } from 'react'
import styles from '../prep.module.css'

const INLINE = /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)/g

export function inlineNodes(text: string, keyPrefix = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const token = m[0]
    out.push(token.startsWith('`')
      ? <code key={`${keyPrefix}-${n++}`}>{token.slice(1, -1)}</code>
      : <strong key={`${keyPrefix}-${n++}`}>{token.slice(2, -2)}</strong>)
    last = at + token.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'heading'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; start: number; items: string[] }
  | { kind: 'code'; lines: string[] }

const HEADING = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBERED = /^\s*(\d{1,4})[.)]\s+(.*)$/
const FENCE = /^\s*```/

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = []
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (!line.trim()) { i++; continue }
    if (FENCE.test(line)) {
      const body: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i]!)) body.push(lines[i++]!)
      i++ // 收尾的 ```（没有也到文末为止）
      blocks.push({ kind: 'code', lines: body })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) { blocks.push({ kind: 'heading', text: heading[1]! }); i++; continue }
    if (BULLET.test(line)) {
      const items: string[] = []
      while (i < lines.length && BULLET.test(lines[i]!)) items.push(BULLET.exec(lines[i++]!)![1]!)
      blocks.push({ kind: 'ul', items })
      continue
    }
    const numbered = NUMBERED.exec(line)
    if (numbered) {
      const items: string[] = []
      while (i < lines.length && NUMBERED.test(lines[i]!)) items.push(NUMBERED.exec(lines[i++]!)![2]!)
      blocks.push({ kind: 'ol', start: Number(numbered[1]), items })
      continue
    }
    const para: string[] = []
    while (i < lines.length && lines[i]!.trim() && !FENCE.test(lines[i]!) && !HEADING.test(lines[i]!) && !BULLET.test(lines[i]!) && !NUMBERED.test(lines[i]!)) para.push(lines[i++]!)
    blocks.push({ kind: 'p', lines: para })
  }
  return blocks
}

export function ChatMarkdown({ text }: { text: string }) {
  return (
    <div className={styles.md}>
      {parseBlocks(text).map((b, n) => {
        if (b.kind === 'heading') return <p key={n}><strong>{inlineNodes(b.text, `h${n}`)}</strong></p>
        if (b.kind === 'ul') return <ul key={n}>{b.items.map((item, j) => <li key={j}>{inlineNodes(item, `u${n}-${j}`)}</li>)}</ul>
        if (b.kind === 'ol') return <ol key={n} start={b.start}>{b.items.map((item, j) => <li key={j}>{inlineNodes(item, `o${n}-${j}`)}</li>)}</ol>
        if (b.kind === 'code') return <pre key={n}><code>{b.lines.join('\n')}</code></pre>
        return <p key={n}>{b.lines.map((line, j) => <Fragment key={j}>{j > 0 ? <br /> : null}{inlineNodes(line, `p${n}-${j}`)}</Fragment>)}</p>
      })}
    </div>
  )
}

/** 工具名给老师看的说法（T15 走查第 5 条）：已知的备课工具用中文；帧里有名字但不认识的原样显示；没有名字时用中性的"处理步骤" */
export const TOOL_LABELS: Record<string, string> = {
  accept_course: '整课验收', accept_page: '逐页验收', approve_plan: '确认计划', audit_course: '整课审查', audit_page: '单页审查',
  export_pptx: '导出 PPTX', generate_page: '生成页面', list_courses: '查看课程', plan_course: '规划课程', prep_brief: '备课简报',
  read_course: '读取课程', rehearse: '试讲', render_page: '截图检查', repair_page: '修改页面', skill: '读取备课规范',
}
export const NEUTRAL_TOOL_LABEL = '处理步骤'
export const toolLabel = (name: string | undefined): string =>
  name ? (Object.prototype.hasOwnProperty.call(TOOL_LABELS, name) ? TOOL_LABELS[name]! : name) : NEUTRAL_TOOL_LABEL
