/**
 * season · v4 M2 课程季(圣经层)纯逻辑(docs/v4-master-plan-2026-07-13.md §3.2)
 *
 * 把「一门一门的课」变成「一季一季连续的课」:同季共用学科/学段/卡司(预设由
 * gradeBand×subject 确定性派生,天然一致),季维护剧情弧线与进度。
 *
 * 剧情护栏(宪法级,与内容优先原则同位):
 * - 剧情只出现在三个位置:开场承接(source-reading 讲稿首句)、结尾钩子
 *   (recap 幕 contentSlots.serialHook)、幕间过渡(暂未启用);
 * - serialHook 预算 ≤ SERIAL_HOOK_MAX 字(质量闸门 blocking);
 * - 去掉剧情后教学必须依然成立(真检检查项)。
 *
 * 本文件纯数据逻辑,不碰 db——落库见 season-store.ts(server-only)。
 */

import { misconceptionsFor } from '@maolab/pedagogy'
import type { GradeBand, SubjectId } from './domain.js'

/** recap 幕承载「下集预告」钩子的槽位名(渲染层与闸门共用这个事实源)。 */
export const SERIAL_HOOK_SLOT = 'serialHook'
/** 钩子字数预算:超出即剧情抢内容,闸门 blocking。 */
export const SERIAL_HOOK_MAX = 60

export interface PlotThread {
  id: string
  hook: string
  plantedEpisodeNo: number
  /** 被下一集开场承接即视为回收 */
  resolvedEpisodeNo?: number
}

export interface SeasonEpisode {
  episodeNo: number
  courseId: string
  topic: string
  kpTitles: string[]
  /** 本集 recap 留下的下集钩子(fill 通过后归档写入) */
  endingHook?: string
}

export interface Season {
  id: string
  title: string
  subject: SubjectId
  gradeBand: GradeBand
  /** 季主题:一句话锚定本季知识域与气质(如「看不见的规律:电与磁」) */
  seasonTheme: string
  episodes: SeasonEpisode[]
  openPlotThreads: PlotThread[]
  createdAt: string
}

export function createSeason(input: {
  id: string
  title: string
  subject: SubjectId
  gradeBand: GradeBand
  seasonTheme: string
  createdAt: string
}): Season {
  return { ...input, episodes: [], openPlotThreads: [] }
}

export function nextEpisodeNo(season: Season): number {
  return season.episodes.reduce((max, ep) => Math.max(max, ep.episodeNo), 0) + 1
}

/** 注入包:fill-scenes 生成期用到的季上下文(只带本课需要的,不带全量圣经)。 */
export interface SeasonInjection {
  seasonTitle: string
  seasonTheme: string
  episodeNo: number
  /** 上一集(承接来源);第一集为空 */
  prevEpisode?: { topic: string; endingHook?: string }
  /** 当前未回收钩子(供开场承接与预告参考,不强制逐条回收) */
  openHooks: string[]
  /** 本季往集已作为辨析主误区处理过的误概念(id),本集不得重复(round10:跨集撞误概念) */
  coveredMisconceptionIds?: string[]
}

export function seasonInjectionFor(season: Season, episodeNo: number): SeasonInjection {
  const prev = season.episodes.find(ep => ep.episodeNo === episodeNo - 1)
  // 往集已覆盖的误概念:按往集 KP 反查误概念库(与生成期同一命中逻辑)
  const covered = new Set(
    season.episodes
      .filter(ep => ep.episodeNo < episodeNo)
      .flatMap(ep => misconceptionsFor(season.subject, [ep.topic, ...ep.kpTitles]).map(m => m.id)),
  )
  return {
    seasonTitle: season.title,
    seasonTheme: season.seasonTheme,
    episodeNo,
    ...(prev ? { prevEpisode: { topic: prev.topic, ...(prev.endingHook ? { endingHook: prev.endingHook } : {}) } } : {}),
    openHooks: season.openPlotThreads.filter(t => !t.resolvedEpisodeNo).map(t => t.hook),
    ...(covered.size > 0 ? { coveredMisconceptionIds: [...covered] } : {}),
  }
}

/**
 * 归档:fill 通过后把本集写回季。
 * - 本集入 episodes(同集号重填则覆盖);
 * - 上一集的未回收钩子标记为本集回收(开场承接即回收);
 * - 本集新钩子入 openPlotThreads。
 * 圣经只增不删:episodes/threads 不做移除,重复归档幂等。
 */
export function archiveEpisode(
  season: Season,
  episode: { episodeNo: number; courseId: string; topic: string; kpTitles: string[]; endingHook?: string },
): Season {
  const episodes = [
    ...season.episodes.filter(ep => ep.episodeNo !== episode.episodeNo),
    { ...episode },
  ].sort((a, b) => a.episodeNo - b.episodeNo)

  let threads = season.openPlotThreads.map(t =>
    !t.resolvedEpisodeNo && t.plantedEpisodeNo < episode.episodeNo
      ? { ...t, resolvedEpisodeNo: episode.episodeNo }
      : t,
  )
  if (episode.endingHook) {
    const id = `thread-e${episode.episodeNo}`
    threads = [
      ...threads.filter(t => t.id !== id),
      { id, hook: episode.endingHook, plantedEpisodeNo: episode.episodeNo },
    ]
  }
  return { ...season, episodes, openPlotThreads: threads }
}
