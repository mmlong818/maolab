import { describe, expect, it } from 'vitest'
import { parseOpticsScene, projectOptics, solveOptics, type OpticsSegment, type OpticsSolution } from '../optics.js'

/**
 * 光路引擎测试。重点不是"渲染出东西",而是**光路在几何上确实满足物理定律**——
 * 这是 A-1 架构红线「渲染器管定律,LLM 管取值」的证明,不能只靠声称。
 */

const solve = (kind: string, values: Record<string, number>): OpticsSolution => {
  const s = solveOptics({ kind: kind as never, values })
  expect(s, `${kind} 应可求解`).not.toBeNull()
  return s!
}

/** 线段 seg 上是否存在参数点等于 (x,y)(共线且在延长范围内)。 */
function passesThrough(seg: OpticsSegment, x: number, y: number, tol = 1e-6): boolean {
  const dx = seg.to.x - seg.from.x
  const dy = seg.to.y - seg.from.y
  const cross = (x - seg.from.x) * dy - (y - seg.from.y) * dx
  return Math.abs(cross) < tol * Math.max(1, Math.hypot(dx, dy))
}

describe('薄透镜成像:1/f = 1/u + 1/v', () => {
  it('凸透镜 u=30 f=10 → v=15,倒立缩小实像', () => {
    const s = solve('convex-lens', { u: 30, f: 10, h: 4 })
    expect(s.solved.v).toBeCloseTo(15, 9)
    expect(s.solved.magnification).toBeCloseTo(-0.5, 9)
    expect(s.imageIsVirtual).toBe(false)
    expect(s.verdict).toContain('倒立')
    expect(s.verdict).toContain('缩小')
    expect(s.verdict).toContain('实像')
  })

  it('凸透镜 f<u<2f(u=15 f=10)→ v=30,倒立放大实像', () => {
    const s = solve('convex-lens', { u: 15, f: 10, h: 4 })
    expect(s.solved.v).toBeCloseTo(30, 9)
    expect(s.solved.magnification).toBeCloseTo(-2, 9)
    expect(s.verdict).toContain('放大')
    expect(s.verdict).toContain('实像')
  })

  it('凸透镜 u<f(u=5 f=10)→ 放大镜:正立放大虚像,像与物同侧', () => {
    const s = solve('convex-lens', { u: 5, f: 10, h: 4 })
    expect(s.solved.v).toBeCloseTo(-10, 9)
    expect(s.solved.magnification).toBeCloseTo(2, 9)
    expect(s.imageIsVirtual).toBe(true)
    expect(s.verdict).toContain('正立')
    expect(s.verdict).toContain('虚像')
  })

  it('凸透镜 u=f → 平行出射不成像(不伪造一个像点)', () => {
    const s = solve('convex-lens', { u: 10, f: 10, h: 4 })
    expect(s.solved.v).toBe(Number.POSITIVE_INFINITY)
    expect(s.verdict).toContain('不成像')
    expect(s.segments.some(seg => seg.role === 'image')).toBe(false)
  })

  it('凹透镜恒为正立缩小虚像(u=30 f=10 → v=-7.5)', () => {
    const s = solve('concave-lens', { u: 30, f: 10, h: 4 })
    expect(s.solved.f).toBeCloseTo(-10, 9)
    expect(s.solved.v).toBeCloseTo(-7.5, 9)
    expect(s.solved.magnification).toBeCloseTo(0.25, 9)
    expect(s.imageIsVirtual).toBe(true)
    expect(s.verdict).toContain('正立')
    expect(s.verdict).toContain('缩小')
    expect(s.verdict).toContain('虚像')
  })
})

/** 覆盖 u>2f / f<u<2f / 一般三种成像区间。 */
const LENS_CASES: readonly (readonly [number, number])[] = [[30, 10], [15, 10], [24, 8]]

