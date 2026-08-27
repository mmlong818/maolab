import type { Deck, Slide, ThemeId } from './types'

export interface ParseOptions {
  theme?: ThemeId
  framework?: Deck['framework']
}

interface SlideDraft {
  heading: string
  eyebrow?: string
  bullets: string[]
  quote?: string
  source?: string
  paragraphs: string[]
}

export function parseMarkdownDeck(md: string, opts: ParseOptions = {}): Deck {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  let title = ''
  const drafts: SlideDraft[] = []
  let current: SlideDraft | null = null

  function flush() {
    if (current) drafts.push(current)
    current = { heading: '', bullets: [], paragraphs: [] }
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    if (line === '---') {
      flush()
      continue
    }

    if (line.startsWith('# ') && !title) {
      title = line.slice(2).trim()
      continue
    }

    if (line.startsWith('## ')) {
      flush()
      current!.heading = line.slice(3).trim()
      continue
    }

    if (line.startsWith('### ')) {
      if (!current) flush()
      current!.eyebrow = line.slice(4).trim()
      continue
    }

    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!current) flush()
      current!.bullets.push(line.slice(2).trim())
      continue
    }

    if (line.startsWith('> ')) {
      if (!current) flush()
      current!.quote = line.slice(2).trim()
      continue
    }

    if (line.startsWith('-- ')) {
      if (!current) flush()
      current!.source = line.replace(/^--\s*/, '').trim()
      continue
    }

    if (!current) flush()
    current!.paragraphs.push(line)
  }
  flush()

  const slides = drafts
    .filter(d => d.heading || d.bullets.length || d.quote || d.paragraphs.length)
    .map((draft, index) => inferLayout(draft, index, title))

  return {
    title: title || 'Untitled deck',
    theme: opts.theme ?? 'modern-minimal',
    framework: opts.framework ?? 'duarte',
    brief: {
      topic: title,
      audience: '',
      goal: '',
      durationMin: Math.max(5, slides.length * 2),
    },
    script: [],
    createdAt: new Date().toISOString(),
    slides,
  }
}

function withEyebrow<T extends Slide>(slide: T, eyebrow?: string): T {
  if (eyebrow) slide.eyebrow = eyebrow
  return slide
}

function inferLayout(draft: SlideDraft, index: number, deckTitle: string): Slide {
  if (draft.quote) {
    return withEyebrow({
      type: 'quote',
      quote: draft.quote,
      source: draft.source ?? '',
    }, draft.eyebrow)
  }

  if (draft.bullets.length >= 6) {
    return withEyebrow({
      type: 'checklist',
      heading: draft.heading || 'Checklist',
      items: draft.bullets,
    }, draft.eyebrow)
  }

  if (draft.bullets.length >= 2) {
    return withEyebrow({
      type: 'argument',
      heading: draft.heading || 'Argument',
      points: draft.bullets,
    }, draft.eyebrow)
  }

  if (index === 0 && draft.heading) {
    const slide: Slide = {
      type: 'cover',
      title: draft.heading || deckTitle,
    }
    if (draft.paragraphs[0]) slide.subtitle = draft.paragraphs[0]
    return withEyebrow(slide, draft.eyebrow)
  }

  if (draft.heading && draft.paragraphs.length === 0) {
    return {
      type: 'statement',
      title: draft.heading,
    }
  }

  return {
    type: 'statement',
    title: draft.heading || draft.paragraphs.join(' '),
  }
}
