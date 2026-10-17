import { describe, expect, it } from 'vitest'
import { parseCoordPairs, parseDialogueScript, parseForceVectors, parseFuncKeyPoints, parseGeoAngles, parseGeoEdges, parseGeoVertices, parseRange, parseTimelineEvents } from '../content-forms.js'

/**
 * 学科内容形态槽解析测试(方向二第一批,2026-07-22)
 * 槽格式契约:生成端 fill-scenes CONTENT_FORM_RULES ↔ 解析端 content-forms.ts。
 */

describe('parseTimelineEvents · 「年代|事件」', () => {
  it('标准多行按序解析,年代保留原文格式', () => {
    const events = parseTimelineEvents('公元前221|秦统一六国\n220|曹丕称帝,东汉结束\n1949|中华人民共和国成立')
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({ time: '公元前221', event: '秦统一六国' })
    expect(events[2]!.time).toBe('1949')
  })

  it('缺竖线的行整行当事件不丢内容,空行忽略', () => {
    const events = parseTimelineEvents('约170万年前|元谋人生活于云南\n\n用火证据的意义在于熟食与御寒')
    expect(events).toHaveLength(2)
    expect(events[1]).toEqual({ time: '', event: '用火证据的意义在于熟食与御寒' })
  })

  it('事件短句里再出现竖线时只切第一个(年代|事件正文可含|)', () => {
    const events = parseTimelineEvents('1911|辛亥革命|旧制度终结')
    expect(events[0]).toEqual({ time: '1911', event: '辛亥革命|旧制度终结' })
  })
})

describe('parseDialogueScript · 「说话人: 台词」', () => {
  it('说话人按出现顺序分左右声道,同人复用首次声道', () => {
    const turns = parseDialogueScript('Amy: What are you going to do this weekend?\nBen: I am going to go hiking. (远足)\nAmy: Sounds great!')
    expect(turns).toHaveLength(3)
    expect(turns[0]!.side).toBe(0)
    expect(turns[1]!.side).toBe(1)
    expect(turns[2]!.side).toBe(0)
    expect(turns[1]!.speaker).toBe('Ben')
  })

  it('全角冒号同样解析;无冒号行并入上一句(长台词换行容错)', () => {
    const turns = parseDialogueScript('Amy： Hello there!\nand welcome to our class.')
    expect(turns).toHaveLength(1)
    expect(turns[0]!.line).toBe('Hello there! and welcome to our class.')
  })

  it('第三位说话人复用左声道(0),不越界', () => {
    const turns = parseDialogueScript('A: one\nB: two\nCindy: three')
    expect(turns[2]!.side).toBe(0)
  })
})

describe('parseForceVectors · 「标签|类型|大小|单位|角度|颜色角色」', () => {
  it('标准多行解析,角度转数值、role 小写', () => {
    const fv = parseForceVectors('mg|重力|50|N|270|gravity\nN|支持力|50|N|90|Normal\nf|摩擦力|10|N|180|friction')
    expect(fv).toHaveLength(3)
    expect(fv[0]).toEqual({ label: 'mg', type: '重力', magnitude: '50', unit: 'N', angle: 270, role: 'gravity' })
    expect(fv[1]!.role).toBe('normal')
    expect(fv[2]!.angle).toBe(180)
  })

  it('角度非数值按 0,role 缺失回退用 type(小写),空行忽略', () => {
    const fv = parseForceVectors('F|拉力|20|N|abc\n\nG|gravity|5|N|270')
    expect(fv).toHaveLength(2)
    expect(fv[0]!.angle).toBe(0)
    expect(fv[0]!.role).toBe('拉力')
    expect(fv[1]!.role).toBe('gravity')
  })

  it('缺列容错(大小/单位可缺),无标签行丢弃', () => {
    const fv = parseForceVectors('T|张力|||45\n|无标签|1|N|0')
    expect(fv).toHaveLength(1)
    expect(fv[0]).toEqual({ label: 'T', type: '张力', magnitude: '', unit: '', angle: 45, role: '张力' })
  })
})

describe('函数坐标 · parseCoordPairs / parseFuncKeyPoints / parseRange', () => {
  it('采样点空格分隔,支持括号,非数值对丢弃', () => {
    const p = parseCoordPairs('-1,0 0,-3 (1,-4) 3,0  bad,x')
    expect(p).toHaveLength(4)
    expect(p[1]).toEqual({ x: 0, y: -3 })
    expect(p[2]).toEqual({ x: 1, y: -4 })
  })

  it('关键点「类型:(x,y)」解析,无坐标者(如渐近线 x=2)丢弃', () => {
    const k = parseFuncKeyPoints('零点:(-1,0);顶点:(1,-4);渐近线:x=2')
    expect(k).toHaveLength(2)
    expect(k[0]).toEqual({ label: '零点', x: -1, y: 0 })
    expect(k[1]!.label).toBe('顶点')
  })

  it('range 需 min<max 双数值,否则 null', () => {
    expect(parseRange('-3,5')).toEqual([-3, 5])
    expect(parseRange('5')).toBeNull()
    expect(parseRange('3,3')).toBeNull()
  })
})

describe('几何 · parseGeoVertices / parseGeoEdges / parseGeoAngles', () => {
  it('顶点「名(x,y)」解析,格式错的丢弃', () => {
    const v = parseGeoVertices('A(0,0);B(4,0);C(4,3);坏顶点')
    expect(v).toHaveLength(3)
    expect(v[2]).toEqual({ name: 'C', x: 4, y: 3 })
  })

  it('边取首尾字母;缺边时渲染端兜底(此处只测解析)', () => {
    expect(parseGeoEdges('AB;BC;CA')).toEqual([['A', 'B'], ['B', 'C'], ['C', 'A']])
  })

  it('角标取中间字母为顶点,含 90 判定为直角', () => {
    const a = parseGeoAngles('∠ABC=90°;∠BAC=37°')
    expect(a).toHaveLength(2)
    expect(a[0]).toEqual({ vertex: 'B', text: '∠ABC=90°', isRight: true })
    expect(a[1]!.vertex).toBe('A')
    expect(a[1]!.isRight).toBe(false)
  })
})
