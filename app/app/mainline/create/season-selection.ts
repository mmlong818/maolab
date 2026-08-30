import type { GradeBand, SubjectId } from '@/lib/mainline'
import type { TextbookPick } from '../../(setup)/create/TextbookPicker.js'

export interface SeasonSummary {
  id: string
  title: string
  subject: SubjectId
  gradeBand: GradeBand
  seasonTheme: string
  episodeCount: number
  nextEpisodeNo: number
  openHooks: string[]
}

const SUBJECT_MAP: Record<string, SubjectId> = {
  chinese: 'chinese',
  语文: 'chinese',
  math: 'math',
  数学: 'math',
  physics: 'physics',
  物理: 'physics',
  chemistry: 'chemistry',
  化学: 'chemistry',
  biology: 'biology',
  生物: 'biology',
  english: 'english',
  英语: 'english',
  history: 'history',
  历史: 'history',
  politics: 'politics',
  思政: 'politics',
  道德与法治: 'politics',
  geography: 'geography',
  地理: 'geography',
  science: 'science',
  科学: 'science',
}

export function subjectFromPick(pick: Pick<TextbookPick, 'subject'>): SubjectId {
  return SUBJECT_MAP[pick.subject] ?? 'general'
}

export function gradeBandFromPick(pick: Pick<TextbookPick, 'stage'>): GradeBand {
  if (pick.stage === '小学') return 'upper-primary'
  if (pick.stage === '高中') return 'high-school'
  return 'middle-school'
}

export function seasonFitsPick(season: SeasonSummary, pick: TextbookPick): boolean {
  return season.subject === subjectFromPick(pick) && season.gradeBand === gradeBandFromPick(pick)
}

export function compatibleSeasons(seasons: readonly SeasonSummary[], pick: TextbookPick | null): SeasonSummary[] {
  if (!pick) return []
  return seasons.filter(season => seasonFitsPick(season, pick))
}

function clampText(value: string, maxLength: number): string {
  const trimmed = value.trim()
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed
}

export function defaultSeasonDraft(pick: TextbookPick): { title: string; seasonTheme: string; subject: SubjectId; gradeBand: GradeBand } {
  const subject = subjectFromPick(pick)
  const gradeBand = gradeBandFromPick(pick)
  return {
    title: clampText(`${pick.subject}${pick.grade}连续课`, 40),
    seasonTheme: clampText(`${pick.textbookTitle} · ${pick.grade}${pick.volume}的连续学习线索`, 80),
    subject,
    gradeBand,
  }
}
