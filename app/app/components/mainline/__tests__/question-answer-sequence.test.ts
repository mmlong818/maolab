import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dispatcher = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/SceneTechniqueView.tsx'),
  'utf8',
)
const practice = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/scene-views/practice.tsx'),
  'utf8',
)
const aiScenes = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/scene-views/ai-scenes.tsx'),
  'utf8',
)
const contrastScenes = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/scene-views/contrast-scenes.tsx'),
  'utf8',
)

describe('问答投影片渐进版式', () => {
  it('纯文字练习的提问与揭晓共用固定母版', () => {
    expect(dispatcher).toContain("scene.sceneType === 'practice' && stagedPromptEvidenceKind(scene) === null")
    expect(dispatcher).toContain('<PracticeSequenceView')
    expect(practice).toContain('data-testid="practice-sequence-slide"')
    expect(practice).toContain('data-testid="practice-sequence-question"')
    expect(practice).toContain('data-testid="practice-sequence-answer"')
    expect(practice).toContain("{feedbackRevealed ? '✓' : '?'}")
  })

  it('逐条判断只在原位置补入选项与依据', () => {
    expect(aiScenes).toContain('if (aiVerifyPairs(scene).length === 1)')
    expect(aiScenes).toContain('<AiVerifySequenceMaster')
    expect(aiScenes).toContain('data-testid="ai-verify-sequence-slide"')
    expect(aiScenes).toContain('data-testid="ai-verify-statement"')
    expect(aiScenes).toContain('data-testid="ai-verify-response"')
    expect(aiScenes).toContain("const choices = ['成立', '不成立'] as const")
  })

  it('无图辨析的提问与揭晓共用固定母版', () => {
    expect(dispatcher).toContain("scene.sceneType === 'contrast' && !scene.imageUrl && specializedContentKind(scene) === null")
    expect(dispatcher).toContain('<ContrastSequenceView')
    expect(contrastScenes).toContain('data-response-hidden={feedbackRevealed')
    expect(contrastScenes).toContain("{feedbackRevealed ? '核对结论' : '先判断'}")
    expect(contrastScenes).toContain('结论与依据')
    expect(contrastScenes).toContain('原文依据')
  })
})