describe('三条特殊光线的几何不变量(错误光路在架构上不可能出现的证明)', () => {
  it('平行主光轴入射的光线,折射后必过后焦点 F(f,0)', () => {
    for (const [u, f] of LENS_CASES) {
      const s = solve('convex-lens', { u, f, h: 4 })
      // 该光线在透镜上的入射点是 (0, h);其折射段必过 (f, 0)
      const refracted = s.segments.filter(seg => seg.role === 'refracted' && Math.abs(seg.from.x) < 1e-9 && Math.abs(seg.from.y - 4) < 1e-9)
      expect(refracted.length, `u=${u} f=${f} 应有平行光线的折射段`).toBeGreaterThan(0)
      expect(passesThrough(refracted[0]!, f, 0), `u=${u} f=${f}:平行光折射后应过焦点`).toBe(true)
    }
  })

  it('过前焦点入射的光线,折射后必平行主光轴(出射段两端等高)', () => {
    for (const [u, f] of LENS_CASES) {
      const s = solve('convex-lens', { u, f, h: 4 })
      const y3 = (-4 * f) / (u - f)
      const emergent = s.segments.filter(seg =>
        seg.role === 'refracted' && Math.abs(seg.from.x) < 1e-9 && Math.abs(seg.from.y - y3) < 1e-9)
      expect(emergent.length, `u=${u} f=${f} 应有过焦点光线的出射段`).toBeGreaterThan(0)
      expect(emergent[0]!.to.y, `u=${u} f=${f}:过焦点光线出射应平行主光轴`).toBeCloseTo(y3, 9)
    }
  })

  it('过光心的光线不偏折(入射与出射共线)', () => {
    const s = solve('convex-lens', { u: 30, f: 10, h: 4 })
    const center = s.segments.find(seg => seg.role === 'refracted' && Math.abs(seg.from.x) < 1e-9 && Math.abs(seg.from.y) < 1e-9)
    expect(center).toBeDefined()
    // 出射段应与「物尖 → 光心」同向共线,即过物尖 (−u, h)
    expect(passesThrough(center!, -30, 4)).toBe(true)
  })

  it('三条光线交于同一像点(实像会聚点唯一)', () => {
    const s = solve('convex-lens', { u: 30, f: 10, h: 4 })
    const v = s.solved.v!, hImg = s.solved.imageHeight!
    const fromLens = s.segments.filter(seg => seg.role === 'refracted' && Math.abs(seg.from.x) < 1e-9)
    expect(fromLens.length).toBe(3)
    for (const seg of fromLens) {
      expect(passesThrough(seg, v, hImg), '每条折射光线都应过像点').toBe(true)
    }
  })
})

describe('平行光入射(2026-07-27 真检缺口:凸透镜最经典的教学场景原本不存在)', () => {
  it('凸透镜:三条平行光全部过焦点 F(f,0)', () => {
    const s = solve('convex-parallel', { f: 10 })
    expect(s.solved.focusX).toBeCloseTo(10, 9)
    const fromLens = s.segments.filter(seg => seg.role === 'refracted' && Math.abs(seg.from.x) < 1e-9)
    expect(fromLens.length).toBe(3)
    for (const seg of fromLens) {
      expect(passesThrough(seg, 10, 0), '每条折射光线都应过焦点').toBe(true)
    }
    expect(s.verdict).toContain('会聚于焦点')
  })

  it('凹透镜:折射光发散,虚线反向延长过虚焦点 F(−f,0)', () => {
    const s = solve('concave-parallel', { f: 10 })
    expect(s.solved.focusX).toBeCloseTo(-10, 9)
    const virtual = s.segments.filter(seg => seg.role === 'virtual')
    expect(virtual.length).toBeGreaterThan(0)
    for (const seg of virtual) {
      expect(passesThrough(seg, -10, 0)).toBe(true)
    }
    expect(s.imageIsVirtual).toBe(true)
  })

  it('平行光场景没有物、没有像:不产出 object/image 线段', () => {
    const s = solve('convex-parallel', { f: 10 })
    expect(s.segments.some(seg => seg.role === 'object' || seg.role === 'image')).toBe(false)
  })

  it('物距远大于焦距自动升格为平行光(u=999 f=10 不再画成 3px 且放大率 0)', () => {
    const s = solve('convex-lens', { u: 999, f: 10 })
    expect(s.kind).toBe('convex-parallel')
    // 绘图范围必须由焦距而非物距决定,否则整幅图被压扁
    expect(s.extent.xMin).toBeGreaterThan(-100)
    expect(s.extent.xMax).toBeLessThan(100)
    expect(s.verdict).toContain('会聚于焦点')
    expect(s.verdict).toContain('按平行光处理')
    // 不得再出现「倒立缩小实像 / 放大率 0」这类退化结论
    expect(s.verdict).not.toContain('放大率')
  })

  it('正常成像区间不受升格影响(u=30 f=10 仍走成像)', () => {
    expect(solve('convex-lens', { u: 30, f: 10, h: 4 }).kind).toBe('convex-lens')
  })
})

