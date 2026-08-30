import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { coreVisualLayout, forceDiagramLayout, pagePromptLayout, promptEvidenceLayout } from '../../../lib/mainline/presentation/content-aware-layout'

const contentForms = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/scene-views/content-forms.tsx'),
  'utf8',
)
const stagedLearning = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/scene-views/staged-learning.tsx'),
  'utf8',
)
const pageContent = readFileSync(
  resolve(process.cwd(), 'app/components/mainline/scene-views/page-content.tsx'),
  'utf8',
)

describe('force diagram layout', () => {
  it('fits the view box to the actual force directions', () => {
    const horizontal = forceDiagramLayout([
      { label: 'F', magnitude: '5', unit: 'N', angle: 0 },
    ])
    const vertical = forceDiagramLayout([
      { label: 'T', magnitude: '12', unit: 'N', angle: 90 },
      { label: 'G', magnitude: '10', unit: 'N', angle: 270 },
    ])
    const cross = forceDiagramLayout([
      { label: 'F', magnitude: '6', unit: 'N', angle: 0 },
      { label: 'N', magnitude: '19.6', unit: 'N', angle: 90 },
      { label: 'f', magnitude: '6', unit: 'N', angle: 180 },
      { label: 'G', magnitude: '19.6', unit: 'N', angle: 270 },
    ])

    expect(horizontal.frame.width).toBeGreaterThan(horizontal.frame.height)
    expect(vertical.frame.height).toBeGreaterThan(vertical.frame.width)
    expect(new Set([horizontal.viewBox, vertical.viewBox, cross.viewBox]).size).toBe(3)
    expect(contentForms).toContain("width = '100%'")
    expect(contentForms).toContain('viewBox={layout.viewBox}')
    expect(contentForms).toContain('height="100%"')
    expect(contentForms).toContain('data-layout-rule="force-diagram-content-fit"')
  })

  it('balances prompt and reveal pages from their actual text density', () => {
    expect(promptEvidenceLayout('force-diagram', 70).mode).toBe('visual-heavy')
    expect(promptEvidenceLayout('generated-image', 70).mode).toBe('visual-heavy')
    expect(promptEvidenceLayout('force-diagram', 180).mode).toBe('text-heavy')
    expect(coreVisualLayout(['短结论']).mode).toBe('visual-heavy')
    expect(coreVisualLayout(Array.from({ length: 5 }, (_, index) => `步骤 ${index + 1}：逐项说明判断依据`)).mode).toBe('text-heavy')
    expect(pagePromptLayout(true, false)).toEqual({ mode: 'visual-heavy', columns: 'minmax(0, 1.28fr) minmax(0, 0.72fr)' })
    expect(pagePromptLayout(true, true)).toEqual({ mode: 'visual-heavy', columns: 'minmax(0, 1.12fr) minmax(0, 0.88fr)' })
    expect(pagePromptLayout(false, false).mode).toBe('balanced')
    expect(stagedLearning).toContain('data-content-balance={hasEvidenceVisual ? evidenceLayout.mode : undefined}')
    expect(stagedLearning).toContain('gridTemplateColumns: hasEvidenceVisual ? evidenceLayout.columns : undefined')
    expect(stagedLearning).toContain('<ForceDiagramGraphic scene={scene} theme={theme} width="94%" forces={stagedPromptForceVectors(scene)} />')
    expect(pageContent).toContain('data-content-balance={layout.mode}')
    expect(pageContent).toContain('className="scene-safe-bottom flex h-full w-full flex-col')
    expect(pageContent).toContain('!imageUrl && content.materialCaption')
    expect(pageContent).toContain('data-prompt-image-layout="side-by-side"')
    expect(pageContent).toContain('data-explanation-image-layout="side-by-side"')
    expect(pageContent).toContain('<TeachingImage src={imageUrl} alt={content.title} />')
    expect(pageContent).toContain('flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden')
    expect(pageContent).toContain('h-full w-full object-contain')
  })

  it('separates displayed values from arrow length on question pages', () => {
    const qualitative = forceDiagramLayout([
      { label: 'F', magnitude: '6', unit: 'N', angle: 0, lengthMagnitude: '' },
      { label: 'f', magnitude: '?', unit: '', angle: 180, lengthMagnitude: '' },
    ])

    expect(qualitative.glyphs[0]?.displayLabel).toBe('F 6N')
    expect(qualitative.glyphs[1]?.displayLabel).toBe('f ?')
    expect(qualitative.glyphs[0]?.length).toBe(qualitative.glyphs[1]?.length)
  })
})
