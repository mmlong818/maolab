/**
 * maolab atoms → presgen slides 适配器
 *
 * 把 maolab CourseV2 的 atom 序列转换成 presgen 的幻灯片数组,
 * 让一节课可以"以演讲形式"播放/导出 PPTX。
 *
 * 互动型 atom (single-question) 在演讲态默认转 quote(展示题干, 不期待作答),
 * 也可由调用方选择跳过。
 */

import type { Slide, LayoutType } from './types.js'

interface MaolabAtomLike {
  id: string
  type: string
  payload: Record<string, unknown>
}

interface MaolabCourseLike {
  id: string
  title: string
  atoms?: MaolabAtomLike[]
  teachingPlan?: {
    objectives?: { id: string; statement: string }[]
  }
}

export interface AdaptOptions {
  /** 互动题(single-question)处理:'skip' 跳过 | 'show-stem' 转 quote 展示题干 */
  interactiveAtoms?: 'skip' | 'show-stem'
}

export function atomsToSlides(course: MaolabCourseLike, opts: AdaptOptions = {}): Slide[] {
  const interactive = opts.interactiveAtoms ?? 'show-stem'
  const slides: Slide[] = []

  // 封面
  slides.push({
    type: 'cover',
    eyebrow: '一节课',
    title: course.title,
    subtitle: '由 maolab 生成',
  } as Slide)

  // 目标 (intro)
  const objs = course.teachingPlan?.objectives ?? []
  if (objs.length > 0) {
    slides.push({
      type: 'checklist',
      eyebrow: '本节目标',
      heading: '今天你将能够',
      items: objs.slice(0, 5).map(o => o.statement.replace(/^学生(能|会)?/, '你能')),
    } as Slide)
  }

  // 逐 atom 转换
  for (const a of course.atoms ?? []) {
    const slide = atomToSlide(a, interactive)
    if (slide) slides.push(slide)
  }

  return slides
}

function atomToSlide(atom: MaolabAtomLike, interactive: 'skip' | 'show-stem'): Slide | null {
  const p = atom.payload
  switch (atom.type) {
    case 'image-caption': {
      return {
        type: 'quote',
        text: String(p.caption ?? ''),
        attribution: '',
        imageUrl: String(p.imageUrl ?? ''),
      } as unknown as Slide
    }
    case 'single-claim':
      return {
        type: 'statement',
        title: String(p.claim ?? ''),
        highlight: p.support ? [String(p.support).slice(0, 12)] : [],
      } as Slide
    case 'single-example':
      return {
        type: 'argument',
        heading: String(p.title ?? '案例'),
        body: String(p.body ?? ''),
      } as unknown as Slide
    case 'single-question': {
      if (interactive === 'skip') return null
      const opts = (p.options as string[] | undefined) ?? []
      return {
        type: 'quote',
        text: String(p.stem ?? ''),
        attribution: opts.length > 0 ? opts.map((o, i) => `${String.fromCharCode(65 + i)}. ${o}`).join('  ') : '',
      } as unknown as Slide
    }
    case 'dialogue-turn':
      return {
        type: 'quote',
        text: String(p.line ?? ''),
        attribution: String(p.speaker === 'teacher' ? '老师' : p.speaker === 'student' ? '同学' : '旁白'),
      } as unknown as Slide
    case 'derivation-step':
      return {
        type: 'process',
        eyebrow: '推导',
        heading: String(p.motivation ?? '一步推导'),
        steps: [
          { title: '动机', desc: String(p.motivation ?? '') },
          { title: '表达式', desc: String(p.expression ?? '') },
          { title: '依据', desc: String(p.justification ?? '') },
        ],
      } as Slide
    case 'demonstration':
      return {
        type: 'argument',
        heading: '演示',
        body: String(p.narration ?? ''),
        imageUrl: String(p.imageUrl ?? ''),
      } as unknown as Slide
    case 'recap-bullet':
      return {
        type: 'statement',
        title: String(p.bullet ?? ''),
        align: 'left',
      } as unknown as Slide
    default:
      return null
  }
}

export type SlideType = LayoutType
