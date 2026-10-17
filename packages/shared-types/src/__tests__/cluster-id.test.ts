/**
 * cluster id 格式 + 灰度断言测试
 *
 * 守门 v11 cluster 待续 #2 实施:
 *   - 新 cluster id 必须 clst_ULID 格式
 *   - isValidClusterId 兼容旧 UUID 读取
 *   - assertClusterId 严格模式 (env) 阻断旧格式新增
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  newClusterId,
  newKpId,
  isValidClusterId,
  assertClusterId,
  CLUSTER_ID_PREFIX,
} from '../knowledge-point.js'

describe('newClusterId', () => {
  it('返回 clst_ 前缀 + 26 字符 ULID', () => {
    const id = newClusterId()
    expect(id).toMatch(/^clst_[0-9A-HJKMNP-TV-Z]{26}$/)
    expect(id.length).toBe(31)
    expect(id.startsWith(CLUSTER_ID_PREFIX)).toBe(true)
  })

  it('生成不重复', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) ids.add(newClusterId())
    expect(ids.size).toBe(100)
  })
})

describe('newKpId (未切, 仍是 UUID)', () => {
  it('返回 36 字符 v4 UUID 不带 clst_ 前缀', () => {
    const id = newKpId()
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
    expect(id.startsWith(CLUSTER_ID_PREFIX)).toBe(false)
  })
})

describe('isValidClusterId', () => {
  it('接受新格式 (clst_ULID)', () => {
    expect(isValidClusterId(newClusterId())).toBe(true)
    expect(isValidClusterId('clst_01HXQK5J9X3F7G4M2N5P8R9T6V')).toBe(true)
  })

  it('接受旧格式 (v4 UUID)', () => {
    expect(isValidClusterId('550e8400-e29b-41d4-a716-446655440000')).toBe(true)
    expect(isValidClusterId('00000000-0000-0000-0000-000000000000')).toBe(true)
  })

  it('拒绝杂乱字符串', () => {
    expect(isValidClusterId('')).toBe(false)
    expect(isValidClusterId('clst_')).toBe(false)
    expect(isValidClusterId('clst_too-short')).toBe(false)
    expect(isValidClusterId('clst_lowercase01234567890abcdef')).toBe(false) // ULID 不含小写
    expect(isValidClusterId('not-a-uuid')).toBe(false)
    expect(isValidClusterId(undefined)).toBe(false)
    expect(isValidClusterId(null)).toBe(false)
    expect(isValidClusterId(42)).toBe(false)
  })
})

describe('assertClusterId (非严格模式 = 默认)', () => {
  beforeEach(() => {
    delete process.env.MAOLAB_STRICT_CLUSTER_ID
  })

  it('新格式通过', () => {
    expect(() => assertClusterId(newClusterId())).not.toThrow()
  })

  it('旧 UUID 通过 (灰度兼容)', () => {
    expect(() => assertClusterId('550e8400-e29b-41d4-a716-446655440000')).not.toThrow()
  })

  it('非法字符串抛错', () => {
    expect(() => assertClusterId('garbage')).toThrow(/not a valid cluster id/)
    expect(() => assertClusterId('clst_')).toThrow()
  })

  it('非字符串抛错', () => {
    expect(() => assertClusterId(undefined)).toThrow(/expected string/)
    expect(() => assertClusterId(42)).toThrow(/expected string/)
  })
})

describe('assertClusterId (严格模式 MAOLAB_STRICT_CLUSTER_ID=1)', () => {
  beforeEach(() => {
    process.env.MAOLAB_STRICT_CLUSTER_ID = '1'
  })
  afterEach(() => {
    delete process.env.MAOLAB_STRICT_CLUSTER_ID
  })

  it('新格式通过', () => {
    expect(() => assertClusterId(newClusterId())).not.toThrow()
  })

  it('旧 UUID 被阻断 (强制新代码用新格式)', () => {
    expect(() => assertClusterId('550e8400-e29b-41d4-a716-446655440000')).toThrow(/strict/)
  })

  it('非法字符串抛错且 message 含 strict', () => {
    expect(() => assertClusterId('garbage')).toThrow(/strict/)
  })
})
