import type { Scene } from '@maolab/shared-types'
import type { PlaybackState, PlaybackStatus } from './types.js'

export class PlaybackEngine {
  private _state: PlaybackState

  constructor(scenes: Scene[]) {
    this._state = {
      status: 'idle',
      scenes: [...scenes],
      currentIndex: 0,
      currentScene: scenes[0] ?? null,
      skippedSceneIds: [],
      insertedSceneIds: [],
    }
  }

  get state(): Readonly<PlaybackState> {
    return this._state
  }

  private update(partial: Partial<PlaybackState>): void {
    this._state = { ...this._state, ...partial }
  }

  private currentSceneAt(index: number): Scene | null {
    return this._state.scenes[index] ?? null
  }

  play(): void {
    this.update({
      status: 'playing',
      currentScene: this.currentSceneAt(this._state.currentIndex),
    })
  }

  pause(): void {
    this.update({ status: 'paused' })
  }

  resume(): void {
    this.update({ status: 'playing' })
  }

  nextScene(): void {
    const nextIndex = this._state.currentIndex + 1
    if (nextIndex >= this._state.scenes.length) {
      this.update({ status: 'ended', currentScene: null })
    } else {
      this.update({
        currentIndex: nextIndex,
        currentScene: this.currentSceneAt(nextIndex),
      })
    }
  }

  jumpTo(index: number): void {
    if (index < 0 || index >= this._state.scenes.length) {
      throw new Error('Index out of bounds')
    }
    this.update({
      currentIndex: index,
      currentScene: this.currentSceneAt(index),
    })
  }

  startLive(): void {
    this.update({ status: 'live' })
  }

  endLive(): void {
    this.update({ status: 'playing' })
  }

  startSupplementing(): void {
    this.update({ status: 'supplementing' })
  }

  endSupplementing(): void {
    this.update({ status: 'playing' })
  }

  insertScenes(atIndex: number, newScenes: Scene[]): void {
    const scenes = [...this._state.scenes]
    scenes.splice(atIndex, 0, ...newScenes)
    this.update({
      scenes,
      insertedSceneIds: [
        ...this._state.insertedSceneIds,
        ...newScenes.map((s) => s.id),
      ],
    })
  }

  skipScene(): void {
    const current = this._state.currentScene
    const skippedSceneIds = current
      ? [...this._state.skippedSceneIds, current.id]
      : this._state.skippedSceneIds

    const nextIndex = this._state.currentIndex + 1
    if (nextIndex >= this._state.scenes.length) {
      this.update({ skippedSceneIds, status: 'ended', currentScene: null })
    } else {
      this.update({
        skippedSceneIds,
        currentIndex: nextIndex,
        currentScene: this.currentSceneAt(nextIndex),
      })
    }
  }
}
