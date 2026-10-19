// 2026-10-19 体验反馈：Tailwind 的基础样式去掉了按钮、输入框、下拉框的默认外观，备课页的按钮看起来和文字一样。
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const read = (p: string) => readFileSync(resolve(import.meta.dirname, '..', '..', '..', p), 'utf8')
const css = read('app/prep/prep.module.css')

test('prep page restores visible borders for buttons, inputs and selects', () => {
  expect(css).toMatch(/\.shell :where\(button\) \{[^}]*border: 1px solid/)
  expect(css).toMatch(/\.shell :where\(button\):disabled \{[^}]*cursor: not-allowed/)
  expect(css).toMatch(/\.shell :where\(input[^{]*select[^{]*\) \{[^}]*border: 1px solid/)
  expect(css).toMatch(/\.primary \{[^}]*color: #fff/)
})

test('the main action on each step uses the primary button style', () => {
  for (const [file, label] of [
    ['app/prep/panel/CourseList.tsx', '选知识点建课'],
    ['app/prep/panel/KpPicker.tsx', '个知识点建课'],
    ['app/prep/panel/PlanView.tsx', '确认计划'],
    ['app/prep/panel/AcceptanceView.tsx', 'acceptCourse'],
    ['app/prep/panel/ExportView.tsx', '导出</button>'],
    ['app/prep/panel/PackageView.tsx', 'packageExportLabel(packages)'],
    ['app/prep/chat/PrepChat.tsx', '发送</button>'],
  ] as const) {
    const line = read(file).split('\n').find((l) => l.includes(label) && l.includes('<button'))
    expect([file, line]).toEqual([file, expect.stringContaining('className={styles.primary}')])
  }
})

test('the page directory and course list have their own styles', () => {
  expect(css).toMatch(/\.pageTree \{/)
  expect(css).toMatch(/\.pageTree \.pageTreeActive \{/)
  expect(read('app/prep/panel/CourseList.tsx')).toContain('className={styles.linkButton} onClick={() => onSelect(c.courseId)}')
})
