/**
 * POST /api/v2/mainline/seasons · 创建课程季(v4 M2 圣经层)
 * GET  /api/v2/mainline/seasons · 列出全部季(含集数与未回收钩子概览)
 *
 * 季 = 学科×学段×主题的连续剧容器。建课时给 from-kps 传 seasonId,
 * 该课即成为本季下一集,fill 时自动承接上集钩子并留下集预告。
 */
import { type NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { createSeason, nextEpisodeNo } from '../../../../lib/mainline/season.js'
import { findSeason, listSeasons, saveSeason } from '../../../../lib/mainline/season-store.js'

export const runtime = 'nodejs'

const CreateSchema = z.object({
  title: z.string().min(2).max(40),
  subject: z.enum(['chinese', 'math', 'science', 'physics', 'chemistry', 'biology', 'history', 'geography', 'english', 'general']),
  gradeBand: z.enum(['lower-primary', 'upper-primary', 'middle-school', 'high-school']),
  seasonTheme: z.string().min(4).max(80),
})

export async function POST(req: NextRequest) {
  let body: z.infer<typeof CreateSchema>
  try { body = CreateSchema.parse(await req.json()) }
  catch (err) { return NextResponse.json({ error: `Invalid request body: ${String(err)}` }, { status: 400 }) }

  const season = createSeason({
    id: randomUUID(),
    title: body.title,
    subject: body.subject,
    gradeBand: body.gradeBand,
    seasonTheme: body.seasonTheme,
    createdAt: new Date().toISOString(),
  })
  await saveSeason(season)
  return NextResponse.json({ ok: true, seasonId: season.id, title: season.title })
}

export async function GET() {
  const seasons = await listSeasons()
  return NextResponse.json({
    seasons: seasons.map(s => ({
      id: s.id,
      title: s.title,
      subject: s.subject,
      gradeBand: s.gradeBand,
      seasonTheme: s.seasonTheme,
      episodeCount: s.episodes.length,
      nextEpisodeNo: nextEpisodeNo(s),
      openHooks: s.openPlotThreads.filter(t => !t.resolvedEpisodeNo).map(t => t.hook),
    })),
  })
}
