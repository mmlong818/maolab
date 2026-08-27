import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { LessonScene } from '../domain.js'
import { GOLDEN_MAINLINE_COURSES } from '../samples.js'
import {
  stagedAttemptIsComplete,
  stagedCalibrationFeedback,
  stagedLearningConfig,
  stagedNavigationBlocker,
  stagedLearningStateKey,
  stagedPostRevealRecordIsComplete,
  stagedRevealAction,
  stagedSceneForPrompt,
  stagedSceneForReveal,
  stagedPromptEvidenceKind,
  stagedPromptForceVectors,
  type StagedLearningSceneType,
} from '../staged-learning.js'

const stagedLearningView = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/scene-views/staged-learning.tsx'),
  'utf8',
)

function sceneFor(sceneType: StagedLearningSceneType): LessonScene {
  const scene = structuredClone(GOLDEN_MAINLINE_COURSES[0]!.scenes[0]!)
  scene.sceneType = sceneType
  scene.teacherScript = '教师讲稿里包含完整答案'
  scene.studentAction = '照着答案复述'
  scene.contentSlots = sceneType === 'worked-example'
    ? {
        problem: '先求哪一步？',
        completionPrompt: '题面已有：已知条件已经圈出。请在【待补】处补出下一步，并说明依据。',
        steps: '第一步：列式',
      }
    : sceneType === 'practice'
      ? { task: '请独立完成这道题', feedback: '正确答案与反馈' }
      : sceneType === 'contrast'
        ? { misconception: '这段说法正确吗？', correction: '修正后的结论' }
        : { aiClaim: '两者完全相同', reveal: '核查：两者并不相同' }
  return scene
}