describe('平面镜', () => {
  it('像距等于物距,等大正立虚像', () => {
    const s = solve('plane-mirror', { u: 5, h: 3 })
    expect(s.solved.v).toBeCloseTo(5, 9)
    expect(s.solved.magnification).toBeCloseTo(1, 9)
    expect(s.imageIsVirtual).toBe(true)
    expect(s.verdict).toContain('正立等大虚像')
  })

  it('虚光线一律标 virtual(渲染端据此画虚线,虚实区分是教学红线)', () => {
    const s = solve('plane-mirror', { u: 5, h: 3 })
    expect(s.segments.filter(seg => seg.role === 'virtual').length).toBeGreaterThan(0)
  })
})

describe('折射:Snell 定律 n₁sinθ₁ = n₂sinθ₂', () => {
  it('光疏入光密(n1=1 n2=1.5 θ1=45)→ θ2≈28.1°,折射角小于入射角', () => {
    const s = solve('refraction', { n1: 1, n2: 1.5, theta1: 45 })
    const expected = (Math.asin(Math.sin(45 * Math.PI / 180) / 1.5) * 180) / Math.PI
    expect(s.solved.theta2).toBeCloseTo(expected, 9)
    expect(s.solved.theta2!).toBeLessThan(45)
    expect(s.verdict).toContain('向法线偏折')
  })

  it('光密入光疏且超过临界角 → 全反射,不画折射线', () => {
    const s = solve('refraction', { n1: 1.5, n2: 1, theta1: 60 })
    expect(Number.isNaN(s.solved.theta2!)).toBe(true)
    expect(s.solved.criticalAngle).toBeCloseTo((Math.asin(1 / 1.5) * 180) / Math.PI, 9)
    expect(s.verdict).toContain('全反射')
    expect(s.segments.some(seg => seg.role === 'refracted')).toBe(false)
    expect(s.segments.some(seg => seg.role === 'reflected')).toBe(true)
  })

  it('恰好等于临界角时仍可解(不越界抛错)', () => {
    const critical = (Math.asin(1 / 1.5) * 180) / Math.PI
    const s = solve('refraction', { n1: 1.5, n2: 1, theta1: critical - 0.01 })
    expect(Number.isFinite(s.solved.theta2!)).toBe(true)
  })
})

