import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { validatedGenerate } from '../llm/validated-generate.js'
import { buildPrompt, PROMPT_IDS } from '../prompts/loader.js'
import { buildReferenceMaterial } from '../pipeline/find-chapter.js'
import type { ContentWorker } from './types.js'
import type { Scene, OutlineItem, KnowledgeProfile, TeachingPlan } from '@maolab/shared-types'
import type { RetryOptions } from '../llm/validated-generate.js'

const SlideStatSchema = z.object({
  value: z.string().min(1),
  label: z.string().min(1),
  source: z.string().optional(),
})

const SlideColumnSchema = z.object({
  title: z.string().min(1),
  items: z.array(z.string().min(1)).min(1).max(6),
})

const SlideTimelineEventSchema = z.object({
  time: z.string().min(1),
  title: z.string().min(1),
  desc: z.string().optional(),
})

const SlideTableColumnSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  align: z.enum(['left', 'right', 'center']).optional(),
})

const SlideTableRowSchema = z.object({
  cells: z.record(z.string(), z.string()),
  emphasis: z.boolean().optional(),
})

const SlideCausalLinkSchema = z.object({
  cause: z.string().min(1),
  because: z.string().optional(),
})

const SlideMatrixCellSchema = z.object({
  label: z.string().min(1),
  desc: z.string().optional(),
  emphasis: z.boolean().optional(),
})

const SlideMatrixAxesSchema = z.object({
  x: z.object({ low: z.string(), high: z.string() }),
  y: z.object({ low: z.string(), high: z.string() }),
})

const SlideQuoteSchema = z.object({
  text: z.string().min(1),
  source: z.string().min(1),
  highlight: z.string().optional(),
})

interface RawMatrixCell {
  label: string
  desc?: string | undefined
  emphasis?: boolean | undefined
}

function mapMatrixCell(cell: RawMatrixCell) {
  return {
    label: cell.label,
    ...(cell.desc !== undefined ? { desc: cell.desc } : {}),
    ...(cell.emphasis !== undefined ? { emphasis: cell.emphasis } : {}),
  }
}

const SlideCaseResultSchema = z.object({
  metric: z.string().min(1),
  value: z.string().min(1),
  delta: z.string().optional(),
})

const SlideKpiSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  delta: z.string().optional(),
  deltaTone: z.enum(['pos', 'neg', 'flat']).optional(),
  hint: z.string().optional(),
})

const SlidePersonaAttrSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
})

const SlideChartBarSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
  note: z.string().optional(),
})

const SlideRoadmapMilestoneSchema = z.object({
  period: z.string().min(1),
  span: z.number().int().positive().optional(),
  label: z.string().min(1),
  emphasis: z.boolean().optional(),
})

const SlideRoadmapLaneSchema = z.object({
  name: z.string().min(1),
  items: z.array(SlideRoadmapMilestoneSchema).min(1),
})

const SlideQuadrantAxesSchema = z.object({
  x: z.object({ label: z.string(), low: z.string(), high: z.string() }),
  y: z.object({ label: z.string(), low: z.string(), high: z.string() }),
})

const SlideQuadrantPointSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  gridX: z.number().int().min(0).max(4),
  gridY: z.number().int().min(0).max(4),
})

