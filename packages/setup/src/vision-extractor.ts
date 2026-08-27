import { z } from 'zod'

interface VisionLLMConfig {
  apiKey: string
  /** A vision-capable model name. Defaults differ by provider:
   *  - OpenAI: gpt-4o / gpt-4o-mini
   *  - DashScope OpenAI-compat: qwen-vl-max / qwen-vl-plus
   */
  model: string
  baseURL?: string
}

const PageSchema = z.object({
  text: z.string(),
  /** Headings detected on this page, in reading order */
  headings: z.array(z.string()).optional(),
  /** Visible formulas / equations, transcribed in LaTeX or plain math */
  formulas: z.array(z.string()).optional(),
  /** One-line descriptions of figures/diagrams */
  figures: z.array(z.string()).optional(),
  /** Subject matter / discipline tags, e.g. ["生物","细胞","有丝分裂"] */
  topicTags: z.array(z.string()).optional(),
})

export type ExtractedPage = z.infer<typeof PageSchema>

const SYSTEM_PROMPT = `You are an OCR-and-structure expert for textbook pages.

Given one image of a textbook page (or scan / photo), extract its content into JSON:
- text: the full readable text of the page, paragraph breaks preserved, in the source language
- headings: any chapter/section headings shown on the page, in reading order
- formulas: every visible formula / equation transcribed as LaTeX when possible, else plain math
- figures: one-line description for each illustration/diagram/table (do NOT skip — describe even rough sketches)
- topicTags: 2-6 canonical concept names this page teaches (used for retrieval)

Output STRICT JSON only, no markdown fences. If the image is not a textbook page,
return text:"" and leave other fields empty.

Rules:
- Preserve Chinese characters and standard scientific symbols exactly.
- Do NOT translate or paraphrase.
- Skip page numbers, headers, footers, and copyright notices.
- For multi-column layouts, read left-to-right column by column.`

/**
 * Send a single image (PNG / JPG / WEBP) to a vision-capable LLM and return
 * the extracted page structure.
 */
export async function extractFromImage(
  imageBuffer: Buffer,
  mimeType: string,
  cfg: VisionLLMConfig,
): Promise<ExtractedPage> {
  if (!cfg.apiKey) throw new Error('extractFromImage: apiKey required')
  const baseURL = (cfg.baseURL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')

  const base64 = imageBuffer.toString('base64')
  const dataUrl = `data:${mimeType};base64,${base64}`

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
          {
            role: 'user',
            content: [
              { type: 'text', text: '请提取这张教材页的内容,输出 JSON。' },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Vision API ${response.status}: ${body.slice(0, 200)}`)
  }
  const data = (await response.json()) as { choices: Array<{ message: { content: string } }> }
  const content = data.choices[0]?.message?.content
  if (!content) throw new Error('Vision API returned no content')

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error(`Vision API invalid JSON: ${content.slice(0, 200)}`)
  }
  return PageSchema.parse(parsed)
}

/**
 * Merge multiple page extractions into one flat text blob plus heading list,
 * suitable to hand to segmentDocument().
 */
export function joinPages(pages: ExtractedPage[]): {
  text: string
  headings: string[]
  topicTags: string[]
} {
  const text = pages
    .map((p, i) => {
      const head = p.headings?.length ? `\n### ${p.headings.join(' · ')}\n` : ''
      const body = p.text.trim()
      const formulas = p.formulas?.length ? `\n[公式]\n${p.formulas.join('\n')}` : ''
      const figures = p.figures?.length ? `\n[图示]\n${p.figures.join('\n')}` : ''
      return `=== 第 ${i + 1} 张 ===${head}\n${body}${formulas}${figures}`
    })
    .join('\n\n')
  const headings = pages.flatMap(p => p.headings ?? [])
  const topicTags = Array.from(new Set(pages.flatMap(p => p.topicTags ?? [])))
  return { text, headings, topicTags }
}
