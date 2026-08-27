import { describe, it, expect } from 'vitest'
import {
  buildIndexedList,
  clearSafetyVerdict,
  extractJsonArray,
  resolveIndices,
} from '../kp-relation-protocol.js'

/**
 * KP 关系协议回归(2026-07-28)。
 *
 * 起因是一次**静默的整轮失败**:高中数学 711 个 KP 跑完关系推断,9 批里 6 批
 * 撞 120s 超时,唯一跑通的那批输出 62 条关系、可用 0 条,而脚本把该组标记为
 * 「已完成」——一次失败被记成一次成功,此后续传永远跳过它。
 *
 * 根因是拿 36 位 UUID 跟 LLM 来回传:输出太长会超时,抄错一个字符就被静默丢弃。
 * 改成行号后,这组测试守的是:**能对上的要对上,对不上的要被数出来。**
 */

const POOL = [
  { id: 'kp-a', canonical_name: '向量的概念' },
  { id: 'kp-b', canonical_name: '向量的模' },
  { id: 'kp-c', canonical_name: '平面向量基本定理' },
]

describe('buildIndexedList', () => {
  it('行号 1-based,只给名字不给 id', () => {
    const s = buildIndexedList(POOL)
    expect(s).toContain('1: 向量的概念')
    expect(s).toContain('3: 平面向量基本定理')
    expect(s).not.toContain('kp-a') // id 不进 prompt——它正是超时与抄错的来源
  })
})

describe('extractJsonArray', () => {
  it('整数 from/to 正常解析', () => {
    const out = extractJsonArray('[{"from":1,"to":2,"type":"prerequisite","evidence":"先学概念"}]')
    expect(out).toEqual([{ from: 1, to: 2, type: 'prerequisite', evidence: '先学概念' }])
  })

  it('数字被包成字符串也认(模型常这么干)', () => {
    expect(extractJsonArray('[{"from":"1","to":"3","type":"related"}]')[0]).toMatchObject({ from: 1, to: 3 })
  })

  it('夹在解释文字与 markdown 里也能抠出来', () => {
    const out = extractJsonArray('好的,分析如下:\n```json\n[{"from":2,"to":3,"type":"leads-to"}]\n```\n以上。')
    expect(out).toHaveLength(1)
  })

  it('**UUID 形式的 from/to 一律丢弃**(旧协议的产物,不能被当成行号)', () => {
    const out = extractJsonArray('[{"from":"3f2b1c88-0000-4000-8000-000000000001","to":"2","type":"related"}]')
    expect(out).toEqual([])
  })

  it('非法 JSON 返回空数组,不抛', () => {
    expect(extractJsonArray('[{"from":1,')).toEqual([])
    expect(extractJsonArray('完全没有数组')).toEqual([])
  })
})

describe('resolveIndices', () => {
  it('行号还原成 KP id', () => {
    const { rels, outOfRange } = resolveIndices(
      [{ from: 1, to: 3, type: 'prerequisite', evidence: 'x' }], POOL, POOL,
    )
    expect(rels).toEqual([{ from: 'kp-a', to: 'kp-c', type: 'prerequisite', evidence: 'x' }])
    expect(outOfRange).toBe(0)
  })

  it('**越界要被数出来,不能静默吞掉**(整轮失败当初就是这么被瞒过去的)', () => {
    const { rels, outOfRange } = resolveIndices(
      [
        { from: 1, to: 2, type: 'related', evidence: '' },
        { from: 99, to: 1, type: 'related', evidence: '' },
        { from: 1, to: 0, type: 'related', evidence: '' }, // 0 不是合法 1-based 行号
      ],
      POOL, POOL,
    )
    expect(rels).toHaveLength(1)
    expect(outOfRange).toBe(2)
  })

  it('自指丢弃并计数', () => {
    const { rels, outOfRange } = resolveIndices(
      [{ from: 2, to: 2, type: 'related', evidence: '' }], POOL, POOL,
    )
    expect(rels).toEqual([])
    expect(outOfRange).toBe(1)
  })

  it('跨学科:from 查 A 池、to 查 B 池,两个独立行号空间', () => {
    const poolB = [
      { id: 'phy-1', canonical_name: '力的合成' },
      { id: 'phy-2', canonical_name: '速度' },
    ]
    const { rels } = resolveIndices(
      [{ from: 1, to: 2, type: 'related', evidence: '' }], POOL, poolB,
    )
    // 用同一个池解析会得到 kp-a→kp-b,那是错的
    expect(rels).toEqual([{ from: 'kp-a', to: 'phy-2', type: 'related', evidence: '' }])
  })
})

/**
 * 「范围过滤 + 默认全局清空」必须被代码拦掉(2026-07-28 Codex 复审 P0)。
 *
 * 上一版只在文件头写了「❌ --limit-subjects=数学」的警告就收工。
 * **自己标了 ❌ 还让它能跑,等于把危险留给下一个不读注释的人。**
 * 守卫必须是代码——这组测试就是那道守卫的回归。
 */
describe('clearSafetyVerdict · 危险组合 fail-closed', () => {
  const base = { limitSubjects: null, limitGradeBands: null, noClear: false }

  it('**限学科 + 未加 --no-clear → 拒绝执行**(会先删光所有学科的边)', () => {
    const v = clearSafetyVerdict({ ...base, limitSubjects: ['数学'] })
    expect(v.ok).toBe(false)
    if (!v.ok) {
      expect(v.reason).toContain('--limit-subjects=数学')
      expect(v.reason).toContain('--no-clear') // 出路要写在错误里,不让用户猜
    }
  })

  it('**限学段 + 未加 --no-clear → 同样拒绝**(两个过滤参数都要拦)', () => {
    expect(clearSafetyVerdict({ ...base, limitGradeBands: ['高中'] }).ok).toBe(false)
  })

  it('范围过滤 + --no-clear → 放行(这是增量补数据的正确姿势)', () => {
    expect(clearSafetyVerdict({
      limitSubjects: ['数学'], limitGradeBands: ['高中'], noClear: true,
    }).ok).toBe(true)
  })

  it('无范围过滤 → 放行(全量重跑时全局清空正是本意)', () => {
    expect(clearSafetyVerdict(base).ok).toBe(true)
    expect(clearSafetyVerdict({ ...base, noClear: true }).ok).toBe(true)
  })

  it('空数组不算范围过滤,不误伤', () => {
    expect(clearSafetyVerdict({ ...base, limitSubjects: [], limitGradeBands: [] }).ok).toBe(true)
  })
})
