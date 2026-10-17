import { describe, it, expect } from 'vitest'
import {
  archiveEpisode,
  createSeason,
  nextEpisodeNo,
  seasonInjectionFor,
  SERIAL_HOOK_MAX,
} from '../season.js'

function season() {
  return createSeason({
    id: 's01',
    title: '看不见的规律',
    subject: 'physics',
    gradeBand: 'middle-school',
    seasonTheme: '电与磁:看不见但测得到的力量',
    createdAt: '2026-07-13T00:00:00.000Z',
  })
}

describe('season 纯逻辑', () => {
  it('新季从第 1 集开始,归档后集号递增', () => {
    const s0 = season()
    expect(nextEpisodeNo(s0)).toBe(1)
    const s1 = archiveEpisode(s0, { episodeNo: 1, courseId: 'c1', topic: '电流', kpTitles: ['电流的概念'], endingHook: '灯泡亮了,但电流表的读数藏着一个秘密。' })
    expect(nextEpisodeNo(s1)).toBe(2)
  })

  it('注入包:第 1 集无承接;第 2 集带上一集主题与钩子', () => {
    const s0 = season()
    expect(seasonInjectionFor(s0, 1).prevEpisode).toBeUndefined()

    const s1 = archiveEpisode(s0, { episodeNo: 1, courseId: 'c1', topic: '电流', kpTitles: ['电流'], endingHook: '读数藏着秘密。' })
    const injection = seasonInjectionFor(s1, 2)
    expect(injection.prevEpisode?.topic).toBe('电流')
    expect(injection.prevEpisode?.endingHook).toBe('读数藏着秘密。')
    expect(injection.openHooks).toContain('读数藏着秘密。')
    expect(injection.seasonTheme).toContain('电与磁')
  })

  it('归档回收:上一集钩子在本集归档时标记回收,本集新钩子入库', () => {
    let s = archiveEpisode(season(), { episodeNo: 1, courseId: 'c1', topic: '电流', kpTitles: ['电流'], endingHook: '钩子一' })
    s = archiveEpisode(s, { episodeNo: 2, courseId: 'c2', topic: '电压', kpTitles: ['电压'], endingHook: '钩子二' })

    const t1 = s.openPlotThreads.find(t => t.hook === '钩子一')!
    const t2 = s.openPlotThreads.find(t => t.hook === '钩子二')!
    expect(t1.resolvedEpisodeNo).toBe(2)
    expect(t2.resolvedEpisodeNo).toBeUndefined()
    // 圣经只增不删:两条线索都还在
    expect(s.openPlotThreads).toHaveLength(2)
    expect(s.episodes.map(e => e.episodeNo)).toEqual([1, 2])
  })

  it('重复归档同一集幂等(重填课不产生重复集/重复线索)', () => {
    let s = archiveEpisode(season(), { episodeNo: 1, courseId: 'c1', topic: '电流', kpTitles: ['电流'], endingHook: '钩子一' })
    s = archiveEpisode(s, { episodeNo: 1, courseId: 'c1', topic: '电流', kpTitles: ['电流'], endingHook: '钩子一改' })
    expect(s.episodes).toHaveLength(1)
    expect(s.episodes[0]!.endingHook).toBe('钩子一改')
    expect(s.openPlotThreads.filter(t => t.plantedEpisodeNo === 1)).toHaveLength(1)
  })

  it('钩子预算常量有效(闸门与生成端共用)', () => {
    expect(SERIAL_HOOK_MAX).toBeGreaterThan(20)
    expect(SERIAL_HOOK_MAX).toBeLessThanOrEqual(80)
  })

  it('注入包携带往集已覆盖误概念 id(跨集撞误概念回归)', () => {
    // E1 的 KP 含「电路」→ 命中 MIS-002;E2 注入包应把它标记为已覆盖
    const s1 = archiveEpisode(season(), { episodeNo: 1, courseId: 'c1', topic: '电路四要素', kpTitles: ['电路三种状态(通路、断路、短路)'] })
    const injection = seasonInjectionFor(s1, 2)
    expect(injection.coveredMisconceptionIds).toContain('MIS-002')
    // 第一集无往集,不带该字段
    expect(seasonInjectionFor(season(), 1).coveredMisconceptionIds).toBeUndefined()
  })
})
