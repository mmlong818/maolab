import { describe, expect, it } from 'vitest'
import { GOLDEN_MAINLINE_COURSES } from '../../samples.js'
import { refreshCourseCast, refreshableCastIssues } from '../cast-refresh.js'
import type { CastProfile, MainlineCourse, VoiceProfile } from '../../domain.js'

function legacyUpperPrimaryMath(): MainlineCourse {
  const source = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  return {
    ...source,
    id: 'legacy-upper-primary-math',
    gradeBand: 'upper-primary',
    subject: 'math',
    qualityStatus: 'passed',
    teacherSubjectProfile: { ...source.teacherSubjectProfile, subject: 'chinese' },
    gradeAdaptationProfile: { ...source.gradeAdaptationProfile, gradeBand: 'lower-primary' },
  }
}

function activeCustomStudent(course: MainlineCourse, cast: CastProfile, voice: VoiceProfile): MainlineCourse {
  const target = course.scenes[1]!
  return {
    ...course,
    castProfiles: [...course.castProfiles, cast],
    voiceProfiles: [...course.voiceProfiles, voice],
    scenes: course.scenes.map(scene => scene.id === target.id ? {
      ...scene,
      characterLayer: { ...scene.characterLayer, castId: cast.id },
      voiceCue: { ...scene.voiceCue, castId: cast.id },
    } : scene),
  }
}

describe('refreshCourseCast · 存量课程角色翻新', () => {
  it('按本课学段与学科重建老师、同学和声线，不覆盖任何教学内容', () => {
    const course = legacyUpperPrimaryMath()
    const teachingContent = course.scenes.map(scene => ({
      id: scene.id,
      contentSlots: scene.contentSlots,
      boardText: scene.boardText,
      teacherScript: scene.teacherScript,
      studentAction: scene.studentAction,
      evidenceOnScreen: scene.evidenceOnScreen,
      imageUrl: scene.imageUrl,
      editedByTeacher: scene.editedByTeacher,
    }))
    expect(refreshableCastIssues(course).length).toBeGreaterThan(0)

    const result = refreshCourseCast(course)

    expect(refreshableCastIssues(result.course)).toEqual([])
    expect(result.course.teacherSubjectProfile.subject).toBe('math')
    expect(result.course.gradeAdaptationProfile.gradeBand).toBe('upper-primary')
    expect(result.course.castProfiles.every(cast => (
      ![result.course.selectedTeacher, result.course.peerRoleProfile.peerId].includes(cast.id)
      || (cast.gradeFit.includes('upper-primary') && cast.subjectFit.includes('math'))
    ))).toBe(true)
    expect(result.course.scenes.map(scene => ({
      id: scene.id,
      contentSlots: scene.contentSlots,
      boardText: scene.boardText,
      teacherScript: scene.teacherScript,
      studentAction: scene.studentAction,
      evidenceOnScreen: scene.evidenceOnScreen,
      imageUrl: scene.imageUrl,
      editedByTeacher: scene.editedByTeacher,
    }))).toEqual(teachingContent)
    expect(course.teacherSubjectProfile.subject).toBe('chinese')
  })

  it('实际登场但错学段错学科的额外同学映射到新同学，额外档案作为闲置资产保留', () => {
    const base = legacyUpperPrimaryMath()
    const staleStudent: CastProfile = {
      id: 'custom-stale-student',
      role: 'student',
      displayName: '旧同学',
      identity: '低年级语文同学',
      gradeFit: ['lower-primary'],
      subjectFit: ['chinese'],
      visualIdentity: '自定义角色',
      expressionSet: ['neutral'],
    }
    const course = activeCustomStudent(base, staleStudent, {
      castId: staleStudent.id,
      voiceId: 'female-tianmei-jingpin',
      pace: 'medium',
      emotionRange: ['calm'],
      stabilityRule: '保持同一声线',
    })
    const targetId = course.scenes[1]!.id

    const result = refreshCourseCast(course)

    expect(result.remappedSceneIds).toContain(targetId)
    expect(result.course.scenes[1]!.characterLayer.castId).toBe(result.course.peerRoleProfile.peerId)
    expect(result.course.scenes[1]!.voiceCue.castId).toBe(result.course.peerRoleProfile.peerId)
    expect(result.course.castProfiles.some(cast => cast.id === staleStudent.id)).toBe(true)
    expect(refreshableCastIssues(result.course)).toEqual([])
  })

  it('已经适配本课的自定义登场角色与其声线保持不变', () => {
    const base = legacyUpperPrimaryMath()
    const customStudent: CastProfile = {
      id: 'custom-fit-student',
      role: 'peer',
      displayName: '数学搭档',
      identity: '小学高年级数学学习搭档',
      gradeFit: ['upper-primary'],
      subjectFit: ['math'],
      visualIdentity: '自定义角色',
      expressionSet: ['neutral'],
    }
    const customVoice: VoiceProfile = {
      castId: customStudent.id,
      voiceId: 'female-tianmei-jingpin',
      pace: 'medium',
      emotionRange: ['calm'],
      stabilityRule: '保持同一声线',
    }
    const course = activeCustomStudent(base, customStudent, customVoice)

    const result = refreshCourseCast(course)

    expect(result.course.scenes[1]!.characterLayer.castId).toBe(customStudent.id)
    expect(result.course.scenes[1]!.voiceCue.castId).toBe(customStudent.id)
    expect(result.course.castProfiles).toContainEqual(customStudent)
    expect(result.course.voiceProfiles).toContainEqual(customVoice)
  })

  it('事实核查阻断不会被角色刷新洗白', () => {
    const course: MainlineCourse = {
      ...legacyUpperPrimaryMath(),
      factAudit: {
        auditedAt: '2026-08-21T00:00:00.000Z',
        auditedSceneCount: 1,
        fatalCount: 1,
        issues: [{
          id: 'fact-block',
          severity: 'blocking',
          targetId: 'scene-1',
          message: '事实错误',
          impact: '会误导学生',
          fix: '按教材修正',
        }],
      },
    }

    expect(refreshCourseCast(course).course.qualityStatus).toBe('blocked')
  })
})
