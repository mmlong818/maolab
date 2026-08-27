'use client'

import { stagedLearningConfig, stagedPromptEvidenceKind, stagedPromptForceVectors, type LessonScene, type ScenePresentation } from '@/lib/mainline'
import { toRgba } from '@/lib/mainline/presentation/color'
import { promptEvidenceLayout } from '@/lib/mainline/presentation/content-aware-layout'
import { fitType, TYPE_SCALE } from '@/lib/mainline/presentation/tokens'
import { SCENE_TYPE_LABEL } from '../workbench/labels'
import { MathText, SceneBadge, EnumeratedText } from './shared'
import { ForceDiagramGraphic } from './content-forms'

/**
 * 授课页的“先作答”状态。这里有意不复用完整幕型母版：专业图表、步骤、修正和
 * 反馈可能已经包含答案，首次进入时只保留题面；题面明确给出的配图或受力图继续显示。
 */
export function StagedLearningPromptView({
  scene,
  pres,
  sceneNumber,
}: {
  scene: LessonScene
  pres: ScenePresentation
  sceneNumber: number
}) {
  const config = stagedLearningConfig(scene)
  if (!config) return null
  const theme = pres.palette
  const evidenceKind = stagedPromptEvidenceKind(scene)
  const hasEvidenceVisual = evidenceKind !== null
  const visiblePromptItems = config.promptItems
  const visiblePrompt = visiblePromptItems[0] ?? config.prompt
  const hasMultiplePrompts = visiblePromptItems.length > 1
  const promptGrid = visiblePromptItems.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'
  const completionInstruction = config.completionPrompt ?? ''
  const promptTextLength = scene.visualFocus.length
    + (config.completionPrompt
      ? config.prompt.length + config.completionPrompt.length
      : visiblePromptItems.reduce((sum, item) => sum + item.length, 0))
  const evidenceLayout = promptEvidenceLayout(evidenceKind, promptTextLength, visiblePromptItems.length)
  const prompt = (
    <div className="flex min-w-0 flex-col justify-center gap-6">
      <SceneBadge number={sceneNumber} label={SCENE_TYPE_LABEL[scene.sceneType] ?? '学习任务'} theme={theme} />
      <div>
        <h2 className="max-w-[920px]" style={{ ...fitType('heading', scene.visualFocus.length), color: theme.ink }}>
          <MathText>{scene.visualFocus}</MathText>
        </h2>
        {config.completionPrompt ? (
          <div
            data-testid="worked-example-problem"
            className="mt-4 border-l-4 px-6 py-5"
            style={{ borderColor: toRgba(theme.ink, 0.2), background: toRgba(theme.ink, 0.035) }}
          >
            <div style={{ ...fitType('body', config.prompt.length), color: theme.ink }}>
              <EnumeratedText text={config.prompt} />
            </div>
          </div>
        ) : hasMultiplePrompts ? (
          <ol
            data-ai-verify-prompt-count={config.promptItems.length}
            className={`mt-5 grid ${promptGrid} gap-5`}
          >
            {visiblePromptItems.map((item, index) => {
              const pairIndex = index + 1
              return (
              <li
                key={`${pairIndex}-${item}`}
                className="min-w-0 border border-dashed px-5 py-5"
                style={{ borderColor: toRgba(theme.accent, 0.38), background: toRgba(theme.accent, 0.05) }}
              >
                <div style={{ ...TYPE_SCALE.caption, color: theme.accent }}>待核查 {String(pairIndex).padStart(2, '0')}</div>
                <div className="mt-3" style={{ ...fitType(visiblePromptItems.length >= 3 ? 'body' : 'heading', item.length), color: theme.ink }}>
                  “<MathText>{item}</MathText>”
                </div>
              </li>
              )
            })}
          </ol>
        ) : (
          <div className="mt-4" style={{ ...fitType('heading', visiblePrompt.length), color: theme.ink }}>
            <EnumeratedText text={visiblePrompt} />
          </div>
        )}
      </div>
      {config.completionPrompt ? (
        <div>
          <div
            data-testid="worked-example-completion-prompt"
            className="border-l-4 px-6 py-5"
            style={{ borderColor: toRgba(theme.accent, 0.34), background: toRgba(theme.accent, 0.07) }}
          >
            <div style={{ ...fitType('body', completionInstruction.length), color: theme.ink }}>
              <EnumeratedText text={completionInstruction} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )

  return (
    <section
      data-testid="staged-learning-prompt"
      data-response-hidden="true"
      data-content-balance={hasEvidenceVisual ? evidenceLayout.mode : undefined}
      className={hasEvidenceVisual
        ? 'scene-safe-height grid gap-6 px-[5.5%] pb-[3%] pt-[3.5%]'
        : 'scene-safe-bottom flex h-full items-center justify-center px-[9%] py-[6%]'}
      style={{
        background: theme.paper,
        color: theme.ink,
        gridTemplateColumns: hasEvidenceVisual ? evidenceLayout.columns : undefined,
      }}
    >
      {hasEvidenceVisual ? (
        <>
          <div data-testid="staged-prompt-evidence" className="relative flex min-h-0 items-center justify-center overflow-hidden border" style={{ background: theme.backdrop[0], borderColor: toRgba(theme.accent, 0.22) }}>
            {evidenceKind === 'force-diagram' ? (
              <ForceDiagramGraphic scene={scene} theme={theme} width="94%" forces={stagedPromptForceVectors(scene)} />
            ) : (
              <img src={scene.imageUrl} alt={scene.visualFocus} className="absolute inset-0 h-full w-full object-contain" />
            )}
          </div>
          {prompt}
        </>
      ) : (
        <div className="w-full max-w-[1120px]">{prompt}</div>
      )}
    </section>
  )
}
