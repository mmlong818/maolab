import { describe, expect, it } from 'vitest'
import {
  DIALOGUE_LAYOUTS,
  PEER_FUNCTIONS,
  QUALITY_GATES,
  REQUIRED_SCENE_FIELDS,
  SCENE_TECHNIQUE_IDS,
} from '../domain.js'

describe('mainline domain', () => {
  it('requires the scene fields that protect teaching quality', () => {
    expect(REQUIRED_SCENE_FIELDS).toContain('visualFocus')
    expect(REQUIRED_SCENE_FIELDS).toContain('narrationAnchor')
    expect(REQUIRED_SCENE_FIELDS).toContain('boardText')
    expect(REQUIRED_SCENE_FIELDS).toContain('sceneTechnique')
    expect(REQUIRED_SCENE_FIELDS).toContain('characterLayer')
    expect(REQUIRED_SCENE_FIELDS).toContain('peerFunction')
    expect(REQUIRED_SCENE_FIELDS).toContain('subjectTeachingMode')
    expect(REQUIRED_SCENE_FIELDS).toContain('voiceCue')
    expect(REQUIRED_SCENE_FIELDS).toContain('gradeTone')
  })

  it('keeps all restart quality gates explicit', () => {
    expect(QUALITY_GATES).toEqual([
      'pedagogy',
      'visual',
      'performance',
      'asset',
      'cast-voice-grade',
      'technique',
    ])
  })

  it('keeps classroom layout and role rule enums enumerable for gates', () => {
    expect(SCENE_TECHNIQUE_IDS).toContain('layered-reveal')
    expect(SCENE_TECHNIQUE_IDS).toContain('path-tracing')
    expect(SCENE_TECHNIQUE_IDS).toContain('draggable-model')
    expect(DIALOGUE_LAYOUTS).toContain('teacher-left-content-right')
    expect(DIALOGUE_LAYOUTS).toContain('corner-avatar')
    expect(DIALOGUE_LAYOUTS).toContain('no-character')
    expect(PEER_FUNCTIONS).toContain('misconception')
    expect(PEER_FUNCTIONS).toContain('attempt-answer')
  })
})
