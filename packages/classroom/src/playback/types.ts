import type { Scene } from '@maolab/shared-types'

export type PlaybackStatus =
  | 'idle' | 'playing' | 'paused' | 'live' | 'supplementing' | 'ended'

export interface PlaybackState {
  status: PlaybackStatus
  scenes: Scene[]
  currentIndex: number
  currentScene: Scene | null
  skippedSceneIds: string[]
  insertedSceneIds: string[]
}

export type PlaybackEvent =
  | { type: 'PLAY' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'NEXT' }
  | { type: 'SKIP' }
  | { type: 'JUMP'; index: number }
  | { type: 'START_LIVE' }
  | { type: 'END_LIVE' }
  | { type: 'START_SUPPLEMENTING' }
  | { type: 'END_SUPPLEMENTING' }
  | { type: 'INSERT_SCENES'; atIndex: number; scenes: Scene[] }
  | { type: 'END' }