describe('三棱镜色散', () => {
  it('n=1.5 θ1=45 顶角60 → 绿光偏向角 ≈ 37.4°', () => {
    const s = solve('prism', { n: 1.5, theta1: 45, apex: 60 })
    const t2 = Math.asin(Math.sin(45 * Math.PI / 180) / 1.5)
    const t3 = 60 * Math.PI / 180 - t2
    const t4 = Math.asin(1.5 * Math.sin(t3))
    const expected = ((45 * Math.PI / 180) + t4 - 60 * Math.PI / 180) * 180 / Math.PI
    expect(s.solved.deviation).toBeCloseTo(expected, 6)
    expect(s.solved.deviation!).toBeCloseTo(37.4, 1)
  })

  it('出射光线与内部光线位于外法线同侧(符号回归:曾被画到另一侧)', () => {
    // n=1.5 θ1=45 顶角60:绿光出射方向应约 −22.4°,若符号写反会变成 +82.4°
    const s = solve('prism', { n: 1.5, theta1: 45, apex: 60 })
    const exits = s.segments.filter(seg => seg.role === 'refracted' && seg.spectrum === 'green')
    const exit = exits[exits.length - 1]!
    const angle = (Math.atan2(exit.to.y - exit.from.y, exit.to.x - exit.from.x) * 180) / Math.PI
    expect(angle).toBeCloseTo(-22.4, 1)
  })

  it('偏向角随折射率增大而增大:紫 > 绿 > 红(色散本身,与符号约定无关)', () => {
    const s = solve('prism', { n: 1.5, theta1: 45, apex: 60 })
    const incident = s.segments.find(seg => seg.role === 'incident')!
    const inAngle = Math.atan2(incident.to.y - incident.from.y, incident.to.x - incident.from.x)
    /** 出射相对入射的偏折量(绝对值),即偏向角 δ——不依赖旋向符号。 */
    const deviationOf = (spectrum: 'red' | 'green' | 'violet') => {
      const segs = s.segments.filter(seg => seg.role === 'refracted' && seg.spectrum === spectrum)
      const exit = segs[segs.length - 1]!
      const out = Math.atan2(exit.to.y - exit.from.y, exit.to.x - exit.from.x)
      return Math.abs(((out - inAngle + Math.PI) % (2 * Math.PI)) - Math.PI)
    }
    expect(deviationOf('violet')).toBeGreaterThan(deviationOf('green'))
    expect(deviationOf('green')).toBeGreaterThan(deviationOf('red'))
    expect(s.verdict).toContain('紫光偏折最大')
  })

  it('三色各自带光谱标记(渲染端据此分色,否则色散幕是三条同色线)', () => {
    const s = solve('prism', { n: 1.5, theta1: 45, apex: 60 })
    const refracted = s.segments.filter(seg => seg.role === 'refracted')
    expect(refracted.length).toBe(6)
    expect(refracted.every(seg => seg.spectrum !== undefined)).toBe(true)
    expect(new Set(refracted.map(seg => seg.spectrum))).toEqual(new Set(['red', 'green', 'violet']))
  })
})

describe('非法取值一律返回 null(绝不画一条算错的光路)', () => {
  it.each([
    ['convex-lens', { u: -5, f: 10 }],
    ['convex-lens', { u: 30 }],
    ['convex-lens', { f: 10 }],
    ['concave-lens', { u: 30, f: 0 }],
    ['plane-mirror', { u: 0 }],
    ['refraction', { n1: 1, n2: 1.5, theta1: 95 }],
    ['refraction', { n1: 1, theta1: 30 }],
    ['prism', { n: 0.9, theta1: 45 }],
    ['prism', { n: 1.5, theta1: 0 }],
  ])('%s %j → null', (kind, values) => {
    expect(solveOptics({ kind: kind as never, values: values as Record<string, number> })).toBeNull()
  })
})

