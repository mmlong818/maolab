export interface SpotlightAction {
  type: 'spotlight'
  elementId: string
  duration: number
}

export interface LaserAction {
  type: 'laser'
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface SpeechAction {
  type: 'speech'
  agentId: string
  text: string
  audioUrl?: string
}

export interface WhiteboardOpenAction { type: 'wb_open' }
export interface WhiteboardCloseAction { type: 'wb_close' }
export interface WhiteboardClearAction { type: 'wb_clear' }

export interface WhiteboardDrawTextAction {
  type: 'wb_draw_text'
  x: number
  y: number
  text: string
  fontSize?: number
}

export interface WhiteboardDrawShapeAction {
  type: 'wb_draw_shape'
  shape: 'rect' | 'circle' | 'arrow' | 'line'
  x: number
  y: number
  width: number
  height: number
  color?: string
}

export interface DiscussionAction {
  type: 'discussion'
  topic: string
  maxRounds: number
}

export interface PlayVideoAction {
  type: 'play_video'
  url: string
  startAt?: number
}

export type Action =
  | SpotlightAction
  | LaserAction
  | SpeechAction
  | WhiteboardOpenAction
  | WhiteboardCloseAction
  | WhiteboardClearAction
  | WhiteboardDrawTextAction
  | WhiteboardDrawShapeAction
  | DiscussionAction
  | PlayVideoAction
