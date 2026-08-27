import { describe, it, expect } from 'vitest'
import {
  MISCONCEPTION_REGISTRY,
  METAPHOR_REGISTRY,
  misconceptionsFor,
  metaphorsFor,
  findBannedPhrasings,
  findToneViolations,
  toneRulesFor,
} from '../index.js'

describe('registry integrity', () => {
  it('误概念库:id 唯一,每条有误区/修正/风险,BAN 讲法正则可编译', () => {
    expect(new Set(MISCONCEPTION_REGISTRY.map(e => e.id)).size).toBe(MISCONCEPTION_REGISTRY.length)
    for (const entry of MISCONCEPTION_REGISTRY) {
      expect(entry.misconception.length).toBeGreaterThan(10)
      expect(entry.correction.length).toBeGreaterThan(10)
      expect(entry.risk.length).toBeGreaterThan(4)
      expect(entry.conceptKeywords.length).toBeGreaterThan(0)
      for (const source of entry.bannedPhrasings ?? []) {
        expect(() => new RegExp(source)).not.toThrow()
      }
    }
  })

  it('隐喻注册表:approved 必有 mapping+knownLimits,banned 必有 reason+replacement', () => {
    expect(new Set(METAPHOR_REGISTRY.map(e => e.id)).size).toBe(METAPHOR_REGISTRY.length)
    for (const entry of METAPHOR_REGISTRY) {
      if (entry.status === 'approved') {
        expect(entry.mapping).toBeTruthy()
        expect(entry.knownLimits).toBeTruthy()
      } else {
        expect(entry.reason).toBeTruthy()
        expect(entry.replacement).toBeTruthy()
      }
    }
  })
})

describe('misconceptionsFor', () => {
  it('学科 + KP 关键词命中(电路课命中电流误概念)', () => {
    const hits = misconceptionsFor('physics', ['串联电路与并联电路'])
    expect(hits.map(h => h.id)).toContain('MIS-002')
  })

  it('跨学科不误伤(地理课不返回物理电流条目)', () => {
    const hits = misconceptionsFor('geography', ['串联电路与并联电路'])
    expect(hits).toHaveLength(0)
  })

  it('季节课命中距离说误概念', () => {
    expect(misconceptionsFor('geography', ['地球公转与四季变化']).map(h => h.id)).toContain('MIS-010')
  })
})

describe('findBannedPhrasings', () => {
  it('错误讲法命中:电流被用光', () => {
    const v = findBannedPhrasings('电流经过灯泡后就被用光了,所以后面没有电。', 'physics')
    expect(v.map(x => x.entryId)).toContain('MIS-002')
  })

  it('目的论进化措辞命中', () => {
    const v = findBannedPhrasings('长颈鹿为了吃到高处的树叶而进化出长脖子。', 'biology')
    expect(v.map(x => x.entryId)).toContain('MIS-006')
  })

  it('正确讲法不命中(变异在先选择在后)', () => {
    const v = findBannedPhrasings('脖子长短本来就有差异,碰巧脖子长的活了下来。', 'biology')
    expect(v).toHaveLength(0)
  })

  it('否定式纠正表述不误伤(round09 实撞回归)', () => {
    expect(findBannedPhrasings('电流不会被用光,消耗的是电能。', 'physics')).toHaveLength(0)
    expect(findBannedPhrasings('乘法并不总是让数变大,乘以小于 1 的数会变小。', 'math')).toHaveLength(0)
    expect(findBannedPhrasings('长颈鹿不是为了够树叶而变长脖子的。', 'biology')).toHaveLength(0)
    expect(findBannedPhrasings('夏天热并不是因为地球离太阳更近。', 'geography')).toHaveLength(0)
    // 肯定式错误讲法仍然命中
    expect(findBannedPhrasings('电流跑到灯泡就被用光了。', 'physics').length).toBeGreaterThan(0)
    expect(findBannedPhrasings('乘法总是让结果变大。', 'math').length).toBeGreaterThan(0)
  })

  it('前置否定(而非/不是/并非)不误伤(round10 实撞回归)', () => {
    expect(findBannedPhrasings('消耗的是电能而非电流被用光。', 'physics')).toHaveLength(0)
    expect(findBannedPhrasings('这不是电流被用光,而是电能转化了。', 'physics')).toHaveLength(0)
    expect(findBannedPhrasings('关键并非乘法总让数变大。', 'math')).toHaveLength(0)
  })

  it('只扫本学科,历史课文本不触发生物正则', () => {
    const v = findBannedPhrasings('长颈鹿为了吃到高处的树叶而进化出长脖子。', 'history')
    expect(v).toHaveLength(0)
  })
})

describe('metaphorsFor', () => {
  it('电路课返回水流比喻(approved)且携带 knownLimits', () => {
    const m = metaphorsFor('physics', 'middle-school', ['欧姆定律与电阻'])
    expect(m.approved.map(e => e.id)).toContain('MET-001')
    expect(m.approved.find(e => e.id === 'MET-001')!.knownLimits).toContain('用光')
  })

  it('机翼课返回等时说(banned)与替代讲法', () => {
    const m = metaphorsFor('physics', 'middle-school', ['飞机机翼的升力原理'])
    const banned = m.banned.find(e => e.id === 'MET-002')
    expect(banned?.replacement).toContain('牛顿第三定律')
  })

  it('学段限定:迷你太阳系小学 approved、中学转 banned', () => {
    const primary = metaphorsFor('chemistry', 'lower-primary', ['原子结构初步'])
    expect(primary.approved.map(e => e.id)).toContain('MET-004')
    const middle = metaphorsFor('chemistry', 'middle-school', ['原子结构初步'])
    expect(middle.approved.map(e => e.id)).not.toContain('MET-004')
    expect(middle.banned.map(e => e.id)).toContain('MET-004')
  })
})

describe('tone rules', () => {
  it('每学段有语气指令与禁词表;未知学段回退中学', () => {
    for (const band of ['lower-primary', 'upper-primary', 'middle-school', 'high-school']) {
      const rules = toneRulesFor(band)
      expect(rules.voice.length).toBeGreaterThan(10)
      expect(rules.banned.length).toBeGreaterThan(0)
    }
    expect(toneRulesFor('unknown').gradeBand).toBe('middle-school')
  })

  it('Anti-Cringe:5-6 年级文本出现「小朋友」为 blocking', () => {
    const v = findToneViolations('小朋友们,今天我们来认识电路。', 'upper-primary')
    expect(v.some(x => x.phrase === '小朋友' && x.severity === 'blocking')).toBe(true)
  })

  it('低段抽象术语拦截;高学段同文本不受低段规则误伤', () => {
    expect(findToneViolations('速度与时间成正比。', 'lower-primary').length).toBeGreaterThan(0)
    expect(findToneViolations('速度与时间成正比。', 'middle-school')).toHaveLength(0)
  })
})
