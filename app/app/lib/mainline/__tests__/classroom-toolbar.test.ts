import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const stageCanvas = readFileSync(
  new URL('../../../components/mainline/StageCanvas.tsx', import.meta.url),
  'utf8',
)
const openingCheckIn = readFileSync(
  new URL('../../../components/mainline/OpeningLearningCheckIn.tsx', import.meta.url),
  'utf8',
)
const learningCheckIn = readFileSync(
  new URL('../../../components/mainline/LearningCycleCheckIn.tsx', import.meta.url),
  'utf8',
)
const lessonCompletion = readFileSync(
  new URL('../../../components/mainline/LessonCompletion.tsx', import.meta.url),
  'utf8',
)
const dialogueLayer = readFileSync(
  new URL('../../../components/mainline/DialogueLayer.tsx', import.meta.url),
  'utf8',
)

describe('课堂控制条信息层级', () => {
  it('上课时不重复显示备课质量统计和课程主题', () => {
    expect(stageCanvas).not.toContain('质量 {qualitySummary.blocking}')
    expect(stageCanvas).not.toContain('<span className="line-clamp-1">{course.topic}</span>')
  })

  it('导航与学习动作位于缩放舞台之外并保留可点击尺寸', () => {
    const scaledStageEnd = stageCanvas.indexOf('</ScaleStage>')
    const learningActionDock = stageCanvas.indexOf('data-classroom-learning-actions')
    const viewportControls = stageCanvas.indexOf('data-classroom-controls')

    expect(scaledStageEnd).toBeGreaterThan(-1)
    expect(learningActionDock).toBeGreaterThan(scaledStageEnd)
    expect(viewportControls).toBeGreaterThan(learningActionDock)
    expect(stageCanvas).toContain('className="classroom-chrome fixed inset-x-0 bottom-0 z-[110] flex h-16')
    expect(stageCanvas).toContain('className="inline-flex h-11 w-11 shrink-0')
    expect(stageCanvas).toContain('className="h-11 min-w-11 shrink-0')
    expect(stageCanvas).toContain("aria-current={index === safeSceneIndex ? 'page' : undefined}")
    expect(openingCheckIn).toContain('className="inline-flex h-12 items-center gap-2')
    expect(learningCheckIn).not.toMatch(/className="inline-flex h-10[^\n]+text-\[13px\]/)
    expect(lessonCompletion).toContain('className="inline-flex h-12 min-w-[140px]')
  })

  it('有学习动作时为对白保留独立安全线', () => {
    expect(stageCanvas).toContain("'--scene-dialogue-bottom': showLearningActionDock ? '14%' : '6%'")
    expect(stageCanvas.match(/bottom: 'var\(--scene-dialogue-bottom, (?:18|9)%\)'/g)).toHaveLength(1)
    expect(dialogueLayer.match(/bottom: 'var\(--scene-dialogue-bottom, 9%\)'/g)).toHaveLength(2)
  })

  it('授课=PPT:键盘与翻页笔可翻页(PgUp/PgDn/方向键),且不绕过导航闸门', () => {
    // 翻页笔发送的就是 PageUp/PageDown;翻页统一走 moveScene → canNavigateTo,
    // 自学模式证据闸门照常拦截,键盘不是旁路。输入控件聚焦时不劫持按键。
    expect(stageCanvas).toContain("event.key === 'ArrowRight' || event.key === 'PageDown'")
    expect(stageCanvas).toContain("event.key === 'ArrowLeft' || event.key === 'PageUp'")
    expect(stageCanvas).toContain("target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable")
    expect(stageCanvas).toContain('moveSceneRef.current = moveScene')
  })

  it('揭晓动作 chip 只在自学模式渲染——授课放映是纯内容,操作指令浮条不上屏', () => {
    expect(stageCanvas).toContain('{!teachMode && revealedLearningAction && (')
  })

  it('对白层只在自学模式渲染——授课老师在场,字幕冗余且遮挡内容(2026-08-25 用户裁决)', () => {
    expect(stageCanvas).toContain('{!teachMode && (!dualBehavior.showBigBoard || !stagedFeedbackRevealed) && (')
  })

  it('字幕带在场时揭晓动作 chip 抬离字幕带锚点，不与带同位重叠', () => {
    expect(stageCanvas).toContain('dialogueBandVisible(sceneForDialogue, course.castProfiles)')
    expect(stageCanvas).toContain("'calc(var(--scene-dialogue-bottom, 18%) + 194px + 14px)'")
    expect(stageCanvas).toContain(": 'var(--scene-dialogue-bottom, 18%)'")
    // 带高上界是抬升量的前提:旁白带与角色带都必须锁 194px
    expect(dialogueLayer.match(/max-h-\[194px\]/g)).toHaveLength(2)
  })

  it('课堂只展示当前课程投影片，不为投影片要点另建重复页面', () => {
    expect(stageCanvas).toContain('lessonPresentationPages(course)')
    expect(stageCanvas).toContain('<SceneTechniqueView course={course} scene={scene} sceneNumber={safeSceneIndex + 1} stagedFeedbackRevealed={stagedFeedbackRevealed} />')
    expect(stageCanvas).not.toContain('TeacherBoardSlide')
    expect(stageCanvas).not.toContain('showBoardSlide')
    expect(stageCanvas).not.toContain('展示本页板书')
  })
})
