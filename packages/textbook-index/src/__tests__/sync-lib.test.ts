import { describe, it, expect } from 'vitest'
import { syncIndex } from '../sync-lib.js'

/**
 * 版本白名单的回归(2026-07-28,D-3 高中数学未入库)。
 *
 * 缺口原委:高中数学在上游一直都有(tch_material 38 条 / national_lesson 41 条),
 * 但它的版本标签是 `人教A版` 而不是 `人教版`,被为了挡地方版而设的白名单
 * 一刀切掉——**一整个学段的主科零入库,而且没有任何日志**,于是这个洞活了很久。
 *
 * 所以这里锁两件事:该收的收进来、**该挡的被记下来而不是消失**。
 * 只测「A 版能进」是不够的——静默才是当初真正的病根。
 */

function tag(name: string, dim?: string) {
  return dim === undefined ? { tag_name: name } : { tag_name: name, tag_dimension_id: dim }
}

/** 按真实上游结构造条目(标签维度取自 2026-07-28 实探)。 */
function book(opts: { title: string; stage: string; subject: string; version: string; volume: string }) {
  return {
    id: `id-${opts.title}`,
    global_title: { 'zh-CN': opts.title },
    status: 'ONLINE',
    provider_list: [{ name: '人民教育出版社' }],
    tag_list: [
      tag('教材', 'tagView'),
      tag(opts.stage, 'zxxxd'),
      tag(opts.subject, 'zxxxk'),
      tag(opts.version, 'zxxbb'),
      tag(opts.volume, 'zxxcc'),
      tag('高中年级', 'zxxnj'),
    ],
  }
}

const CORPUS = [
  book({ title: '普通高中教科书·数学（A版）必修 第一册', stage: '高中', subject: '数学', version: '人教A版', volume: '必修 第一册' }),
  book({ title: '高中数学沪教版必修 第二册', stage: '高中', subject: '数学', version: '沪教版', volume: '必修 第二册' }),
  book({ title: '高中数学北师大版必修 第一册', stage: '高中', subject: '数学', version: '北师大版', volume: '必修 第一册' }),
  book({ title: '初中数学人教版七年级上册', stage: '初中', subject: '数学', version: '人教版', volume: '七年级上册' }),
]

function fakeFetch(): typeof fetch {
  return (async (url: string) => {
    if (String(url).includes('data_version.json')) {
      return { ok: true, json: async () => ({ module_version: 1, urls: ['https://example.test/part_0.json'] }) }
    }
    return { ok: true, json: async () => CORPUS }
  }) as unknown as typeof fetch
}

describe('syncIndex · 版本白名单', () => {
  it('人教A版的高中数学能进索引(D-3 的直接修复)', async () => {
    const index = await syncIndex({ source: 'tch_material', fetchFn: fakeFetch() })
    const mathHigh = index.entries.filter(e => e.stage === '高中' && e.subject === '数学')
    expect(mathHigh.map(e => e.version)).toEqual(['人教A版'])
  })

  it('地方版仍然挡在门外(白名单没被放宽成筛子)', async () => {
    const index = await syncIndex({ source: 'tch_material', fetchFn: fakeFetch() })
    const versions = new Set(index.entries.map(e => e.version))
    expect(versions.has('沪教版')).toBe(false)
    expect(versions.has('北师大版')).toBe(false)
  })

  it('**被挡掉的要报出来,不许静默**——当初丢掉整个高中数学正是因为没人知道它被丢了', async () => {
    const index = await syncIndex({ source: 'tch_material', fetchFn: fakeFetch() })
    expect(index.rejectedVersions.get('沪教版 · 高中/数学')).toBe(1)
    expect(index.rejectedVersions.get('北师大版 · 高中/数学')).toBe(1)
    // 收进来的不该出现在拒绝清单里
    expect([...index.rejectedVersions.keys()].some(k => k.startsWith('人教A版'))).toBe(false)
  })

  it('既有的人教版/统编版行为零回退', async () => {
    const index = await syncIndex({ source: 'tch_material', fetchFn: fakeFetch() })
    expect(index.entries.some(e => e.stage === '初中' && e.subject === '数学' && e.version === '人教版')).toBe(true)
  })
})
