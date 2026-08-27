// Phase 1 placeholder — LiveChat multi-agent implementation deferred to Phase 2

export interface ChatMessage {
  id: string
  userId: string
  text: string
  timestamp: number
}

export type LiveChatEvent =
  | { type: 'message'; message: ChatMessage }
  | { type: 'connected' }
  | { type: 'disconnected' }

export interface LiveChat {
  send(text: string): void
  onEvent(handler: (event: LiveChatEvent) => void): () => void
  disconnect(): void
}

export class LiveChatStub implements LiveChat {
  send(_text: string): void {
    // no-op — Phase 1 placeholder
  }

  onEvent(_handler: (event: LiveChatEvent) => void): () => void {
    // no-op — Phase 1 placeholder
    return () => {}
  }

  disconnect(): void {
    // no-op — Phase 1 placeholder
  }
}
