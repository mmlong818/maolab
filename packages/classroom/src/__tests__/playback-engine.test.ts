import { describe, it, expect } from 'vitest'
import { PlaybackEngine } from '../playback/engine.js'
import type { Scene } from '@maolab/shared-types'

function makeScene(id: string, type: Scene['type'] = 'slide'): Scene {
  return {
    id, outlineItemId: `item-${id}`, type, title: `Scene ${id}`,
    content: { type: 'slide', slides: [], conceptIds: [] }, actions: [], durationHint: 180,
    generationStatus: 'done',
  }
}

describe('PlaybackEngine', () => {
  it('initial state is idle', () => {
    const engine = new PlaybackEngine([makeScene('1'), makeScene('2')])
    expect(engine.state.status).toBe('idle')
    expect(engine.state.currentIndex).toBe(0)
  })

  it('play() transitions idle → playing', () => {
    const engine = new PlaybackEngine([makeScene('1')])
    engine.play()
    expect(engine.state.status).toBe('playing')
    expect(engine.state.currentScene?.id).toBe('1')
  })

  it('pause() transitions playing → paused', () => {
    const engine = new PlaybackEngine([makeScene('1')])
    engine.play()
    engine.pause()
    expect(engine.state.status).toBe('paused')
  })

  it('resume() transitions paused → playing', () => {
    const engine = new PlaybackEngine([makeScene('1')])
    engine.play()
    engine.pause()
    engine.resume()
    expect(engine.state.status).toBe('playing')
  })

  it('nextScene() advances index', () => {
    const engine = new PlaybackEngine([makeScene('1'), makeScene('2'), makeScene('3')])
    engine.play()
    engine.nextScene()
    expect(engine.state.currentIndex).toBe(1)
    expect(engine.state.currentScene?.id).toBe('2')
  })

  it('nextScene() on last scene transitions to ended', () => {
    const engine = new PlaybackEngine([makeScene('1')])
    engine.play()
    engine.nextScene()
    expect(engine.state.status).toBe('ended')
  })

  it('jumpTo() sets currentIndex directly', () => {
    const engine = new PlaybackEngine([makeScene('1'), makeScene('2'), makeScene('3')])
    engine.play()
    engine.jumpTo(2)
    expect(engine.state.currentIndex).toBe(2)
    expect(engine.state.currentScene?.id).toBe('3')
  })

  it('jumpTo() throws on negative index', () => {
    const engine = new PlaybackEngine([makeScene('1'), makeScene('2')])
    expect(() => engine.jumpTo(-1)).toThrow('Index out of bounds')
  })

  it('jumpTo() throws on index >= scenes.length', () => {
    const engine = new PlaybackEngine([makeScene('1'), makeScene('2')])
    expect(() => engine.jumpTo(2)).toThrow('Index out of bounds')
  })

  it('startLive() transitions playing → live', () => {
    const engine = new PlaybackEngine([makeScene('1')])
    engine.play()
    engine.startLive()
    expect(engine.state.status).toBe('live')
  })

  it('endLive() transitions live → playing', () => {
    const engine = new PlaybackEngine([makeScene('1')])
    engine.play()
    engine.startLive()
    engine.endLive()
    expect(engine.state.status).toBe('playing')
  })

  it('startSupplementing() transitions playing → supplementing', () => {
    const engine = new PlaybackEngine([makeScene('1')])
    engine.play()
    engine.startSupplementing()
    expect(engine.state.status).toBe('supplementing')
  })

  it('insertScenes() adds scenes after current index', () => {
    const engine = new PlaybackEngine([makeScene('1'), makeScene('3')])
    engine.play()
    engine.insertScenes(1, [makeScene('2')])
    expect(engine.state.scenes[1].id).toBe('2')
    expect(engine.state.scenes[2].id).toBe('3')
    expect(engine.state.scenes).toHaveLength(3)
  })

  it('skipScene() advances without playing the scene', () => {
    const engine = new PlaybackEngine([makeScene('1'), makeScene('2')])
    engine.play()
    engine.skipScene()
    expect(engine.state.currentIndex).toBe(1)
    expect(engine.state.skippedSceneIds).toContain('1')
  })
})