const SlideOutputSchema = z.object({
  slides: z.array(z.object({
    layout: z.enum([
      'formula', 'bullets', 'compare', 'statement', 'summary', 'process',
      'cover', 'argument', 'data', 'checklist',
      'timeline', 'quote', 'table', 'causality', 'question', 'matrix-2x2',
      'case-study', 'kpi-board', 'persona', 'chart-bar', 'roadmap', 'quadrant', 'cta', 'diagram',
    ]).optional(),
    title: z.string().min(1),
    body: z.string().min(0),
    steps: z.array(z.string()).optional(),
    speakerNote: z.string(),
    visualHint: z.string(),
    eyebrow: z.string().optional(),
    highlight: z.string().optional(),
    highlights: z.array(z.string()).optional(),
    subtitle: z.string().optional(),
    points: z.array(z.string()).optional(),
    stats: z.array(SlideStatSchema).optional(),
    left: SlideColumnSchema.optional(),
    right: SlideColumnSchema.optional(),
    events: z.array(SlideTimelineEventSchema).optional(),
    quote: SlideQuoteSchema.optional(),
    columns: z.array(SlideTableColumnSchema).optional(),
    rows: z.array(SlideTableRowSchema).optional(),
    highlightColumn: z.string().optional(),
    chain: z.array(SlideCausalLinkSchema).optional(),
    conclusion: z.string().optional(),
    question: z.string().optional(),
    hints: z.array(z.string()).optional(),
    invitation: z.string().optional(),
    axes: SlideMatrixAxesSchema.optional(),
    cells: z.array(SlideMatrixCellSchema).optional(),
    takeaway: z.string().optional(),
    // case-study
    client: z.string().optional(),
    clientMeta: z.string().optional(),
    context: z.string().optional(),
    challenge: z.string().optional(),
    approach: z.string().optional(),
    results: z.array(SlideCaseResultSchema).optional(),
    quoteAttribution: z.string().optional(),
    // kpi-board
    period: z.string().optional(),
    kpis: z.array(SlideKpiSchema).optional(),
    // persona
    personaName: z.string().optional(),
    role: z.string().optional(),
    attributes: z.array(SlidePersonaAttrSchema).optional(),
    needs: z.array(z.string()).optional(),
    pains: z.array(z.string()).optional(),
    // chart-bar
    unit: z.string().optional(),
    bars: z.array(SlideChartBarSchema).optional(),
    source: z.string().optional(),
    // roadmap
    periods: z.array(z.string()).optional(),
    lanes: z.array(SlideRoadmapLaneSchema).optional(),
    legend: z.string().optional(),
    // quadrant
    scatterAxes: SlideQuadrantAxesSchema.optional(),
    quadrantPoints: z.array(SlideQuadrantPointSchema).optional(),
    highlightPoint: z.string().optional(),
    // cta
    oldQuestion: z.string().optional(),
    newAction: z.string().optional(),
    // diagram
    hint: z.string().optional(),
  })).min(1).refine(
    slides => slides.every(s => {
      if (s.layout === 'statement' && s.title.length > 60) return false
      if (s.layout === 'cover' && s.title.length > 50) return false
      if (s.layout === 'process') return Array.isArray(s.steps) && s.steps.length >= 2
      if (s.layout === 'argument') return Array.isArray(s.points) && s.points.length >= 2
      if (s.layout === 'checklist') return Array.isArray(s.points) && s.points.length >= 2
      if (s.layout === 'data') return Array.isArray(s.stats) && s.stats.length >= 1 && s.stats.length <= 3
      if (s.layout === 'compare') return !!(s.left && s.right)
      if (s.layout === 'timeline') return Array.isArray(s.events) && s.events.length >= 3 && s.events.length <= 6
      if (s.layout === 'quote') return !!s.quote && !!s.quote.text && !!s.quote.source
      if (s.layout === 'table') return Array.isArray(s.columns) && s.columns.length >= 2 && Array.isArray(s.rows) && s.rows.length >= 2
      if (s.layout === 'causality') return Array.isArray(s.chain) && s.chain.length >= 3 && s.chain.length <= 5
      if (s.layout === 'question') return !!s.question && /[?？]\s*$/.test(s.question)
      if (s.layout === 'matrix-2x2') return Array.isArray(s.cells) && s.cells.length === 4 && !!s.axes
      if (s.layout === 'case-study') return !!s.client && !!s.context && !!s.challenge && !!s.approach && Array.isArray(s.results) && s.results.length >= 1
      if (s.layout === 'kpi-board') return Array.isArray(s.kpis) && (s.kpis.length === 4 || s.kpis.length === 6)
      if (s.layout === 'persona') return !!s.personaName && !!s.role
      if (s.layout === 'chart-bar') return Array.isArray(s.bars) && s.bars.length >= 4 && s.bars.length <= 8 && !!s.unit
      if (s.layout === 'roadmap') return Array.isArray(s.periods) && s.periods.length >= 3 && Array.isArray(s.lanes) && s.lanes.length >= 2
      if (s.layout === 'quadrant') return !!s.scatterAxes && Array.isArray(s.quadrantPoints) && s.quadrantPoints.length >= 5 && s.quadrantPoints.length <= 10
      if (s.layout === 'cta') return !!s.newAction
      if (s.layout === 'diagram') return !!s.hint
      return true
    }),
    { message: 'layout-specific required fields missing or title too long (statement ≤60 chars / cover ≤50 chars / see slide-worker per-layout rules)' },
  ),
  conceptIds: z.array(z.string()),
})

