import { describe, expect, it } from 'vitest'
import {
  classroomLessonCanComplete,
  classroomSessionStorageKey,
  parseClassroomSessionProgress,
  practiceFeedbackForSavedScenes,
  serializeClassroomSessionProgress,
  type ClassroomSessionProgressInput,
} from '../classroom-session.js'
import { openingAttemptStateKey, type LessonOpeningAttempt } from '../lesson-phase.js'
import { recapTransferStateKey, type RecapTransferAttempt } from '../recap-template.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import { stagedLearningConfig, stagedLearningStateKey, type StagedPostRevealRecord } from '../staged-learning.js'

const NOW = Date.parse('2026-08-21T13:50:00.000Z')

function fixture() {
  const course = structuredClone(GOLDEN_MAINLINE_COURSES[0]!)
  const opening = course.scenes.find(scene => scene.sceneType === 'source-reading')!
  const contrast = course.scenes.find(scene => scene.sceneType === 'contrast')!
  const recap = course.scenes.find(scene => scene.sceneType === 'recap')!
  recap.contentSlots.transferTask = '如果只把参照物从地面换成同速行驶的汽车，判断物体运动状态并说明依据。'
  const openingKey = openingAttemptStateKey(course.id, opening.id)
  const contrastKey = stagedLearningStateKey(course.id, contrast.id)
  const transferKey = recapTransferStateKey(course.id, recap.id)
  const progress: ClassroomSessionProgressInput = {
    sessionId: 'session-refresh-test',
    sceneId: recap.id,
    openingAttempts: {
      [openingKey]: {
        responseMode: 'typed',
        response: '我预测要先明确判断对象，因为同一物体相对不同参照物结论可能不同。',
        confidence: 'medium',
      },
    },
    stagedAttempts: {
      [contrastKey]: {
        mode: 'typed',
        confidence: 'medium',
        responses: ['这句话忽略了参照物，依据是位置变化必须相对参照物判断。'],
      },
    },
    revealedLearningFeedback: { [contrastKey]: true },
    postRevealRecords: {
      [contrastKey]: {
        mode: 'typed',
        comparison: 'revised',
        responses: ['应改为相对所选参照物位置不变才静止，关键条件是参照物。'],
      },
    },
    recapTransferAttempts: {
      [transferKey]: {
        mode: 'typed',
        confidence: 'medium',
        response: '判断可能改变，因为参照物变化后，相对位置是否变化也要重新比较。',
        reviewDecision: 'kept',
        reviewNote: '我会保留原答，因为已说明改变了参照物，并根据相对位置变化说明依据。',
      },
    },
  }
  return { course, contrast, contrastKey, openingKey, transferKey, progress }
}

function completionFixture() {
  const { course, openingKey, progress, transferKey } = fixture()
  const openingAttempts: Record<string, LessonOpeningAttempt> = {
    [openingKey]: {
      ...progress.openingAttempts[openingKey]!,
      revision: '我会修正原判断，因为需要根据页面证据说明结论。',
    },
  }
  const revealedLearningFeedback: Record<string, boolean> = {}
  const postRevealRecords: Record<string, StagedPostRevealRecord | undefined> = {}
  const practiceEvidenceSaved: Record<string, boolean> = {}
  const recapTransferAttempts: Record<string, RecapTransferAttempt | undefined> = {
    [transferKey]: progress.recapTransferAttempts?.[transferKey],
  }

  for (const scene of course.scenes) {
    const config = stagedLearningConfig(scene)
    if (!config) continue
    const key = stagedLearningStateKey(course.id, scene.id)
    revealedLearningFeedback[key] = true
    if (config.sceneType === 'practice' && scene.kpId) {
      practiceEvidenceSaved[key] = true
    } else if (config.sceneType !== 'practice') {
      postRevealRecords[key] = {
        mode: 'typed',
        comparison: 'revised',
        responses: config.promptItems.map(() => '我会修正原判断，因为需要补上关键依据。'),
      }
    }
  }

  return {
    course,
    openingAttempts,
    revealedLearningFeedback,
    postRevealRecords,
    practiceEvidenceSaved,
    recapTransferAttempts,
  }
}