describe('staged learning', () => {
  it.each([
    ['worked-example', '先补关键一步', '想好了，查看步骤', false],
    ['practice', '先独立作答', '已作答，查看反馈', true],
    ['contrast', '先辨析', '已判断，查看修正', false],
    ['ai-verify', '先判断待核查说法', '判断完成，查看核查', false],
  ] as const)('stages %s before its answer is revealed', (sceneType, promptLabel, revealLabel, recordsMastery) => {
    const config = stagedLearningConfig(sceneFor(sceneType))

    expect(config).toMatchObject({ sceneType, promptLabel, revealLabel, recordsMastery })
    expect(config?.prompt).toBeTruthy()
  })

  it('keeps incomplete and non-assessment scenes on their original renderer', () => {
    const incompletePractice = sceneFor('practice')
    delete incompletePractice.contentSlots.feedback
    const ordinaryScene = structuredClone(incompletePractice)
    ordinaryScene.sceneType = 'concept-build'

    expect(stagedLearningConfig(incompletePractice)).toBeNull()
    expect(stagedLearningConfig(ordinaryScene)).toBeNull()
    expect(stagedSceneForPrompt(ordinaryScene)).toBe(ordinaryScene)
  })

  it('removes answer-bearing narration from the first task state without mutating the source', () => {
    const scene = sceneFor('practice')
    const promptScene = stagedSceneForPrompt(scene)

    expect(promptScene).not.toBe(scene)
    expect(promptScene.teacherScript).not.toContain('完整答案')
    expect(promptScene.studentAction).not.toBe('照着答案复述')
    expect(promptScene.contentSlots).toBe(scene.contentSlots)
    expect(scene.teacherScript).toBe('教师讲稿里包含完整答案')
  })

  it('完整例题把题面和完成题支架分开显示，并只收一份补步回答', () => {
    const config = stagedLearningConfig(sceneFor('worked-example'))

    expect(config?.prompt).toBe('先求哪一步？')
    expect(config?.completionPrompt).toContain('【待补】')
    expect(config?.promptItems).toEqual([config?.completionPrompt])
    expect(config?.attemptInstruction).toBe('补出【待补】处，并写明依据。')
  })

  it('题面明确把受力图作为已知证据时在作答页保留图，但画图任务不提前泄露', () => {
    const scene = sceneFor('worked-example')
    scene.contentSlots.forceVectors = 'G|重力|19.6|N|270|gravity\nN|支持力|19.6|N|90|normal\nF|拉力|6|N|0|applied\nf|摩擦力|6|N|180|friction'
    scene.contentSlots.problem = '木块受到 6 N 的水平拉力，向右做匀速直线运动。判断拉力与摩擦力是否平衡。'
    scene.contentSlots.completionPrompt = '受力图中已有四个力，拉力为 6 N。请在【待补】处逐条核验二力平衡条件，并说明依据。'

    expect(stagedPromptEvidenceKind(scene)).toBe('force-diagram')
    expect(stagedPromptForceVectors(scene).map(({ label, magnitude, unit, lengthMagnitude }) => ({ label, magnitude, unit, lengthMagnitude }))).toEqual([
      { label: 'G', magnitude: '', unit: '', lengthMagnitude: '' },
      { label: 'N', magnitude: '', unit: '', lengthMagnitude: '' },
      { label: 'F', magnitude: '6', unit: 'N', lengthMagnitude: '' },
      { label: 'f', magnitude: '?', unit: '', lengthMagnitude: '' },
    ])
    expect(scene.contentSlots.forceVectors).toContain('f|摩擦力|6|N')
    expect(stagedLearningView).toContain('data-testid="worked-example-problem"')
    expect(stagedLearningView).toContain('stagedPromptForceVectors(scene)')

    scene.contentSlots.completionPrompt = '请在【待补】处画出木块的受力图，并说明依据。'
    expect(stagedPromptEvidenceKind(scene)).toBeNull()
  })

  it('完整例题展开后要求解释关键步骤，且不修改存量课程原稿', () => {
    const scene = sceneFor('worked-example')
    scene.studentAction = '跟随步骤写出结果'
    scene.teacherScript = '讲'.repeat(240)
    const revealedScene = stagedSceneForReveal(scene)

    expect(revealedScene).not.toBe(scene)
    expect(revealedScene.studentAction).toContain('因为…所以…')
    expect(revealedScene.teacherScript).toContain('核对后圈出一个关键步骤')
    expect(scene.studentAction).toBe('跟随步骤写出结果')
    expect(scene.teacherScript).toBe('讲'.repeat(240))
  })

  it('非完整例题和已有自我解释的例题保持原对象', () => {
    const practice = sceneFor('practice')
    const worked = sceneFor('worked-example')
    worked.studentAction = '补出关键一步并说明依据，核对后解释为什么成立'

    expect(stagedSceneForReveal(practice)).toBe(practice)
    expect(stagedSceneForReveal(worked)).toBe(worked)
  })

  it.each([
    ['practice', '保留原答再订正', '圈出与反馈不同的第一处'],
    ['contrast', '把误区改正确', '改写成一句正确表述'],
    ['ai-verify', '改写并举证', '补一条本课证据'],
  ] as const)('揭晓 %s 后要求留下可观察的修正证据', (sceneType, label, cue) => {
    const action = stagedRevealAction(sceneFor(sceneType))

    expect(action).toMatchObject({ sceneType, label })
    expect(action?.instruction).toContain(cue)
  })

  it('完整例题揭晓后的动作沿用自我解释契约', () => {
    const scene = sceneFor('worked-example')
    scene.studentAction = '跟随步骤写出结果'

    const action = stagedRevealAction(scene)

    expect(action).toMatchObject({ sceneType: 'worked-example', label: '解释关键一步' })
    expect(action?.instruction).toContain('因为…所以…')
  })

  it('把多误区 AI 找茬拆成逐条题面，首次作答状态不泄露任何揭底', () => {
    const scene = sceneFor('ai-verify')
    scene.misconceptionSources = ['误区甲', '误区乙', '误区丙']
    scene.contentSlots = {
      aiClaim: '合并说法不应成为首次作答页的唯一题面',
      reveal: '合并揭底',
      aiClaim1: '误区甲的待核查说法',
      reveal1: '误区甲的核查结论',
      aiClaim2: '误区乙的待核查说法',
      reveal2: '误区乙的核查结论',
      aiClaim3: '误区丙的待核查说法',
      reveal3: '误区丙的核查结论',
    }

    const config = stagedLearningConfig(scene)

    expect(config?.promptItems).toEqual([
      '误区甲的待核查说法',
      '误区乙的待核查说法',
      '误区丙的待核查说法',
    ])
    expect(config?.prompt).not.toContain('核查结论')
    expect(config?.attemptInstruction).toContain('逐条判断这 3 个说法')
    expect(stagedRevealAction(scene)).toMatchObject({
      label: '逐条改写并举证',
      instruction: expect.stringContaining('这 3 条错误说法逐条改写正确'),
    })
  })

  it('找茬首屏只显示当前投影片题干，不提供页内阶段切换', () => {
    expect(stagedLearningView).toContain('const visiblePrompt = visiblePromptItems[0] ?? config.prompt')
    expect(stagedLearningView).toContain('<EnumeratedText text={visiblePrompt} />')
    expect(stagedLearningView).not.toContain('aria-label="AI 找茬阶段"')
    expect(stagedLearningView).not.toContain('setActivePhase')
  })

  it('AI 找茬在揭晓前后保持同一母版，回复只写入原有回复槽', () => {
    const sceneView = readFileSync(new URL('../../../components/mainline/SceneTechniqueView.tsx', import.meta.url), 'utf8')
    const aiScenes = readFileSync(new URL('../../../components/mainline/scene-views/ai-scenes.tsx', import.meta.url), 'utf8')

    expect(sceneView).toContain("!stagedFeedbackRevealed && scene.sceneType === 'ai-verify'")
    expect(sceneView).toContain('feedbackRevealed={false}')
    expect(aiScenes).toContain('aria-label="核查结论待显示"')
    expect(aiScenes).not.toContain('先写下判断，AI 将在此补充核查。')
    expect(aiScenes).not.toContain('AI 回复将在你的判断后加入这里')
    expect(aiScenes).not.toContain('> AI<')
    expect(aiScenes).not.toContain('AI 回复</span>')
  })

  it('待核查说法只显示命题本身，不渲染角色名、说话动词、引号或斜体', () => {
    const aiScenes = readFileSync(new URL('../../../components/mainline/scene-views/ai-scenes.tsx', import.meta.url), 'utf8')

    expect(aiScenes).toContain('function plainAiClaim')
    expect(aiScenes).toContain("replace(/^AI\\s*(?:说|表示|认为)?")
    expect(aiScenes).toContain('<MathText>{statement}</MathText>')
    expect(aiScenes).not.toContain('AI 说</span>')
  })

  it('投影页不重复显示通用作答备注，作答流程保留给课堂交互面板', () => {
    expect(stagedLearningView).not.toContain('先留下自己的答案')
    expect(stagedLearningView).not.toContain('config.attemptInstruction')
    expect(stagedLearningView).not.toContain('LockKeyhole')
  })

  it('先答页以课程内容作为标题，不展示内部工作流标题', () => {
    expect(stagedLearningView).toContain('<MathText>{scene.visualFocus}</MathText>')
    expect(stagedLearningView).not.toContain('{config.promptLabel}</div>')
    expect(stagedLearningView).not.toContain('已完成前序，轮到你补一步')
  })

  it('完整例题只呈现已有步骤和当前题目，不显示流程解释', () => {
    expect(stagedLearningView).not.toContain('已完成的前两步')
    expect(stagedLearningView).not.toContain('已完成的第 1 步')
    expect(stagedLearningView).not.toContain('现在补下一步')
    expect(stagedLearningView).toContain('const completionInstruction = config.completionPrompt ??')
    expect(stagedLearningView).not.toContain('workedExampleTaskInstruction')
    expect(stagedLearningView).not.toContain('你现在只需完成下一步。')
    expect(stagedLearningView).not.toContain('根据前两步，完成下一步。')
    expect(stagedLearningView).not.toContain('第 3 步的条件核验')
    expect(stagedLearningView).toContain('{config.completionPrompt ? (')
    expect(stagedLearningView).toContain('data-testid="worked-example-completion-prompt"')
    expect(stagedLearningView).toContain('stagedPromptEvidenceKind(scene)')
    expect(stagedLearningView).toContain('<ForceDiagramGraphic scene={scene} theme={theme} width="94%" forces={stagedPromptForceVectors(scene)} />')
  })

  it('多误区找茬缺少任一逐条揭底时不进入无法完成的分阶段流程', () => {
    const scene = sceneFor('ai-verify')
    scene.misconceptionSources = ['误区甲', '误区乙']
    scene.contentSlots = {
      aiClaim: '合并说法',
      reveal: '',
      aiClaim1: '误区甲',
      reveal1: '修正甲',
      aiClaim2: '误区乙',
    }

    expect(stagedLearningConfig(scene)).toBeNull()
  })

  it('isolates reveal state between courses that reuse a scene id', () => {
    expect(stagedLearningStateKey('course-a', 'scene-1')).not.toBe(stagedLearningStateKey('course-b', 'scene-1'))
  })

  it('允许进入首个检核页，但在揭晓前阻止跳到后续页面', () => {
    const ordinary = sceneFor('practice')
    ordinary.id = 'opening'
    ordinary.sceneType = 'concept-build'
    const contrast = sceneFor('contrast')
    contrast.id = 'contrast'
    const practice = sceneFor('practice')
    practice.id = 'practice'
    practice.kpId = 'kp-practice'
    const recap = sceneFor('practice')
    recap.id = 'recap'
    recap.sceneType = 'recap'
    const scenes = [ordinary, contrast, practice, recap]

    expect(stagedNavigationBlocker('course-a', scenes, 1, {}, {})).toBeNull()
    expect(stagedNavigationBlocker('course-a', scenes, 2, {}, {})).toMatchObject({
      sceneIndex: 1,
      sceneId: 'contrast',
      phase: 'reveal',
      actionLabel: '已判断，查看修正',
    })

    const afterContrast = { [stagedLearningStateKey('course-a', 'contrast')]: true }
    expect(stagedNavigationBlocker('course-a', scenes, 2, afterContrast, {})).toMatchObject({
      sceneIndex: 1,
      sceneId: 'contrast',
      phase: 'post-reveal',
      actionLabel: '把误区改正确',
    })
    const afterCorrection = {
      [stagedLearningStateKey('course-a', 'contrast')]: {
        mode: 'typed' as const,
        comparison: 'revised' as const,
        responses: ['正确表述与关键条件'],
      },
    }
    expect(stagedNavigationBlocker('course-a', scenes, 2, afterContrast, afterCorrection)).toBeNull()
    expect(stagedNavigationBlocker('course-a', scenes, 3, afterContrast, afterCorrection)).toMatchObject({
      sceneIndex: 2,
      sceneId: 'practice',
      phase: 'reveal',
    })
    const afterPracticeReveal = {
      ...afterContrast,
      [stagedLearningStateKey('course-a', 'practice')]: true,
    }
    expect(stagedNavigationBlocker('course-a', scenes, 3, afterPracticeReveal, afterCorrection)).toMatchObject({
      sceneIndex: 2,
      sceneId: 'practice',
      phase: 'practice-evidence',
      actionLabel: '反馈后订正并保存学习记录',
    })
    const practiceEvidence = { [stagedLearningStateKey('course-a', 'practice')]: true }
    expect(stagedNavigationBlocker('course-a', scenes, 3, afterPracticeReveal, afterCorrection, practiceEvidence)).toBeNull()
    expect(stagedNavigationBlocker('course-a', scenes, 1, afterContrast, {})).toBeNull()
  })

  it('不让其他课程的同名揭晓状态解锁当前课程', () => {
    const staged = sceneFor('worked-example')
    staged.id = 'shared-scene'
    const scenes = [staged, sceneFor('practice')]
    const otherCourseReveal = { [stagedLearningStateKey('course-a', staged.id)]: true }
    const otherCourseCorrection = {
      [stagedLearningStateKey('course-a', staged.id)]: {
        mode: 'typed' as const,
        comparison: 'matched' as const,
        responses: ['解释与依据'],
      },
    }

    expect(stagedNavigationBlocker('course-b', scenes, 1, otherCourseReveal, otherCourseCorrection)).toMatchObject({
      sceneIndex: 0,
      sceneId: 'shared-scene',
      phase: 'reveal',
    })
  })

  it('反馈不完整的旧检核页不制造无法继续的导航死锁', () => {
    const incompletePractice = sceneFor('practice')
    delete incompletePractice.contentSlots.feedback

    expect(stagedNavigationBlocker('course-a', [incompletePractice, sceneFor('contrast')], 1, {}, {})).toBeNull()
  })

  it('无知识点归属的旧练习不会被正式证据门槛锁死', () => {
    const practice = sceneFor('practice')
    practice.id = 'legacy-practice'
    delete practice.kpId
    const recap = sceneFor('practice')
    recap.sceneType = 'recap'
    const revealed = { [stagedLearningStateKey('course-a', practice.id)]: true }

    expect(stagedNavigationBlocker('course-a', [practice, recap], 1, revealed, {})).toBeNull()
  })

  it('例题和辨析揭晓后必须留下解释或修正，纸面口头确认也必须显式完成', () => {
    for (const sceneType of ['worked-example', 'contrast'] as const) {
      const scene = sceneFor(sceneType)

      expect(stagedPostRevealRecordIsComplete(scene, undefined)).toBe(false)
      expect(stagedPostRevealRecordIsComplete(scene, { mode: 'typed', comparison: 'revised', responses: ['  '] })).toBe(false)
      expect(stagedPostRevealRecordIsComplete(scene, { mode: 'typed', comparison: 'revised', responses: ['修正后的解释与依据'] })).toBe(true)
      expect(stagedPostRevealRecordIsComplete(scene, { mode: 'paper-or-oral', comparison: 'matched' })).toBe(false)
      expect(stagedPostRevealRecordIsComplete(scene, { mode: 'paper-or-oral', comparison: 'matched', paperOrOralComplete: true })).toBe(true)
    }
  })

  it('多条 AI 核查揭晓后必须逐条改写并举证', () => {
    const scene = sceneFor('ai-verify')
    scene.misconceptionSources = ['误区甲', '误区乙', '误区丙']
    scene.contentSlots = {
      aiClaim1: '说法甲', reveal1: '核查甲',
      aiClaim2: '说法乙', reveal2: '核查乙',
      aiClaim3: '说法丙', reveal3: '核查丙',
    }

    expect(stagedPostRevealRecordIsComplete(scene, { mode: 'typed', comparison: 'revised', responses: ['修正甲'] })).toBe(false)
    expect(stagedPostRevealRecordIsComplete(scene, { mode: 'typed', comparison: 'revised', responses: ['修正甲', '修正乙', ''] })).toBe(false)
    expect(stagedPostRevealRecordIsComplete(scene, { mode: 'typed', comparison: 'revised', responses: ['修正甲', '修正乙', '修正丙'] })).toBe(true)
  })

  it('练习沿用正式反馈后反思流程，不叠加会话级修正门槛', () => {
    expect(stagedPostRevealRecordIsComplete(sceneFor('practice'), undefined)).toBe(true)
  })

  it('例题和辨析必须有真实文字作答或纸面口头确认，才能展开答案', () => {
    for (const sceneType of ['worked-example', 'contrast'] as const) {
      const config = stagedLearningConfig(sceneFor(sceneType))!

      expect(stagedAttemptIsComplete(config, undefined)).toBe(false)
      expect(stagedAttemptIsComplete(config, { mode: 'typed', confidence: 'medium', responses: ['   '] })).toBe(false)
      expect(stagedAttemptIsComplete(config, { mode: 'typed', confidence: 'medium', responses: ['学生自己的判断与依据'] })).toBe(true)
      expect(stagedAttemptIsComplete(config, { mode: 'paper-or-oral', confidence: 'high' })).toBe(false)
      expect(stagedAttemptIsComplete(config, { mode: 'paper-or-oral', confidence: 'high', paperOrOralComplete: true })).toBe(true)
    }
  })

  it('多条 AI 核查必须逐条留下作答，不能用一段合并文字冒充完成', () => {
    const scene = sceneFor('ai-verify')
    scene.misconceptionSources = ['误区甲', '误区乙', '误区丙']
    scene.contentSlots = {
      aiClaim1: '说法甲', reveal1: '核查甲',
      aiClaim2: '说法乙', reveal2: '核查乙',
      aiClaim3: '说法丙', reveal3: '核查丙',
    }
    const config = stagedLearningConfig(scene)!

    expect(stagedAttemptIsComplete(config, { mode: 'typed', confidence: 'low', responses: ['一段合并作答'] })).toBe(false)
    expect(stagedAttemptIsComplete(config, { mode: 'typed', confidence: 'low', responses: ['判断甲', '判断乙', ''] })).toBe(false)
    expect(stagedAttemptIsComplete(config, { mode: 'typed', confidence: 'low', responses: ['判断甲', '判断乙', '判断丙'] })).toBe(true)
    expect(stagedAttemptIsComplete(config, { mode: 'paper-or-oral', confidence: 'low', paperOrOralComplete: true })).toBe(true)
  })

  it('按揭晓前把握度和核对结果区分猜对、稳定判断与高把握误解', () => {
    expect(stagedCalibrationFeedback(
      { mode: 'typed', confidence: 'high', responses: ['原判断'] },
      { mode: 'typed', comparison: 'revised', responses: ['修正与依据'] },
    )).toMatchObject({ kind: 'overconfident', label: '高把握判断需要修正' })

    expect(stagedCalibrationFeedback(
      { mode: 'typed', confidence: 'low', responses: ['原判断'] },
      { mode: 'typed', comparison: 'matched', responses: ['原判断成立的依据'] },
    )).toMatchObject({ kind: 'underconfident', label: '判断一致但把握偏低' })

    expect(stagedCalibrationFeedback(
      { mode: 'typed', confidence: 'high', responses: ['原判断'] },
      { mode: 'typed', comparison: 'matched', responses: ['原判断成立的依据'] },
    )).toMatchObject({ kind: 'calibrated', label: '判断与把握一致' })
  })

  it('wires the classroom renderer and dialogue to the staged state while prep keeps final content by default', () => {
    const stageCanvas = readFileSync(new URL('../../../components/mainline/StageCanvas.tsx', import.meta.url), 'utf8')
    const learningCycle = readFileSync(new URL('../../../components/mainline/LearningCycleCheckIn.tsx', import.meta.url), 'utf8')
    const classroomSession = readFileSync(new URL('../../../components/mainline/useClassroomSessionProgress.ts', import.meta.url), 'utf8')
    const sceneView = readFileSync(new URL('../../../components/mainline/SceneTechniqueView.tsx', import.meta.url), 'utf8')

    expect(stageCanvas).toContain('<SceneTechniqueView course={course} scene={scene} sceneNumber={safeSceneIndex + 1} stagedFeedbackRevealed={stagedFeedbackRevealed} />')
    expect(stageCanvas).toContain('scene={sceneForDialogue}')
    expect(stageCanvas).toContain('presentationScene(currentPage)')
    expect(stageCanvas).toContain('practiceEvidenceSaved,')
    expect(stageCanvas).toContain("blocker.phase === 'practice-evidence'")
    expect(stageCanvas).toContain('请先完成第 ${blocker.pageIndex + 1} 页作答并点击“${blocker.actionLabel}”')
    expect(stageCanvas).toContain('请先完成第 ${blocker.pageIndex + 1} 页“${blocker.actionLabel}”')
    expect(stageCanvas).toContain('postRevealRecord={postRevealRecords[stagedKey]}')
    expect(stageCanvas).toContain('stagedAttempt={stagedAttempts[stagedKey]}')
    expect(stageCanvas).toContain('onStagedAttempt={attempt => setStagedAttempts')
    expect(stageCanvas).toContain('onPostRevealRecord={record => setPostRevealRecords')
    expect(stageCanvas).toContain('practiceEvidenceSaved={Boolean(practiceEvidenceSaved[stagedKey])}')
    expect(stageCanvas).toContain('practiceFeedback={practiceFeedbackByScene[stagedKey]}')
    expect(stageCanvas).toContain('onPracticeEvidenceSaved={feedback => {')
    expect(stageCanvas).toContain('setPracticeFeedbackByScene(current => ({ ...current, [stagedKey]: feedback }))')
    expect(stageCanvas).toContain('useClassroomSessionProgress(course, sceneIndex, setSceneIndex, { enabled: !exportRender })')
    expect(classroomSession).toContain('window.sessionStorage.getItem(classroomSessionStorageKey(course.id))')
    expect(classroomSession).toContain('serializeClassroomSessionProgress(course, {')
    expect(classroomSession).toContain('practiceFeedbackByScene,')
    expect(classroomSession).toContain('practiceFeedbackForSavedScenes(')
    expect(classroomSession).toContain("sessionId=${encodeURIComponent(sessionId)}`)")
    expect(stageCanvas).toContain("? 'worked-example-self-explanation' : 'staged-reveal-action'")
    expect(stageCanvas).toContain('dualBehavior.showBigBoard && stagedFeedbackRevealed')
    expect(stageCanvas).toContain('<LearningCycleCheckIn')
    expect(stageCanvas).toContain('practiceObjectiveCriteria(course.goals, scene.kpId)')
    expect(stageCanvas).toContain('criterionAlignment={practiceCriteria[0]?.alignment}')
    expect(learningCycle).toContain('记录揭晓前原答')
    expect(learningCycle).toContain('disabled={!confidence || !normalizedAttempt}')
    expect(learningCycle).toContain('stagedAttemptIsComplete(config, sessionAttempt)')
    expect(learningCycle).toContain('onStagedAttempt(nextAttempt)')
    expect(learningCycle).toContain('sessionId: classroomSessionId')
    expect(learningCycle).toContain('disabled={!attemptComplete}')
    expect(learningCycle).toContain('纸面或口头作答')
    expect(learningCycle).toContain('系统只确认完成方式，不保存、推测或伪造答案文本')
    expect(learningCycle).toContain('config.promptItems.map((promptItem, index)')
    expect(learningCycle).toContain('记录只属于本次课堂，不写入正式掌握度')
    expect(learningCycle).toContain('揭晓前把握度')
    expect(learningCycle).toContain('对照反馈后的结果')
    expect(learningCycle).toContain('stagedCalibrationFeedback(sessionAttempt, postRevealRecord)')
    expect(learningCycle).toContain("activePanel === 'session-correction'")
    expect(learningCycle).toContain('stagedPostRevealRecordIsComplete(scene, postRevealRecord)')
    expect(learningCycle).toContain('practiceEvidenceSaved ? practiceFeedback : undefined')
    expect(learningCycle).toContain('已从服务端恢复学习记录')
    expect(learningCycle).toContain('已记录揭晓后核对')
    expect(learningCycle).toContain('保存本次课堂核对')
    expect(learningCycle).toContain("onClick={() => beginReflection('correct')}")
    expect(learningCycle).toContain('对照成功标准后：')
    expect(learningCycle).toContain('自评达标')
    expect(learningCycle).toContain('自评需再练')
    expect(learningCycle).toContain('self-assessed-after-feedback')
    expect(learningCycle).toContain("scoreStatus !== 'provisional'")
    expect(learningCycle).toContain("followUp?.basis !== 'student-reflection-and-success-criterion'")
    expect(learningCycle).toContain('practiceReflectionQualityReason(pendingOutcome, normalizedReflection)')
    expect(learningCycle).toContain('按你的原答与订正')
    expect(learningCycle).toContain('onPracticeEvidenceSaved(savedFeedback)')
    expect(learningCycle).toContain('本课成功标准（旧课总目标）')
    expect(learningCycle).toContain('practiceSnapshot: {')
    expect(learningCycle).toContain("task: scene.contentSlots.task?.trim() ?? ''")
    expect(learningCycle).toContain("feedback: scene.contentSlots.feedback?.trim() ?? ''")
    expect(learningCycle).toContain('attemptText: normalizedAttempt')
    expect(learningCycle).toContain('reflectionText: normalizedReflection')
    expect(sceneView).toContain('stagedFeedbackRevealed = true')
    expect(sceneView.indexOf('if (!stagedFeedbackRevealed)')).toBeLessThan(sceneView.indexOf('usesGeneratedSceneImage(scene)'))
    expect(readFileSync(new URL('../../../components/mainline/scene-views/staged-learning.tsx', import.meta.url), 'utf8')).toContain('worked-example-completion-prompt')
  })
})
