// 逐页截图型 PPTX（用户 2026-08-25 裁决，maolab export 路由原样）：16:9 版式、每页一张满版图、讲稿写进备注。
import PptxGenJSImport from 'pptxgenjs'

// pptxgenjs 没有声明 "type": "module"：vitest 下默认导出是构造函数，tsx（worker 的真实运行时）下是 { default: 构造函数 }。两种都认。
const PptxGenJS: typeof PptxGenJSImport = (PptxGenJSImport as unknown as { default?: typeof PptxGenJSImport }).default ?? PptxGenJSImport

// T8 (c)：XML 1.0 不允许的字符（\t \n \r 以外的 C0 控制字符、U+FFFE/U+FFFF、孤立代理项）会让 PowerPoint 判文件损坏；
// 讲稿和标题可能来自模型输出，写进 pptx 前去掉
// eslint-disable-next-line no-control-regex
const XML_ILLEGAL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
export const xmlSafe = (text: string): string => text.replace(XML_ILLEGAL, '')

export async function buildProjectionPptx(input: { title: string; slides: Array<{ png: Buffer; notes: string }> }): Promise<Buffer> {
  const pptx = new PptxGenJS()
  pptx.defineLayout({ name: 'STAGE_16x9', width: 13.333, height: 7.5 })
  pptx.layout = 'STAGE_16x9'
  pptx.title = xmlSafe(input.title)
  for (const page of input.slides) {
    const slide = pptx.addSlide()
    slide.addImage({ data: `image/png;base64,${page.png.toString('base64')}`, x: 0, y: 0, w: 13.333, h: 7.5 })
    const notes = xmlSafe(page.notes).trim()
    if (notes) slide.addNotes(notes)
  }
  return (await pptx.write({ outputType: 'nodebuffer' })) as Buffer
}
