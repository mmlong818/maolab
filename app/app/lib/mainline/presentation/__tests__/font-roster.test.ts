import { describe, it, expect } from 'vitest'
import { FONT_STACKS, READABLE_FONT_ROLES, type FontRole, type ReadableFontRole } from '../tokens.js'
import { STYLE_PACKS } from '../style-packs.js'
import { allImportedInstances } from '../imported-packs.js'
import { ACTIVE_COLOR_ANCHORS } from '../anchors.js'
import { PACK_MOODS, PAPER_TINTS, TEXTURE_SIGNATURES, derivePackInstance } from '../pack-families.js'

/**
 * 字体清单硬指标测试 · docs/design-refresh/hard-targets-spec.md 指标 2「字体 ≥10 族」
 *
 * 三档口径(精修 6 + 引进 89 + 生成 48 锚×6 mood×8 tint×8 质感,与 style-packs/imported-packs/
 * pack-families 各自的规模测试同源)合并统计每个 FontRole 被多少个包的
 * typography.display / typography.body 引用,断言:
 * - FONT_STACKS 恰好 10 族(不多不少,防止悄悄加了字体没接测试、或漏删旧字体)。
 * - 每族至少被 5 个包引用(display 或 body 任一命中即算,防"挂名不用")。
 * - body 档只出现 READABLE_FONT_ROLES 子集(可读性约束,防美术体被排进正文)。
 */

const ALL_ROLES: readonly FontRole[] = [
  'kai', 'song', 'hei', 'xiaowei', 'huangyou', 'kuaile', 'mashan', 'longcang', 'zhimang', 'liujian',
]

function allPacks(): readonly { typography: { display: FontRole; body: ReadableFontRole } }[] {
  const precision = Object.values(STYLE_PACKS)
  const imported = allImportedInstances()
  const generated = ACTIVE_COLOR_ANCHORS.flatMap(anchor =>
    PACK_MOODS.flatMap(mood =>
      PAPER_TINTS.flatMap(tint =>
        TEXTURE_SIGNATURES.map(texture => derivePackInstance(anchor, mood, tint, texture)),
      ),
    ),
  )
  return [...precision, ...imported, ...generated]
}

describe('font-roster · 十族字体分配', () => {
  it('FONT_STACKS 恰好 10 族,与声明的角色清单一一对应', () => {
    const keys = Object.keys(FONT_STACKS).sort()
    expect(keys).toEqual([...ALL_ROLES].sort())
    expect(keys.length).toBe(10)
  })

  it('READABLE_FONT_ROLES 是 kai/song/hei 三族,body 档只许出现这三族', () => {
    expect([...READABLE_FONT_ROLES].sort()).toEqual(['hei', 'kai', 'song'])
  })

  it('每族(含 7 个新增美术/书法体)至少被 5 个包引用(display 或 body)', () => {
    const packs = allPacks()
    expect(packs.length).toBe(6 + 110 + 39 * 6 * 8 * 8)

    const refCount: Record<FontRole, number> = Object.fromEntries(ALL_ROLES.map(r => [r, 0])) as Record<FontRole, number>
    for (const pack of packs) {
      const seen = new Set<FontRole>([pack.typography.display, pack.typography.body])
      for (const role of seen) refCount[role] += 1
    }

    for (const role of ALL_ROLES) {
      expect(refCount[role], `字体角色 "${role}" 引用包数`).toBeGreaterThanOrEqual(5)
    }
  })

  it('全部包的 typography.body 都落在可读三族内(可读性约束)', () => {
    const packs = allPacks()
    const readable = new Set(READABLE_FONT_ROLES)
    for (const pack of packs) {
      expect(readable.has(pack.typography.body), `body 字体 "${pack.typography.body}" 应为可读三族`).toBe(true)
    }
  })
})
