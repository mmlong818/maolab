import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import JSZip from 'jszip'
import { expect, test } from 'vitest'
import { pngSize } from '../src/png.ts'
import { buildProjectionPptx, xmlSafe } from '../src/pptx.ts'
import { solidPng } from './helpers/png.ts'

test('one full-slide 1920x1080 picture per page with the teacher script as notes', async () => {
  const pptx = await buildProjectionPptx({ title: '光的折射', slides: [{ png: solidPng(1920, 1080), notes: '第一页讲稿：先请学生观察。' }, { png: solidPng(1920, 1080, [20, 20, 20]), notes: '' }] })
  const zip = await JSZip.loadAsync(pptx)
  const names = Object.keys(zip.files)
  expect(names.filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toHaveLength(2)
  const media = names.filter((name) => /^ppt\/media\/.+\.png$/.test(name))
  expect(media.length).toBeGreaterThanOrEqual(1)
  for (const name of media) expect(pngSize(await zip.file(name)!.async('nodebuffer'))).toEqual({ width: 1920, height: 1080 })
  expect(await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string')).toContain('第一页讲稿：先请学生观察。')
  expect(await zip.file('ppt/slides/slide1.xml')!.async('string')).toContain('<a:off x="0" y="0"/>')
})

test('characters that XML 1.0 forbids are stripped from notes and title; tab, newline and carriage return stay (T8 c)', async () => {
  expect(xmlSafe('a\u0000b\u0001c\u0008d\u000Be\u000Cf\u000Eg\u001Fh\uFFFEi\uFFFFj')).toBe('abcdefghij')
  expect(xmlSafe('列\t一\n行\r二')).toBe('列\t一\n行\r二')
  expect(xmlSafe('孤\uD800立\uDC00代理')).toBe('孤立代理')
  expect(xmlSafe('表情😀保留')).toBe('表情😀保留')
  const pptx = await buildProjectionPptx({ title: '标题\u0007坏', slides: [{ png: solidPng(16, 9), notes: '讲稿\u0000第一\u001B句\n第二句' }] })
  const zip = await JSZip.loadAsync(pptx)
  const notes = await zip.file('ppt/notesSlides/notesSlide1.xml')!.async('string')
  const core = await zip.file('docProps/core.xml')!.async('string')
  // eslint-disable-next-line no-control-regex
  const illegal = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/
  expect(notes).not.toMatch(illegal)
  expect(core).not.toMatch(illegal)
  expect(notes).toContain('讲稿第一句')
  expect(core).toContain('标题坏')
})

test('builds under tsx, the runtime the worker actually starts with (pptxgenjs default export differs from vitest)', () => {
  const script = fileURLToPath(new URL('./helpers/pptx-under-tsx.ts', import.meta.url))
  const run = spawnSync(process.execPath, ['--import', 'tsx', script], { encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) })
  expect(run.stderr).toBe('')
  expect(run.status).toBe(0)
  expect(Number(run.stdout)).toBeGreaterThan(1000)
}, 60_000)
