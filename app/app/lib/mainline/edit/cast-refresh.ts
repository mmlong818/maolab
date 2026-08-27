/**
 * cast-refresh · 存量课程角色契约翻新
 *
 * 旧课会把样板课的老师、同学和声线原样带进别的学段或学科。质量闸门已经会
 * 阻断这些课程；这里提供对应的确定性修复：重新使用当前 gradeBand × subject
 * 卡司预设，只改角色身份、音色和逐幕角色引用，不碰任何教学内容字段。
 *
 * 课程自带的额外角色默认保留。只有旧主讲老师、旧同学，以及实际登场但学段或
 * 学科不适配的 teacher/student/peer 会按角色职责映射到新预设；无法可靠判断职责
 * 的 narrator 等角色保持原样，让质量闸门继续阻断，避免静默改错。
 */

import type { CastProfile, MainlineCourse } from '../domain.js'
import { auditCourseReleaseReadiness } from '../readiness.js'
import { auditMainlineCourse, type QualityIssue } from '../quality-gates.js'
import { pickCastPreset } from '../generation/cast-preset.js'

export interface RefreshCourseCastResult {
  course: MainlineCourse
  issues: QualityIssue[]
  matched: ReturnType<typeof pickCastPreset>['matched']
  remappedSceneIds: string[]
  replacedCastIds: string[]
}

function uniqueById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function uniqueVoices<T extends { castId: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>()
  return items.filter(item => {
    if (seen.has(item.castId)) return false
    seen.add(item.castId)
    return true
  })
}

function castFitsCourse(cast: CastProfile, course: MainlineCourse): boolean {
  return cast.gradeFit.includes(course.gradeBand) && cast.subjectFit.includes(course.subject)
}

export function refreshableCastIssues(course: MainlineCourse): QualityIssue[] {
  return auditMainlineCourse(course).filter(issue => (
    issue.gate === 'cast-voice-grade' && issue.severity === 'blocking'
  ))
}

export function refreshCourseCast(course: MainlineCourse): RefreshCourseCastResult {
  const { preset, matched } = pickCastPreset({ gradeBand: course.gradeBand, subject: course.subject })
  const oldCastById = new Map(course.castProfiles.map(cast => [cast.id, cast]))
  const oldTeacherId = course.selectedTeacher
  const oldPeerId = course.peerRoleProfile.peerId
  const presetCastIds = new Set(preset.castProfiles.map(cast => cast.id))
  const replacedCastIds = new Set<string>([oldTeacherId, oldPeerId])

  function remapCastId(castId: string | undefined): string | undefined {
    if (!castId) return castId
    if (castId === oldTeacherId) return preset.selectedTeacher
    if (castId === oldPeerId) return preset.peerRoleProfile.peerId

    const cast = oldCastById.get(castId)
    if (!cast || castFitsCourse(cast, course)) return castId
    if (cast.role === 'teacher') {
      replacedCastIds.add(castId)
      return preset.selectedTeacher
    }
    if (cast.role === 'student' || cast.role === 'peer') {
      replacedCastIds.add(castId)
      return preset.peerRoleProfile.peerId
    }
    return castId
  }

  const remappedSceneIds: string[] = []
  const scenes = course.scenes.map(scene => {
    const characterCastId = remapCastId(scene.characterLayer.castId)
    const voiceCastId = remapCastId(scene.voiceCue.castId)
    if (characterCastId === scene.characterLayer.castId && voiceCastId === scene.voiceCue.castId) return scene
    remappedSceneIds.push(scene.id)
    return {
      ...scene,
      characterLayer: { ...scene.characterLayer, ...(characterCastId ? { castId: characterCastId } : {}) },
      voiceCue: { ...scene.voiceCue, ...(voiceCastId ? { castId: voiceCastId } : {}) },
    }
  })

  const replacedPrimaryIds = new Set([oldTeacherId, oldPeerId])
  const preservedCast = course.castProfiles.filter(cast => (
    !replacedPrimaryIds.has(cast.id) && !presetCastIds.has(cast.id)
  ))
  const preservedCastIds = new Set(preservedCast.map(cast => cast.id))
  const castProfiles = uniqueById([...preset.castProfiles, ...preservedCast])
  const voiceProfiles = uniqueVoices([
    ...preset.voiceProfiles,
    ...course.voiceProfiles.filter(voice => preservedCastIds.has(voice.castId)),
  ])

  const candidate: MainlineCourse = {
    ...course,
    selectedTeacher: preset.selectedTeacher,
    teacherSubjectProfile: preset.teacherSubjectProfile,
    peerRoleProfile: preset.peerRoleProfile,
    castProfiles,
    voiceProfiles,
    gradeAdaptationProfile: preset.gradeAdaptationProfile,
    scenes,
    // 用 passed 作为重新判定的候选状态，允许一次确定性修复真正解除旧 blocked；
    // readiness 仍会合并事实核查、未验证和当前所有确定性阻断。
    qualityStatus: course.qualityStatus === 'draft' ? 'draft' : 'passed',
  }
  const readiness = auditCourseReleaseReadiness(candidate)
  const refreshed: MainlineCourse = {
    ...candidate,
    qualityStatus: course.qualityStatus === 'draft'
      ? 'draft'
      : readiness.ready ? 'passed' : 'blocked',
  }

  return {
    course: refreshed,
    issues: readiness.deterministicIssues,
    matched,
    remappedSceneIds,
    replacedCastIds: [...replacedCastIds].filter(Boolean),
  }
}
