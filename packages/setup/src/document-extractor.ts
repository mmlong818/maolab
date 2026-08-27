import { z } from 'zod'
import type { DocumentChapter } from '@maolab/shared-types'

interface LLMConfig {
  apiKey: string
  model: string
  baseURL?: string
}

const ChapterSchema = z.object({
  title: z.string().min(1),
  startPage: z.number().int().min(1).optional(),
  endPage: z.number().int().min(1).optional(),
  concepts: z.array(z.string().min(1)).optional(),
})

const SegmentationSchema = z.object({
  chapters: z.array(ChapterSchema).min(1).max(40),
  summary: z.string().min(1).max(600),
})

const SYSTEM_PROMPT = `You are an educational content librarian. Given the plain text of an
uploaded textbook or teaching material, identify its natural chapter / section
structure so it can be used as a knowledge source for course generation.

Output STRICT JSON only, no markdown fences. Schema:
{
  "chapters": [
    {
      "title": "string — chapter or section title in the source language",
      "startPage": number (optional, 1-based),
      "endPage": number (optional, 1-based),
      "concepts": ["string", ...]  // 2-6 canonical concept names per chapter
    }
  ],
  "summary": "string — one-paragraph summary of the whole document (≤ 200 chars)"
}

Rules:
- Detect at most 40 top-level chapters/sections. Skip table-of-contents,
  preface, copyright, and index — only segment the substantive body.
- Use the heading exactly as it appears (do not paraphrase).
- For each chapter, list 2-6 canonical concept names that this chapter teaches
  (these are used as retrieval tags). Prefer single-noun-phrase names.
- Page numbers are optional but useful when reliably visible in the text.`

interface SegmentationResult {
  chapters: DocumentChapter[]
  summary: string
}

/**
 * Ask the configured LLM to segment a long extracted text into chapters.
 * Inserts each chapter's portion of the source text back into the returned list
 * by approximating the page → text span when page ranges are present, or by
 * slicing the text evenly when they are not.
 */
export async function segmentDocument(
  fullText: string,
  pageCount: number | undefined,
  cfg: LLMConfig,
): Promise<SegmentationResult> {
  if (!cfg.apiKey) throw new Error('segmentDocument: LLM apiKey required')
  const baseURL = (cfg.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')

  // The LLM only sees a trimmed slice — keep cost in check on large books.
  const trimmed = trimForLLM(fullText, 60_000)
  const userPrompt = pageCount
    ? `Source has ${pageCount} pages and ${fullText.length} characters.\n\nText (trimmed when needed):\n${trimmed}`
    : `Source has ${fullText.length} characters.\n\nText:\n${trimmed}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120_000)
  let response: Response
  try {
    response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }
  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`segmentDocument: LLM ${response.status}: ${body.slice(0, 200)}`)
  }
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('segmentDocument: empty LLM response')
  const parsed = JSON.parse(content) as unknown
  const validated = SegmentationSchema.parse(parsed)

  // Slice the source text per chapter so each carries its own readable excerpt.
  const chapters: DocumentChapter[] = validated.chapters.map((c, idx) => {
    const slice = sliceTextForChapter(fullText, validated.chapters.length, idx)
    const chapter: DocumentChapter = {
      index: idx,
      title: c.title,
      text: slice,
    }
    if (c.startPage !== undefined) chapter.pageStart = c.startPage
    if (c.endPage !== undefined) chapter.pageEnd = c.endPage
    if (c.concepts && c.concepts.length) chapter.concepts = c.concepts
    return chapter
  })
  return { chapters, summary: validated.summary }
}

function trimForLLM(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  // Keep head + tail, drop the middle (works well for textbooks with TOC up top)
  const headLen = Math.floor(maxChars * 0.75)
  const tailLen = maxChars - headLen
  return text.slice(0, headLen) + '\n\n…(中间内容已省略,正文太长)…\n\n' + text.slice(text.length - tailLen)
}

function sliceTextForChapter(fullText: string, totalChapters: number, index: number): string {
  if (totalChapters === 0) return ''
  const per = Math.floor(fullText.length / totalChapters)
  const start = index * per
  const end = index === totalChapters - 1 ? fullText.length : (index + 1) * per
  return fullText.slice(start, end).slice(0, 8000) // cap per-chapter text
}
