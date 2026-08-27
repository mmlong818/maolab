import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('课堂开场作答门槛', () => {
  it('开场未保存时锁住所有后续入口，保存后按课程与开场页隔离', () => {
    const stageCanvas = readFileSync(new URL('../../../components/mainline/StageCanvas.tsx', import.meta.url), 'utf8')

    expect(stageCanvas).toContain("presentationPages.findIndex(item => item.scene.sceneType === 'source-reading')")
    expect(stageCanvas).toContain('openingAttemptStateKey(course.id, openingScene.id)')
    expect(stageCanvas).toContain('openingAttemptIsComplete(openingAttempt)')
    expect(stageCanvas).toContain('return canNavigateTo(target) ? target : current')
    expect(stageCanvas).toContain('disabled={!canNavigateTo(safeSceneIndex + 1)}')
    expect(stageCanvas).toContain('disabled={!canNavigateTo(index)}')
    expect(stageCanvas).toContain('请先完成第 ${openingSceneIndex + 1} 页开场作答，才能进入后续内容')
  })

  it('开场记录揭晓前作答与把握度，收束页继续记录证据修正', () => {
    const stageCanvas = readFileSync(new URL('../../../components/mainline/StageCanvas.tsx', import.meta.url), 'utf8')
    const checkIn = readFileSync(new URL('../../../components/mainline/OpeningLearningCheckIn.tsx', import.meta.url), 'utf8')

    expect(stageCanvas).toContain('mode="capture"')
    expect(stageCanvas).toContain('mode="review"')
    expect(stageCanvas).toContain("scene.sceneType === 'recap' && openingAttempt")
    expect(checkIn).toContain('作答时把握')
    expect(checkIn).toContain('揭晓前原答')
    expect(checkIn).toContain('保存并继续')
    expect(checkIn).toContain('保存修正')
    expect(checkIn).toContain('本次课堂会话记录')
    expect(checkIn).toContain('openingAttemptRevisionIsComplete(normalizedRevision)')
    expect(checkIn).toContain('请同时写清保留或修正的判断，以及对应依据')
    expect(checkIn).toContain("const completionVisible = mode === 'capture' ? Boolean(attempt) : reviewComplete")
    expect(checkIn).toContain('reviewComplete ? <CheckCircle2 aria-hidden size={18} /> : <RotateCcw aria-hidden size={18} />')
  })

  it('投影课堂可确认纸面或口头完成，但界面明确不保存或推测答案', () => {
    const checkIn = readFileSync(new URL('../../../components/mainline/OpeningLearningCheckIn.tsx', import.meta.url), 'utf8')

    expect(checkIn).toContain("responseMode === 'paper-or-oral'")
    expect(checkIn).toContain('纸面或口头作答')
    expect(checkIn).toContain('不会保存或推测学生答案')
    expect(checkIn).toContain('系统只记录了完成方式和揭晓前把握度')
    expect(checkIn).toContain('已让学生对照证据')
  })
})
