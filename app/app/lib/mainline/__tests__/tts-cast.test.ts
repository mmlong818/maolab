import { describe, expect, it } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import { resolveMainlineTtsVoiceId, voiceForMainlineCast } from '../tts-cast.js'

describe('resolveMainlineTtsVoiceId', () => {
  it('保留可直接请求的内置音色和服务端可登记的自定义音色', () => {
    expect(resolveMainlineTtsVoiceId({
      castId: 'student-custom',
      role: 'student',
      gradeBand: 'middle-school',
      configuredVoiceId: 'qiaopi_mengmei',
    })).toBe('qiaopi_mengmei')
    expect(resolveMainlineTtsVoiceId({
      castId: 'student-custom',
      role: 'student',
      gradeBand: 'middle-school',
      configuredVoiceId: 'clone:class-a',
    })).toBe('clone:class-a')
  })

  it('老师的旧语义别名回到固定人设声线', () => {
    expect(resolveMainlineTtsVoiceId({
      castId: 'teacher-professor',
      role: 'teacher',
      gradeBand: 'high-school',
      configuredVoiceId: 'zhipu:professor-chen-stable',
    })).toBe('longhua_v3')
  })

  it.each([
    ['upper-primary', 'student-mei', 'minimax:primary-girl-curious', 'lovely_girl'],
    ['middle-school', 'student-chen', 'zhipu:middle-school-boy-questioning', 'lengdan_xiongzhang'],
    ['high-school', 'student-chen', 'zhipu:middle-school-boy-questioning', 'Chinese (Mandarin)_Gentle_Youth'],
    ['middle-school', 'student-k-physics', 'zhipu:middle-school-student-k', 'chunzhen_xuedi'],
    ['middle-school', 'student-steady', 'zhipu:middle-school-girl-steady', 'danya_xuejie'],
  ] as const)('按学段和学生语义把 %s/%s 解析为同龄声线', (gradeBand, castId, configuredVoiceId, expected) => {
    expect(resolveMainlineTtsVoiceId({
      castId,
      role: 'student',
      gradeBand,
      configuredVoiceId,
    })).toBe(expected)
  })

  it('未知学生也稳定落到本学段同学声线，不回退成老师', () => {
    const input = {
      castId: 'student-new-peer',
      role: 'student' as const,
      gradeBand: 'middle-school' as const,
      configuredVoiceId: 'zhipu:unresolved-semantic-alias',
    }
    const first = resolveMainlineTtsVoiceId(input)
    expect(resolveMainlineTtsVoiceId(input)).toBe(first)
    expect(['chunzhen_xuedi', 'lengdan_xiongzhang', 'qiaopi_mengmei', 'danya_xuejie']).toContain(first)
    expect(first).not.toBe('longxiaochun_v3')
  })

  it('peer 角色与学生一样使用同龄声线', () => {
    expect(resolveMainlineTtsVoiceId({
      castId: 'peer-questioner',
      role: 'peer',
      gradeBand: 'high-school',
      configuredVoiceId: 'zhipu:boy-questioning',
    })).toBe('Chinese (Mandarin)_Gentle_Youth')
  })
})

describe('voiceForMainlineCast', () => {
  it('旧样板课的自定义学生卡司不再错误使用老师声线', () => {
    const primary = GOLDEN_MAINLINE_COURSES.find(course => course.castProfiles.some(cast => cast.id === 'student-mei'))!
    const humanities = GOLDEN_MAINLINE_COURSES.find(course => course.castProfiles.some(cast => cast.id === 'student-chen'))!
    const physics = GOLDEN_MAINLINE_COURSES.find(course => course.castProfiles.some(cast => cast.id === 'student-k-physics'))!

    expect(voiceForMainlineCast(primary, 'student-mei')).toBe('lovely_girl')
    expect(voiceForMainlineCast(humanities, 'student-chen')).toBe('lengdan_xiongzhang')
    expect(voiceForMainlineCast(physics, 'student-k-physics')).toBe('chunzhen_xuedi')
  })
})
