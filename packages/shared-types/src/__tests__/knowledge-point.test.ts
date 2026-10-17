import { describe, it, expect } from 'vitest'
import {
  SOURCE_PRIORITY,
  SourceRefSchema,
  KnowledgePointSchema,
  KnowledgePointClusterSchema,
  computeCanonicalHash,
  newKpId,
  newClusterId,
  pickWinningSource,
  type SourceRef,
  type KnowledgePoint
} from '../knowledge-point.js'

const now = 1_700_000_000_000

function mkSource(kind: SourceRef['kind'], capturedAt = now): SourceRef {
  return { kind, capturedAt }
}

describe('knowledge-point', () => {
  describe('newKpId / newClusterId', () => {
    it('returns a non-empty string id (UUID 36-char during transition)', () => {
      const id = newKpId()
      expect(typeof id).toBe('string')
      // 26 ULID or 36 UUID — both acceptable in the transition window
      expect([26, 36]).toContain(id.length)
      expect(newKpId()).not.toBe(id)
    })

    it('newClusterId 返回 31 字符 clst_ULID (2026-05-26 起)', () => {
      const cid = newClusterId()
      expect(typeof cid).toBe('string')
      expect(cid.length).toBe(31)
      expect(cid.startsWith('clst_')).toBe(true)
    })
  })

  describe('computeCanonicalHash', () => {
    it('same input → same hash', () => {
      const a = computeCanonicalHash({ canonicalNameEn: 'Pythagorean Theorem', subject: 'math', gradeBand: 'junior-high' })
      const b = computeCanonicalHash({ canonicalNameEn: 'Pythagorean Theorem', subject: 'math', gradeBand: 'junior-high' })
      expect(a).toBe(b)
      expect(a).toHaveLength(16)
    })

    it('different input → different hash', () => {
      const a = computeCanonicalHash({ canonicalNameEn: 'Pythagorean Theorem', subject: 'math' })
      const b = computeCanonicalHash({ canonicalNameEn: "Newton's Second Law", subject: 'physics' })
      expect(a).not.toBe(b)
    })

    it('is case-insensitive on inputs', () => {
      const a = computeCanonicalHash({ canonicalNameEn: 'Pythagorean Theorem', subject: 'Math' })
      const b = computeCanonicalHash({ canonicalNameEn: 'pythagorean theorem', subject: 'math' })
      expect(a).toBe(b)
    })
  })

  describe('pickWinningSource (D1.2 priority table)', () => {
    it('manual > pep-cn > llm > external-kg', () => {
      const all: SourceRef[] = [
        mkSource('external-kg'),
        mkSource('llm'),
        mkSource('pep-cn'),
        mkSource('manual')
      ]
      expect(pickWinningSource(all)?.kind).toBe('manual')

      const withoutManual = all.filter(s => s.kind !== 'manual')
      expect(pickWinningSource(withoutManual)?.kind).toBe('pep-cn')

      const onlyLowest: SourceRef[] = [mkSource('external-kg'), mkSource('llm')]
      expect(pickWinningSource(onlyLowest)?.kind).toBe('llm')
    })

    it('same priority → first in array wins', () => {
      const first = mkSource('llm', 1)
      const second = mkSource('llm', 2)
      expect(pickWinningSource([first, second])).toBe(first)
    })

    it('empty array → null', () => {
      expect(pickWinningSource([])).toBeNull()
    })

    it('SOURCE_PRIORITY order is stable contract', () => {
      expect(SOURCE_PRIORITY).toEqual(['manual', 'pep-cn', 'llm', 'external-kg'])
    })
  })

  describe('zod schemas', () => {
    const validKp: KnowledgePoint = {
      id: newKpId(),
      clusterId: newClusterId(),
      canonicalName: '勾股定理',
      canonicalNameEn: 'Pythagorean Theorem',
      aliases: ['毕达哥拉斯定理'],
      subject: 'math',
      gradeBand: 'junior-high',
      curriculumSystem: 'pep-2019',
      canonicalHash: computeCanonicalHash({
        canonicalNameEn: 'Pythagorean Theorem',
        subject: 'math',
        gradeBand: 'junior-high'
      }),
      provenance: {
        sourceRefs: [{ kind: 'pep-cn', systemId: 'pep-2019', capturedAt: now }]
      },
      createdAt: now,
      updatedAt: now
    }

    it('parses a valid KnowledgePoint', () => {
      expect(() => KnowledgePointSchema.parse(validKp)).not.toThrow()
    })

    it('rejects KnowledgePoint missing clusterId', () => {
      const { clusterId: _drop, ...bad } = validKp
      expect(() => KnowledgePointSchema.parse(bad)).toThrow()
    })

    it('rejects SourceRef with unknown kind', () => {
      expect(() =>
        SourceRefSchema.parse({ kind: 'wikipedia', capturedAt: now })
      ).toThrow()
    })

    it('parses a valid KnowledgePointCluster', () => {
      const cluster = {
        id: newClusterId(),
        canonicalNameEn: 'pythagorean theorem',
        canonicalNamesByLocale: { zh: '勾股定理', ja: 'ピタゴラスの定理' },
        subject: 'math',
        memberKpIds: [validKp.id],
        createdAt: now,
        updatedAt: now
      }
      expect(() => KnowledgePointClusterSchema.parse(cluster)).not.toThrow()
    })
  })
})
