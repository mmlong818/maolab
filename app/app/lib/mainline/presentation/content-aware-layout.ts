export type ContentBalanceMode = 'text-heavy' | 'balanced' | 'visual-heavy'

export interface ContentBalance {
  mode: ContentBalanceMode
  columns: string
}

/** 题面页按学生实际要读的文字量分配空间，配图不再使用全课统一栏宽。 */
export function promptEvidenceLayout(
  evidenceKind: string | null,
  textLength: number,
  itemCount = 1,
): ContentBalance {
  if (textLength >= 150 || itemCount >= 3) {
    return { mode: 'text-heavy', columns: 'minmax(0, 0.8fr) minmax(0, 1.2fr)' }
  }
  if (evidenceKind?.includes('image') && textLength < 110) {
    return { mode: 'visual-heavy', columns: 'minmax(0, 1.15fr) minmax(0, 0.85fr)' }
  }
  if (evidenceKind === 'force-diagram' && textLength < 95) {
    return { mode: 'visual-heavy', columns: 'minmax(0, 1.08fr) minmax(0, 0.92fr)' }
  }
  return { mode: 'balanced', columns: 'minmax(0, 1fr) minmax(0, 1fr)' }
}

/** 讲解页按左侧知识条目的数量和长度分配图文空间。 */
export function coreVisualLayout(blocks: readonly string[]): ContentBalance {
  const totalLength = blocks.reduce((sum, block) => sum + block.length, 0)
  if (blocks.length >= 5 || totalLength >= 180) {
    return { mode: 'text-heavy', columns: 'minmax(0, 0.42fr) minmax(0, 0.58fr)' }
  }
  if (blocks.length <= 2 && totalLength <= 90) {
    return { mode: 'visual-heavy', columns: 'minmax(0, 0.3fr) minmax(0, 0.7fr)' }
  }
  return { mode: 'balanced', columns: 'minmax(0, 0.36fr) minmax(0, 0.64fr)' }
}

export interface ForceDiagramVectorInput {
  label: string
  magnitude: string
  unit: string
  angle: number
  /** 仅控制箭长；省略时沿用 magnitude。作答页可用空值避免箭长暗示答案。 */
  lengthMagnitude?: string
}

export interface ForceDiagramFrame {
  x: number
  y: number
  width: number
  height: number
}

const FORCE_CENTER = { x: 320, y: 208 }

function estimatedTextWidth(text: string, fontSize: number): number {
  return Array.from(text).reduce(
    (width, character) => width + (/[⺀-鿿豈-﫿]/.test(character) ? fontSize : fontSize * 0.62),
    0,
  )
}

function normalizeFrame(frame: ForceDiagramFrame): ForceDiagramFrame {
  let { x, y, width, height } = frame
  const aspect = width / height
  if (aspect < 0.9) {
    const nextWidth = height * 0.9
    x -= (nextWidth - width) / 2
    width = nextWidth
  } else if (aspect > 1.65) {
    const nextHeight = width / 1.65
    y -= (nextHeight - height) / 2
    height = nextHeight
  }
  return {
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
  }
}

/** 受力图按实际箭头方向、长度和标签边界裁出视域，不按固定画布缩放。 */
export function forceDiagramLayout<T extends ForceDiagramVectorInput>(forces: readonly T[], fontSize = 22) {
  const magnitudeForLength = (force: ForceDiagramVectorInput) => force.lengthMagnitude ?? force.magnitude
  const magnitudes = forces.map(force => Number(magnitudeForLength(force))).filter(value => Number.isFinite(value) && value > 0)
  const maxMagnitude = magnitudes.length > 0 ? Math.max(...magnitudes) : 0
  const lengthOf = (magnitude: string) => {
    const value = Number(magnitude)
    return maxMagnitude > 0 && Number.isFinite(value) && value > 0
      ? 62 + (value / maxMagnitude) * 108
      : 132
  }
  const glyphs = forces.map(force => {
    const radians = (force.angle * Math.PI) / 180
    const dx = Math.cos(radians)
    const dy = -Math.sin(radians)
    const length = lengthOf(magnitudeForLength(force))
    const tx = FORCE_CENTER.x + dx * length
    const ty = FORCE_CENTER.y + dy * length
    const lx = tx + dx * 12
    const ly = ty + dy * 12
    const anchor = dx > 0.35 ? 'start' as const : dx < -0.35 ? 'end' as const : 'middle' as const
    const displayLabel = `${force.label}${force.magnitude ? ` ${force.magnitude}${force.unit}` : ''}`
    return { ...force, dx, dy, length, tx, ty, lx, ly, anchor, displayLabel }
  })

  let minX = FORCE_CENTER.x - 34
  let maxX = FORCE_CENTER.x + 34
  let minY = FORCE_CENTER.y - 24
  let maxY = FORCE_CENTER.y + 24
  for (const glyph of glyphs) {
    const labelWidth = Math.max(fontSize * 1.8, estimatedTextWidth(glyph.displayLabel, fontSize))
    const labelLeft = glyph.anchor === 'start' ? glyph.lx : glyph.anchor === 'end' ? glyph.lx - labelWidth : glyph.lx - labelWidth / 2
    const labelRight = glyph.anchor === 'start' ? glyph.lx + labelWidth : glyph.anchor === 'end' ? glyph.lx : glyph.lx + labelWidth / 2
    minX = Math.min(minX, glyph.tx - 10, labelLeft)
    maxX = Math.max(maxX, glyph.tx + 10, labelRight)
    minY = Math.min(minY, glyph.ty - 10, glyph.ly + 4 - fontSize * 0.85)
    maxY = Math.max(maxY, glyph.ty + 10, glyph.ly + 4 + fontSize * 0.25)
  }

  const padding = 18
  const frame = normalizeFrame({
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  })
  return {
    center: FORCE_CENTER,
    frame,
    glyphs,
    viewBox: `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
  }
}
