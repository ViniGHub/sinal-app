import type { ChatMessage } from '@/features/chat/types'
import type { RemotePeer } from '@/features/participants/types'

export type StatusKind = 'idle' | 'busy' | 'ok' | 'error'

export interface SessionStatus {
  kind: StatusKind
  message: string
}

/**
 * The immutable view of the session that React subscribes to. A new object is
 * produced on every change so `useSyncExternalStore` can diff by reference.
 *
 * This is where the domains meet: the session is what knows about participants
 * and messages at the same time, which is why the aggregate type lives here
 * rather than in either of them.
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
