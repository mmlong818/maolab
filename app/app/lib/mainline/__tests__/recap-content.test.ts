import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('recap content ownership', () => {
  it('shows only the confirmed board beside the image, not preparation notes', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/mainline/scene-views/recap.tsx'), 'utf8')
    const imageView = source.slice(
      source.indexOf('export function RecapImageView'),
      source.indexOf('function RecapFocusMaster'),
    )

    expect(imageView).toContain('本课板书')
    expect(imageView).toContain('scene.boardText.map')
    expect(imageView).not.toContain('scene.contentSlots.takeaway')
    expect(imageView).not.toContain('pathNodes(scene)')
  })

  it('renders distinct student-facing structures for the new recap templates', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/mainline/scene-views/recap.tsx'), 'utf8')

    expect(source).toContain('data-recap-template="belief-revision"')
    expect(source).toContain('data-recap-template="claim-evidence"')
    expect(source).toContain('data-recap-template="concept-network"')
    expect(source).toContain('scene.contentSlots.revisionEvidence')
    expect(source).toContain('scene.contentSlots.shapeSummary')
    expect(source).toContain('scene.contentSlots.shapeCenter')
  })

  it('keeps teacher script out of the preparation page preview while retaining configured portraits', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/mainline/workbench/PreviewStage.tsx'), 'utf8')

    expect(source).toContain("import { DialogueLayer }")
    expect(source).toContain('display="portrait-only"')
    expect(source).toContain('hasConfiguredPortrait(displayScene, course)')
    expect(source).toContain('scene={previewScene}')
    expect(source).toContain('forceFeedbackRevealed = true')
    expect(source).toContain('stagedFeedbackRevealed={feedbackRevealed}')
  })
})