describe('课堂会话刷新恢复', () => {
  it('只在当前标签页的课程键下保存，并恢复完整的揭晓前后证据链', () => {
    const { course, contrastKey, openingKey, transferKey, progress } = fixture()

    const raw = serializeClassroomSessionProgress(course, progress, NOW)
    const restored = parseClassroomSessionProgress(raw, course, NOW + 1_000)

    expect(classroomSessionStorageKey(course.id)).toBe(`maolab-mainline-classroom:${course.id}`)
    expect(restored).toMatchObject({
      sessionId: 'session-refresh-test',
      sceneId: progress.sceneId,
      openingAttempts: { [openingKey]: progress.openingAttempts[openingKey] },
      stagedAttempts: { [contrastKey]: progress.stagedAttempts[contrastKey] },
      revealedLearningFeedback: { [contrastKey]: true },
      postRevealRecords: { [contrastKey]: progress.postRevealRecords[contrastKey] },
      recapTransferAttempts: { [transferKey]: progress.recapTransferAttempts?.[transferKey] },
    })
  })

  it('课程内容改变或会话超过十二小时后不恢复旧课堂进度', () => {
    const { course, progress } = fixture()
    const raw = serializeClassroomSessionProgress(course, progress, NOW)
    const editedCourse = structuredClone(course)
    editedCourse.scenes[0]!.contentSlots.openingQuestion = '教师刚刚修改后的新问题'

    expect(parseClassroomSessionProgress(raw, editedCourse, NOW + 1_000)).toBeNull()
    expect(parseClassroomSessionProgress(raw, course, NOW + 12 * 60 * 60 * 1_000 + 1)).toBeNull()
  })

  it('缺少把握度或揭晓后核对结果时不恢复伪完整证据链', () => {
    const { course, contrastKey, progress } = fixture()
    const withoutConfidence = JSON.parse(
      serializeClassroomSessionProgress(course, progress, NOW),
    ) as {
      stagedAttempts: Record<string, Record<string, unknown>>
      postRevealRecords: Record<string, Record<string, unknown>>
    }
    delete withoutConfidence.stagedAttempts[contrastKey]!.confidence
    const noAttempt = parseClassroomSessionProgress(JSON.stringify(withoutConfidence), course, NOW + 1_000)!
    expect(noAttempt.stagedAttempts[contrastKey]).toBeUndefined()
    expect(noAttempt.revealedLearningFeedback[contrastKey]).toBeUndefined()
    expect(noAttempt.postRevealRecords[contrastKey]).toBeUndefined()

    const withoutComparison = JSON.parse(
      serializeClassroomSessionProgress(course, progress, NOW),
    ) as {
      postRevealRecords: Record<string, Record<string, unknown>>
    }
    delete withoutComparison.postRevealRecords[contrastKey]!.comparison
    const noComparison = parseClassroomSessionProgress(JSON.stringify(withoutComparison), course, NOW + 1_000)!
    expect(noComparison.stagedAttempts[contrastKey]).toEqual(progress.stagedAttempts[contrastKey])
    expect(noComparison.revealedLearningFeedback[contrastKey]).toBe(true)
    expect(noComparison.postRevealRecords[contrastKey]).toBeUndefined()
  })

  it('缺少课堂会话编号时拒绝恢复，避免新课堂继承旧完成状态', () => {
    const { course, progress } = fixture()
    const raw = JSON.parse(serializeClassroomSessionProgress(course, progress, NOW)) as Record<string, unknown>
    delete raw.sessionId

    expect(parseClassroomSessionProgress(JSON.stringify(raw), course, NOW + 1_000)).toBeNull()
  })

  it('缺少对照成功标准后的保留或修正记录时，不恢复伪完成迁移题', () => {
    const { course, transferKey, progress } = fixture()
    const raw = JSON.parse(serializeClassroomSessionProgress(course, progress, NOW)) as {
      recapTransferAttempts: Record<string, Record<string, unknown>>
    }
    delete raw.recapTransferAttempts[transferKey]!.reviewDecision
    delete raw.recapTransferAttempts[transferKey]!.reviewNote

    const restored = parseClassroomSessionProgress(JSON.stringify(raw), course, NOW + 1_000)!
    expect(restored.recapTransferAttempts[transferKey]).toBeUndefined()
  })

  it('不从浏览器缓存恢复正式练习的揭晓或完成标记', () => {
    const { course, progress } = fixture()
    const practice = structuredClone(course.scenes.find(scene => scene.sceneType === 'contrast')!)
    practice.id = 'practice-session-test'
    practice.sceneType = 'practice'
    practice.kpId = 'kp-session-test'
    practice.contentSlots = {
      task: '判断物体是否运动并说明参照物。',
      feedback: '先明确参照物，再比较位置是否变化。',
    }
    course.scenes.splice(-1, 0, practice)
    const practiceKey = stagedLearningStateKey(course.id, practice.id)
    const forged: ClassroomSessionProgressInput = {
      ...progress,
      stagedAttempts: {
        ...progress.stagedAttempts,
        [practiceKey]: { mode: 'typed', confidence: 'high', responses: ['相对地面运动。'] },
      },
      revealedLearningFeedback: {
        ...progress.revealedLearningFeedback,
        [practiceKey]: true,
      },
      postRevealRecords: {
        ...progress.postRevealRecords,
        [practiceKey]: { mode: 'typed', comparison: 'revised', responses: ['已订正。'] },
      },
    }

    const restored = parseClassroomSessionProgress(
      serializeClassroomSessionProgress(course, forged, NOW),
      course,
      NOW + 1_000,
    )!

    expect(restored.stagedAttempts[practiceKey]).toBeUndefined()
    expect(restored.revealedLearningFeedback[practiceKey]).toBeUndefined()
    expect(restored.postRevealRecords[practiceKey]).toBeUndefined()
  })

  it('只在服务端确认练习记录有效后恢复专属反馈展示，且不把展示文字当成完成证据', () => {
    const { course, progress } = fixture()
    const practice = structuredClone(course.scenes.find(scene => scene.sceneType === 'contrast')!)
    practice.id = 'practice-feedback-refresh'
    practice.sceneType = 'practice'
    practice.kpId = 'kp-feedback-refresh'
    practice.contentSlots = {
      task: '判断物体是否运动并说明参照物。',
      feedback: '先明确参照物，再比较位置是否变化。',
    }
    course.scenes.splice(-1, 0, practice)
    const practiceKey = stagedLearningStateKey(course.id, practice.id)
    const display = {
      outcome: 'incorrect' as const,
      label: '针对这处偏差再练',
      message: '按你的原答与订正：先替换错误规则，再遮住反馈重做。',
    }
    const restored = parseClassroomSessionProgress(
      serializeClassroomSessionProgress(course, {
        ...progress,
        practiceFeedbackByScene: { [practiceKey]: display },
      }, NOW),
      course,
      NOW + 1_000,
    )!

    expect(restored.practiceFeedbackByScene[practiceKey]).toEqual(display)
    expect(restored.revealedLearningFeedback[practiceKey]).toBeUndefined()
    expect(practiceFeedbackForSavedScenes(course, [], restored.practiceFeedbackByScene)).toEqual({})
    expect(practiceFeedbackForSavedScenes(
      course,
      [practice.id],
      restored.practiceFeedbackByScene,
    )).toEqual({ [practiceKey]: display })
  })

  it('丢弃缺少揭晓前作答的反馈状态，避免刷新后直接泄露答案', () => {
    const { course, contrastKey, progress } = fixture()
    const incomplete: ClassroomSessionProgressInput = {
      ...progress,
      stagedAttempts: {},
      revealedLearningFeedback: { [contrastKey]: true },
      postRevealRecords: progress.postRevealRecords,
    }

    const restored = parseClassroomSessionProgress(
      serializeClassroomSessionProgress(course, incomplete, NOW),
      course,
      NOW + 1_000,
    )!

    expect(restored.revealedLearningFeedback[contrastKey]).toBeUndefined()
    expect(restored.postRevealRecords[contrastKey]).toBeUndefined()
  })

  it('保存结束确认，但不把它当成无需复核的完成证明', () => {
    const { course, progress } = fixture()
    const raw = serializeClassroomSessionProgress(course, {
      ...progress,
      lessonCompleted: true,
    }, NOW)

    expect(parseClassroomSessionProgress(raw, course, NOW + 1_000)?.lessonCompleted).toBe(true)
  })
})