export class SlideWorker implements ContentWorker {
  readonly type = 'slide' as const

  constructor(
    private readonly callLLM: (userPrompt: string, systemPrompt?: string) => Promise<string>,
    private readonly retryOptions: RetryOptions = { maxRetries: 3, baseDelay: 0 },
  ) {}

  async generate(item: OutlineItem, profile: KnowledgeProfile, plan: TeachingPlan): Promise<Scene> {
    const objectivesText = item.learningObjectives && item.learningObjectives.length > 0
      ? item.learningObjectives.map((o, i) => `${i + 1}. ${o}`).join('\n')
      : item.objective

    const { system, user } = buildPrompt(PROMPT_IDS.SLIDE, {
      title: item.title,
      objective: item.objective,
      durationHint: String(item.durationHint),
      gradeLevel: plan.gradeLevel ?? 'not specified',
      learningObjectives: objectivesText,
      topic: profile.topic,
      domain: profile.domain,
      difficulty: profile.difficulty,
      coreConcepts: profile.coreConcepts.map(c => `${c.name}: ${c.desc}`).join('; '),
      analogies: profile.analogies.join('; '),
      narrativeHooks: profile.narrativeHooks.join('; '),
      teachingMethod: plan.teachingMethod,
      language: plan.language,
    })

    const reference = buildReferenceMaterial(item, plan)
    const finalUser = reference ? user + reference : user

    const boundCall = (prompt: string) => this.callLLM(prompt, system)
    const output = await validatedGenerate(finalUser, SlideOutputSchema, boundCall, this.retryOptions)

    return {
      id: randomUUID(),
      outlineItemId: item.id,
      type: 'slide',
      title: item.title,
      content: {
        type: 'slide',
        slides: output.slides.map(s => ({
          title: s.title,
          body: s.body,
          speakerNote: s.speakerNote,
          visualHint: s.visualHint,
          ...(s.layout !== undefined ? { layout: s.layout } : {}),
          ...(s.steps !== undefined ? { steps: s.steps } : {}),
          ...(s.eyebrow !== undefined ? { eyebrow: s.eyebrow } : {}),
          ...(s.highlight !== undefined ? { highlight: s.highlight } : {}),
          ...(s.highlights !== undefined ? { highlights: s.highlights } : {}),
          ...(s.subtitle !== undefined ? { subtitle: s.subtitle } : {}),
          ...(s.points !== undefined ? { points: s.points } : {}),
          ...(s.stats !== undefined
            ? {
                stats: s.stats.map(st => ({
                  value: st.value,
                  label: st.label,
                  ...(st.source !== undefined ? { source: st.source } : {}),
                })),
              }
            : {}),
          ...(s.left !== undefined ? { left: s.left } : {}),
          ...(s.right !== undefined ? { right: s.right } : {}),
          ...(s.events !== undefined
            ? {
                events: s.events.map(ev => ({
                  time: ev.time,
                  title: ev.title,
                  ...(ev.desc !== undefined ? { desc: ev.desc } : {}),
                })),
              }
            : {}),
          ...(s.quote !== undefined
            ? {
                quote: {
                  text: s.quote.text,
                  source: s.quote.source,
                  ...(s.quote.highlight !== undefined ? { highlight: s.quote.highlight } : {}),
                },
              }
            : {}),
          ...(s.columns !== undefined
            ? {
                columns: s.columns.map(col => ({
                  id: col.id,
                  label: col.label,
                  ...(col.align !== undefined ? { align: col.align } : {}),
                })),
              }
            : {}),
          ...(s.rows !== undefined
            ? {
                rows: s.rows.map(r => ({
                  cells: r.cells,
                  ...(r.emphasis !== undefined ? { emphasis: r.emphasis } : {}),
                })),
              }
            : {}),
          ...(s.highlightColumn !== undefined ? { highlightColumn: s.highlightColumn } : {}),
          ...(s.chain !== undefined
            ? {
                chain: s.chain.map(link => ({
                  cause: link.cause,
                  ...(link.because !== undefined ? { because: link.because } : {}),
                })),
              }
            : {}),
          ...(s.conclusion !== undefined ? { conclusion: s.conclusion } : {}),
          ...(s.question !== undefined ? { question: s.question } : {}),
          ...(s.hints !== undefined ? { hints: s.hints } : {}),
          ...(s.invitation !== undefined ? { invitation: s.invitation } : {}),
          ...(s.axes !== undefined ? { axes: s.axes } : {}),
          ...(s.cells !== undefined && s.cells.length === 4
            ? {
                cells: [
                  mapMatrixCell(s.cells[0]!),
                  mapMatrixCell(s.cells[1]!),
                  mapMatrixCell(s.cells[2]!),
                  mapMatrixCell(s.cells[3]!),
                ] as [ReturnType<typeof mapMatrixCell>, ReturnType<typeof mapMatrixCell>, ReturnType<typeof mapMatrixCell>, ReturnType<typeof mapMatrixCell>],
              }
            : {}),
          ...(s.takeaway !== undefined ? { takeaway: s.takeaway } : {}),
          ...(s.client !== undefined ? { client: s.client } : {}),
          ...(s.clientMeta !== undefined ? { clientMeta: s.clientMeta } : {}),
          ...(s.context !== undefined ? { context: s.context } : {}),
          ...(s.challenge !== undefined ? { challenge: s.challenge } : {}),
          ...(s.approach !== undefined ? { approach: s.approach } : {}),
          ...(s.results !== undefined
            ? {
                results: s.results.map(r => ({
                  metric: r.metric,
                  value: r.value,
                  ...(r.delta !== undefined ? { delta: r.delta } : {}),
                })),
              }
            : {}),
          ...(s.quoteAttribution !== undefined ? { quoteAttribution: s.quoteAttribution } : {}),
          ...(s.period !== undefined ? { period: s.period } : {}),
          ...(s.kpis !== undefined
            ? {
                kpis: s.kpis.map(k => ({
                  label: k.label,
                  value: k.value,
                  ...(k.delta !== undefined ? { delta: k.delta } : {}),
                  ...(k.deltaTone !== undefined ? { deltaTone: k.deltaTone } : {}),
                  ...(k.hint !== undefined ? { hint: k.hint } : {}),
                })),
              }
            : {}),
          ...(s.personaName !== undefined ? { personaName: s.personaName } : {}),
          ...(s.role !== undefined ? { role: s.role } : {}),
          ...(s.attributes !== undefined ? { attributes: s.attributes } : {}),
          ...(s.needs !== undefined ? { needs: s.needs } : {}),
          ...(s.pains !== undefined ? { pains: s.pains } : {}),
          ...(s.unit !== undefined ? { unit: s.unit } : {}),
          ...(s.bars !== undefined
            ? {
                bars: s.bars.map(b => ({
                  label: b.label,
                  value: b.value,
                  ...(b.note !== undefined ? { note: b.note } : {}),
                })),
              }
            : {}),
          ...(s.source !== undefined ? { source: s.source } : {}),
          ...(s.periods !== undefined ? { periods: s.periods } : {}),
          ...(s.lanes !== undefined
            ? {
                lanes: s.lanes.map(lane => ({
                  name: lane.name,
                  items: lane.items.map(it => ({
                    period: it.period,
                    label: it.label,
                    ...(it.span !== undefined ? { span: it.span } : {}),
                    ...(it.emphasis !== undefined ? { emphasis: it.emphasis } : {}),
                  })),
                })),
              }
            : {}),
          ...(s.legend !== undefined ? { legend: s.legend } : {}),
          ...(s.scatterAxes !== undefined ? { scatterAxes: s.scatterAxes } : {}),
          ...(s.quadrantPoints !== undefined ? { quadrantPoints: s.quadrantPoints } : {}),
          ...(s.highlightPoint !== undefined ? { highlightPoint: s.highlightPoint } : {}),
          ...(s.oldQuestion !== undefined ? { oldQuestion: s.oldQuestion } : {}),
          ...(s.newAction !== undefined ? { newAction: s.newAction } : {}),
          ...(s.hint !== undefined ? { hint: s.hint } : {}),
        })),
        conceptIds: output.conceptIds,
      },
      actions: [],
      durationHint: item.durationHint,
      generationStatus: 'done',
    }
  }
}