describe('SVG 投影(此前完全未测——Codex 复审指出"引擎全绿不等于画面正确")', () => {
  const screenAngle = (project: (p: { x: number; y: number }) => { x: number; y: number }, from: { x: number; y: number }, to: { x: number; y: number }) => {
    const a = project(from), b = project(to)
    return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
  }

  it('等比缩放:θ₁=45° 的入射线在屏幕上仍是 45°(独立缩放会画成 55.7°)', () => {
    const s = solve('refraction', { n1: 1, n2: 1.5, theta1: 45 })
    const project = projectOptics(s, 640, 380, 34)
    const incident = s.segments.find(seg => seg.role === 'incident')!
    // 入射线与竖直法线的夹角应等于标注的 θ₁
    const rayAngle = screenAngle(project, incident.from, incident.to)
    const normalAngle = screenAngle(project, { x: 0, y: 1 }, { x: 0, y: -1 })
    expect(Math.abs(rayAngle - normalAngle)).toBeCloseTo(45, 6)
  })

  it('等比缩放:折射角在屏幕上等于求解出的 θ₂', () => {
    const s = solve('refraction', { n1: 1, n2: 1.5, theta1: 60 })
    const project = projectOptics(s, 640, 380, 34)
    const refracted = s.segments.find(seg => seg.role === 'refracted')!
    const rayAngle = screenAngle(project, refracted.from, refracted.to)
    const normalAngle = screenAngle(project, { x: 0, y: 1 }, { x: 0, y: -1 })
    expect(Math.abs(rayAngle - normalAngle)).toBeCloseTo(s.solved.theta2!, 6)
  })

  it('角度承载语义的场景 x/y 缩放系数严格相等', () => {
    const s = solve('refraction', { n1: 1, n2: 1.5, theta1: 45 })
    const project = projectOptics(s, 640, 380, 34)
    const o = project({ x: 0, y: 0 })
    const sx = Math.abs(project({ x: 1, y: 0 }).x - o.x)
    const sy = Math.abs(project({ x: 0, y: 1 }).y - o.y)
    expect(sx).toBeCloseTo(sy, 9)
  })

  it('不变量:凡带角度标签的解,anglesAreSemantic 必须为 true', () => {
    const all = [
      solve('convex-lens', { u: 30, f: 10, h: 4 }),
      solve('concave-lens', { u: 30, f: 10, h: 4 }),
      solve('convex-parallel', { f: 10 }),
      solve('concave-parallel', { f: 10 }),
      solve('plane-mirror', { u: 5, h: 3 }),
      solve('refraction', { n1: 1, n2: 1.5, theta1: 45 }),
      solve('prism', { n: 1.5, theta1: 45, apex: 60 }),
    ]
    for (const s of all) {
      if (s.labels.some(l => l.kind === 'angle')) {
        expect(s.anglesAreSemantic, `${s.kind} 标了角度却允许非等比缩放`).toBe(true)
      }
    }
  })

  it('透镜幕允许纵向夸张(物距远大于物高时不被压成一条线)', () => {
    const s = solve('convex-lens', { u: 30, f: 10, h: 4 })
    expect(s.anglesAreSemantic).toBe(false)
    const project = projectOptics(s, 640, 380, 34)
    const o = project({ x: 0, y: 0 })
    const sy = Math.abs(project({ x: 0, y: 1 }).y - o.y)
    // 物高 4 应占到可视高度的可观比例,而不是几个像素
    expect(sy * 4).toBeGreaterThan(60)
  })

  it('投影后图形落在画布内', () => {
    const s = solve('convex-lens', { u: 30, f: 10, h: 4 })
    const project = projectOptics(s, 640, 380, 34)
    for (const p of [
      { x: s.extent.xMin, y: s.extent.yMin },
      { x: s.extent.xMax, y: s.extent.yMax },
    ]) {
      const q = project(p)
      expect(q.x).toBeGreaterThanOrEqual(0)
      expect(q.x).toBeLessThanOrEqual(640)
      expect(q.y).toBeGreaterThanOrEqual(0)
      expect(q.y).toBeLessThanOrEqual(380)
    }
  })
})

describe('parseOpticsScene', () => {
  it('首行声明场景,其余为取值,# 注释被丢弃', () => {
    const input = parseOpticsScene(['scene|convex-lens', 'u|30   # 物距(cm)', 'f|10', 'h|4'].join('\n'))
    expect(input).toEqual({ kind: 'convex-lens', values: { u: 30, f: 10, h: 4 } })
  })

  it('场景名大小写不敏感,未知场景返回 null', () => {
    expect(parseOpticsScene('scene|CONVEX-LENS\nu|30\nf|10')?.kind).toBe('convex-lens')
    expect(parseOpticsScene('scene|hologram\nu|30')).toBeNull()
    expect(parseOpticsScene('u|30\nf|10')).toBeNull()
    expect(parseOpticsScene('')).toBeNull()
  })

  it('非数值取值被丢弃而非记为 NaN', () => {
    const input = parseOpticsScene('scene|refraction\nn1|1\nn2|abc\ntheta1|45')
    expect(input!.values).toEqual({ n1: 1, theta1: 45 })
    expect(solveOptics(input!)).toBeNull()
  })
})