describe('课堂结束证据契约', () => {
  it('只在开场回看和全部分阶段修正闭环后允许结束本课', () => {
    const evidence = completionFixture()

    expect(classroomLessonCanComplete(
      evidence.course,
      evidence.openingAttempts,
      evidence.revealedLearningFeedback,
      evidence.postRevealRecords,
      evidence.practiceEvidenceSaved,
      evidence.recapTransferAttempts,
    )).toBe(true)
  })

  it('缺少开场回看修正时不能把到达收束页当成完成', () => {
    const evidence = completionFixture()
    const openingScene = evidence.course.scenes.find(scene => scene.sceneType === 'source-reading')!
    const openingKey = openingAttemptStateKey(evidence.course.id, openingScene.id)
    const { revision: _revision, ...withoutRevision } = evidence.openingAttempts[openingKey]!
    evidence.openingAttempts[openingKey] = withoutRevision

    expect(classroomLessonCanComplete(
      evidence.course,
      evidence.openingAttempts,
      evidence.revealedLearningFeedback,
      evidence.postRevealRecords,
      evidence.practiceEvidenceSaved,
      evidence.recapTransferAttempts,
    )).toBe(false)
  })

  it('缺少揭晓后修正时不能结束本课', () => {
    const evidence = completionFixture()
    const stagedKey = Object.keys(evidence.postRevealRecords)[0]!
    delete evidence.postRevealRecords[stagedKey]

    expect(classroomLessonCanComplete(
      evidence.course,
      evidence.openingAttempts,
      evidence.revealedLearningFeedback,
      evidence.postRevealRecords,
      evidence.practiceEvidenceSaved,
      evidence.recapTransferAttempts,
    )).toBe(false)
  })

  it('正式练习必须有服务端保存标记，浏览器揭晓状态不能代替', () => {
    const evidence = completionFixture()
    const source = evidence.course.scenes.find(scene => scene.sceneType === 'contrast')!
    const practice = structuredClone(source)
    practice.id = 'practice-course-completion'
    practice.sceneType = 'practice'
    practice.kpId = 'kp-course-completion'
    practice.contentSlots = {
      task: '根据证据作答，并说明判断依据。',
      feedback: '核对原答、依据和适用条件。',
    }
    evidence.course.scenes.splice(-1, 0, practice)
    const practiceKey = stagedLearningStateKey(evidence.course.id, practice.id)
    evidence.revealedLearningFeedback[practiceKey] = true

    expect(classroomLessonCanComplete(
      evidence.course,
      evidence.openingAttempts,
      evidence.revealedLearningFeedback,
      evidence.postRevealRecords,
      evidence.practiceEvidenceSaved,
      evidence.recapTransferAttempts,
    )).toBe(false)

    evidence.practiceEvidenceSaved[practiceKey] = true
    expect(classroomLessonCanComplete(
      evidence.course,
      evidence.openingAttempts,
      evidence.revealedLearningFeedback,
      evidence.postRevealRecords,
      evidence.practiceEvidenceSaved,
      evidence.recapTransferAttempts,
    )).toBe(true)
  })

  it('没有明确收束页的课程不能产生课程完成状态', () => {
    const evidence = completionFixture()
    evidence.course.scenes.pop()

    expect(classroomLessonCanComplete(
      evidence.course,
      evidence.openingAttempts,
      evidence.revealedLearningFeedback,
      evidence.postRevealRecords,
      evidence.practiceEvidenceSaved,
      evidence.recapTransferAttempts,
    )).toBe(false)
  })

  it('缺少具体迁移题作答时不能结束本课', () => {
    const evidence = completionFixture()
    for (const key of Object.keys(evidence.recapTransferAttempts)) delete evidence.recapTransferAttempts[key]

    expect(classroomLessonCanComplete(
      evidence.course,
      evidence.openingAttempts,
      evidence.revealedLearningFeedback,
      evidence.postRevealRecords,
      evidence.practiceEvidenceSaved,
      evidence.recapTransferAttempts,
    )).toBe(false)
  })
})
