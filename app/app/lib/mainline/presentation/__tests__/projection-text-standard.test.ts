import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { PROJECTION_TEXT_MIN_PX } from '../tokens.js'

const APP_ROOT = fileURLToPath(new URL('../../../../', import.meta.url))
const SCENE_VIEWS = join(APP_ROOT, 'components', 'mainline', 'scene-views')
const STUDENT_SURFACE_FILES = [
  ...readdirSync(SCENE_VIEWS)
    .filter(name => name.endsWith('.tsx'))
    .map(name => join(SCENE_VIEWS, name)),
  join(APP_ROOT, 'components', 'mainline', 'DialogueLayer.tsx'),
]

function lowRawFontSizes(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const findings: string[] = []
  const patterns = [
    /fontSize\s*:\s*['"](\d+)px['"]/g,
    /text-\[(\d+)px\]/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const px = Number(match[1])
      if (px >= PROJECTION_TEXT_MIN_PX.body) continue
      const line = source.slice(0, match.index).split('\n').length
      findings.push(`${file}:${line} 写死 ${px}px`)
    }
  }

  const undersizedTailwind = /\btext-(xs|sm|base|lg|xl)\b/g
  for (const match of source.matchAll(undersizedTailwind)) {
    const line = source.slice(0, match.index).split('\n').length
    findings.push(`${file}:${line} 使用 text-${match[1]}`)
  }
  return findings
}

function isRuntimeClampedLegacyBadge(finding: string): boolean {
  return finding.includes('scene-views\\source-reading.tsx:') && finding.endsWith('写死 13px')
}

describe('学生投影片文字下限', () => {
  it('标题、正文、图表和辅助文字下限固定', () => {
    expect(PROJECTION_TEXT_MIN_PX).toEqual({
      display: 36,
      heading: 36,
      body: 28,
      auxiliary: 20,
      diagram: 22,
    })
  })

  it('学生页面禁止写死低于正文下限的字号，较小角色必须显式走 projectionFontSize', () => {
    const findings = STUDENT_SURFACE_FILES.flatMap(lowRawFontSizes)
    const clampedLegacyBadges = findings.filter(isRuntimeClampedLegacyBadge)
    expect(clampedLegacyBadges.length).toBeLessThanOrEqual(2)
    expect(findings.filter(finding => !isRuntimeClampedLegacyBadge(finding))).toEqual([])
  })

  it('课堂与备课共用的投影片根节点默认正文为 28px', () => {
    const css = readFileSync(join(APP_ROOT, 'globals.css'), 'utf8')
    expect(css).toMatch(/div\[lang='zh-CN'\]\[class~='text-\[\#f9f1df\]'\]\s*\{\s*font-size:\s*28px;/)
    expect(css).toMatch(/\[style\*='font-size: 13px'\]\s*\{\s*font-size:\s*20px !important;/)
  })
})
