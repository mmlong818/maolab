import { describe, expect, it } from 'vitest'
import { FEATURE_ZONE_ENTRIES, canEnterMainline, featureZone, featuresByZone } from '../feature-zones.js'

describe('mainline feature zones', () => {
  it('has stable unique feature ids', () => {
    const ids = FEATURE_ZONE_ENTRIES.map(entry => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('keeps isolated and experimental capabilities outside the mainline', () => {
    expect(canEnterMainline('live-classroom')).toBe(false)
    expect(canEnterMainline('media-remix')).toBe(false)
    expect(canEnterMainline('repair-grounding')).toBe(false)
    expect(canEnterMainline('present-mode')).toBe(false)
  })

  it('keeps the new teaching core in the mainline', () => {
    expect(canEnterMainline('teaching-skeleton')).toBe(true)
    expect(canEnterMainline('scene-stage')).toBe(true)
    expect(canEnterMainline('quality-gates')).toBe(true)
    expect(featureZone('personal-follow-along')).toBe('core')
  })

  it('documents every isolated capability with a restart action', () => {
    for (const entry of featuresByZone('isolated')) {
      expect(entry.restartAction.length).toBeGreaterThan(0)
      expect(entry.reason.length).toBeGreaterThan(0)
    }
  })
})
