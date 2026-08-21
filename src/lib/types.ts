/**
 * Shared domain types. These describe what the UI renders; they deliberately
 * contain no PeerJS types so the React layer never touches the transport.
 */

export type PeerStatus = 'connecting' | 'connected' | 'closed'

/** A remote participant, as far as the local session can tell. */
export interface RemotePeer {
  id: string
  /** Display name they announced, or a short form of their id until they do. */
  name: string
  status: PeerStatus
  /** Whether they told us their microphone is muted. */
  micMuted: boolean
  /** Their voice, or null while the audio call is still being set up. */
  audioStream: MediaStream | null
  /** Their screen, or null when they are not sharing. */
  screenStream: MediaStream | null
}

export interface ChatMessage {
  id: string
  /** Peer id of the sender, or 'self' for messages this client sent. */
  from: string
  name: string
  text: string
  at: number
}

export type StatusKind = 'idle' | 'busy' | 'ok' | 'error'

export interface SessionStatus {
  kind: StatusKind
  message: string
}

/**
 * The immutable view of the session that React subscribes to. A new object is
 * produced on every change so `useSyncExternalStore` can diff by reference.
 */
export interface MeshSnapshot {
  /** Our own peer id, or null until the signalling server assigns one. */
  selfId: string | null
  selfName: string
  status: SessionStatus
  peers: RemotePeer[]
  micMuted: boolean
  /** Whether we are currently sharing our screen. */
  sharing: boolean
  /** Local screen capture, for self-preview. */
  localScreen: MediaStream | null
  /** Our own microphone capture, for the level meter. */
  localMic: MediaStream | null
  messages: ChatMessage[]
}
