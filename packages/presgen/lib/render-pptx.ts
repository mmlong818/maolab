// ─── mainline deck → 真实 PPTX 二进制 ─────────────────────────────────────────
//
// presgen 包原有的 23 版式 × 45 主题体系是为"渲染由 PPTist iframe 接管"设计的
// (见 lib/layouts/registry.ts 顶部注释),PPTist/pptx-service 从未落地进本仓库,
// 全仓库过去也没有任何代码真正调用 pptxgenjs 产出过 .pptx 二进制。
//
// mainline 导出只需要 adapt-from-mainline.ts 产出的三种版式(cover/checklist/
// argument),因此本文件只为这三种实现真实的 pptxgenjs 渲染 —— 不是重建整套
// 23 版式引擎,范围显式收窄到 mainline 导出场景。未覆盖的版式退化为纯标题页,
// 保证不中断导出(而不是抛错)。

import pptxgen from 'pptxgenjs'
import { THEMES } from './themes.js'
import type { ArgumentSlide, ChecklistSlide, CoverSlide, Slide } from './types.js'
import type { MainlineDeck } from './adapt-from-mainline.js'

type PptxSlide = ReturnType<InstanceType<typeof pptxgen>['addSlide']>

const THEME = THEMES['modern-minimal']
const hex = (c: string) => c.replace('#', '')

/** 内容安全区(呼应课堂舞台 1920×1080 · 左右96/上72/下96 的比例换算到 13.333×7.5 英寸画布)。 */
const PAGE_W = 13.333
const PAGE_H = 7.5
const MARGIN_X = 0.8
const CONTENT_TOP = 0.7

export async function renderMainlinePptx(deck: MainlineDeck): Promise<Buffer> {
  const pptx = new pptxgen()
  pptx.layout = 'LAYOUT_WIDE'
  pptx.title = deck.title

  const notesBySlide = new Map(deck.notes.map(n => [n.slideIndex, n.text]))

  deck.slides.forEach((slide, i) => {
    const slideIndex = i + 1
    const pSlide = pptx.addSlide()
    pSlide.background = { color: hex(THEME.bg) }
    const notes = notesBySlide.get(slideIndex)
    if (notes) pSlide.addNotes(notes)
    renderSlide(pSlide, slide, deck.images[slideIndex])
  })

  const out = await pptx.write({ outputType: 'nodebuffer' })
  return out as Buffer
}

function renderSlide(pSlide: PptxSlide, slide: Slide, imagePath?: string): void {
  if (slide.type === 'cover') return renderCover(pSlide, slide)
  if (slide.type === 'checklist') return renderChecklist(pSlide, slide, imagePath)
  if (slide.type === 'argument') return renderArgument(pSlide, slide, imagePath)
  // 兜底:mainline 导出不产出其余版式,出现即视为上游异常,降级为标题页而非中断。
  pSlide.addText(slide.type, { x: MARGIN_X, y: CONTENT_TOP, w: PAGE_W - MARGIN_X * 2, h: 1, fontSize: 32, color: hex(THEME.text) })
}

function renderCover(pSlide: PptxSlide, slide: CoverSlide): void {
  pSlide.addText(slide.eyebrow ?? '', {
    x: MARGIN_X, y: 2.2, w: PAGE_W - MARGIN_X * 2, h: 0.5,
    fontSize: 16, color: hex(THEME.accent), bold: true, charSpacing: 2,
  })
  pSlide.addText(slide.title, {
    x: MARGIN_X, y: 2.8, w: PAGE_W - MARGIN_X * 2, h: 1.6,
    fontSize: 40, color: hex(THEME.text), bold: true, fontFace: 'Microsoft YaHei',
  })
  if (slide.subtitle) {
    pSlide.addText(slide.subtitle, {
      x: MARGIN_X, y: 4.5, w: PAGE_W - MARGIN_X * 2, h: 0.6,
      fontSize: 18, color: hex(THEME.muted),
    })
  }
}

function renderChecklist(pSlide: PptxSlide, slide: ChecklistSlide, imagePath?: string): void {
  const textW = imagePath ? PAGE_W * 0.5 - MARGIN_X : PAGE_W - MARGIN_X * 2
  addHeading(pSlide, slide.eyebrow, slide.heading, textW)
  const bullets = slide.items.map(item => ({ text: item, options: { bullet: { code: '25AA' }, breakLine: true } }))
  pSlide.addText(bullets, {
    x: MARGIN_X, y: CONTENT_TOP + 1.3, w: textW, h: PAGE_H - CONTENT_TOP - 1.6,
    fontSize: 20, color: hex(THEME.text), lineSpacing: 32, valign: 'top',
  })
  if (imagePath) addSideImage(pSlide, imagePath)
}

function renderArgument(pSlide: PptxSlide, slide: ArgumentSlide, imagePath?: string): void {
  const textW = imagePath ? PAGE_W * 0.5 - MARGIN_X : PAGE_W - MARGIN_X * 2
  addHeading(pSlide, slide.eyebrow, slide.heading, textW)
  const bullets = slide.points.map(point => ({ text: point, options: { bullet: { code: '2022' }, breakLine: true } }))
  pSlide.addText(bullets, {
    x: MARGIN_X, y: CONTENT_TOP + 1.3, w: textW, h: PAGE_H - CONTENT_TOP - 1.6,
    fontSize: 22, color: hex(THEME.text), lineSpacing: 34, valign: 'top',
  })
  if (imagePath) addSideImage(pSlide, imagePath)
}

function addHeading(pSlide: PptxSlide, eyebrow: string | undefined, heading: string, textW: number): void {
  if (eyebrow) {
    pSlide.addText(eyebrow, {
      x: MARGIN_X, y: CONTENT_TOP, w: textW, h: 0.4,
      fontSize: 14, color: hex(THEME.accent), bold: true, charSpacing: 1.5,
    })
  }
  pSlide.addText(heading, {
    x: MARGIN_X, y: CONTENT_TOP + (eyebrow ? 0.45 : 0), w: textW, h: 0.9,
    fontSize: 26, color: hex(THEME.text), bold: true, fontFace: 'Microsoft YaHei',
  })
}

function addSideImage(pSlide: PptxSlide, imagePath: string): void {
  const w = PAGE_W * 0.5 - MARGIN_X * 0.5
  const h = w // 由 pptxgenjs sizing:'contain' 保持原图比例,不裁切变形
  pSlide.addImage({
    path: imagePath,
    x: PAGE_W - MARGIN_X - w, y: (PAGE_H - h) / 2, w, h,
    sizing: { type: 'contain', w, h },
  })
}
