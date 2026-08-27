import type { OutlineItem, TeachingPlan, DocumentChapter } from '@maolab/shared-types'

interface Scored {
  chapter: DocumentChapter
  documentFilename: string
  score: number
}

/**
 * Pick the single most relevant chapter from any uploaded document for a given
 * outline item. Scoring is a lightweight bag-of-tokens overlap between the
 * item's signals (title + objective + concepts) and the chapter's signals
 * (title + concepts + a small slice of body text). The threshold is
 * deliberately low so any plausibly related chapter is returned; the chapter
 * text is informative even with a weak match.
 *
 * Returns undefined when the plan has no documents or no chapter scores above 0.
 */
export function findRelevantChapter(
  item: OutlineItem,
  plan: TeachingPlan,
): { chapter: DocumentChapter; documentFilename: string } | undefined {
  const docs = plan.sourceDocuments
  if (!docs || docs.length === 0) return undefined

  const itemTokens = tokenize(
    [item.title, item.objective, ...(item.concepts ?? [])].join(' '),
  )
  if (itemTokens.size === 0) return undefined

  let best: Scored | undefined
  for (const doc of docs) {
    if (!doc.chapters) continue
    for (const ch of doc.chapters) {
      const chapterTokens = tokenize(
        [ch.title, ...(ch.concepts ?? [])].join(' '),
      )
      const titleOverlap = countOverlap(itemTokens, chapterTokens)
      // Also peek at first 1000 chars of body text for a secondary signal
      const bodyTokens = tokenize(ch.text.slice(0, 1000))
      const bodyOverlap = countOverlap(itemTokens, bodyTokens)
      const score = titleOverlap * 5 + bodyOverlap
      if (score > 0 && (!best || score > best.score)) {
        best = { chapter: ch, documentFilename: doc.filename, score }
      }
    }
  }

  if (!best) return undefined
  return { chapter: best.chapter, documentFilename: best.documentFilename }
}

/**
 * Format the chapter as a Chinese reference-material block ready to splice
 * into a worker's user prompt. Returns an empty string when nothing relevant
 * is found, so callers can unconditionally concatenate.
 */
export function buildReferenceMaterial(item: OutlineItem, plan: TeachingPlan): string {
  const found = findRelevantChapter(item, plan)
  if (!found) return ''
  const { chapter, documentFilename } = found
  const excerpt = chapter.text.slice(0, 1800).trim()
  const pageRange = chapter.pageStart
    ? chapter.pageEnd && chapter.pageEnd !== chapter.pageStart
      ? `,第 ${chapter.pageStart}-${chapter.pageEnd} 页`
      : `,第 ${chapter.pageStart} 页`
    : ''
  return `

【参考课本节选】
来源:《${documentFilename}》${pageRange}
章节标题:${chapter.title}${chapter.concepts?.length ? `(关键概念:${chapter.concepts.join('、')})` : ''}

${excerpt}

请在生成内容时尽量贴近上述课本表述与术语,但不要简单复述 — 把课本的事实/概念用最适合本场景类型的形式呈现。`
}

function tokenize(text: string): Set<string> {
  if (!text) return new Set()
  // Chinese: split into 2-char rolling shingles plus single CJK chars >= length 2.
  // Western: split on whitespace + lowercase.
  const out = new Set<string>()
  const ascii = text.toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g)
  if (ascii) for (const w of ascii) out.add(w)
  const cjk = text.match(/[一-鿿]+/g)
  if (cjk) {
    for (const run of cjk) {
      if (run.length === 1) continue
      // emit each 2-char shingle (good signal for technical compound words)
      for (let i = 0; i < run.length - 1; i++) {
        out.add(run.slice(i, i + 2))
      }
      // and emit 3-char shingles for stronger phrases
      for (let i = 0; i < run.length - 2; i++) {
        out.add(run.slice(i, i + 3))
      }
    }
  }
  return out
}

function countOverlap(a: Set<string>, b: Set<string>): number {
  let n = 0
  for (const t of a) if (b.has(t)) n++
  return n
}
