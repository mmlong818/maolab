import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  CAST_CHARACTER_IDS,
  CAST_EXPRESSIONS,
  CAST_SCHOOL_STAGES,
  CAST_SEASONS,
  CAST_SUBJECT_IDS,
} from '../matrix.js'

// docs/cast-asset-requirements.md §6：资产缺口必须显式暴露，不允许运行时静默退回旧头像。
const castRoot = fileURLToPath(new URL('../../../../public/generated-images/cast/', import.meta.url))

describe('cast asset matrix completeness', () => {
  it('基础卡司矩阵完整：8 角色 × 3 学段 × 2 季节 × 4 表情 = 192 张脱底立绘', () => {
    const missing: string[] = []
    for (const characterId of CAST_CHARACTER_IDS) {
      for (const schoolStage of CAST_SCHOOL_STAGES) {
        for (const season of CAST_SEASONS) {
          for (const expression of CAST_EXPRESSIONS) {
            const file = join(castRoot, 'base', schoolStage, season, `${characterId}-${expression}.png`)
            if (!existsSync(file)) missing.push(`base/${schoolStage}/${season}/${characterId}-${expression}.png`)
          }
        }
      }
    }
    expect(CAST_CHARACTER_IDS).toHaveLength(8)
    expect(missing).toEqual([])
  })

  it('学科立绘矩阵完整：8 学科 × 8 角色 × 3 学段 × 2 季节 = 384 张 neutral 立绘', () => {
    const missing: string[] = []
    for (const subject of CAST_SUBJECT_IDS) {
      for (const characterId of CAST_CHARACTER_IDS) {
        for (const schoolStage of CAST_SCHOOL_STAGES) {
          for (const season of CAST_SEASONS) {
            const file = join(castRoot, 'subject', subject, schoolStage, season, `${characterId}.png`)
            if (!existsSync(file)) missing.push(`subject/${subject}/${schoolStage}/${season}/${characterId}.png`)
          }
        }
      }
    }
    expect(CAST_SUBJECT_IDS).toHaveLength(8)
    expect(missing).toEqual([])
  })
})
