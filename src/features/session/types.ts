import type { ChatMessage } from '@/features/chat/types'
import type { RemotePeer } from '@/features/participants/types'

export type StatusKind = 'idle' | 'busy' | 'ok' | 'error'

/** The channel we are in, if any. */
export interface ChannelMembership {
  id: string
  /**
   * Whether we are the one holding the channel id. The anchor is a rendezvous
   * point for joiners, not a relay — media never passes through it.
   */
  isAnchor: boolean
  /** Shared across everyone in the channel. Empty until someone names it. */
  name: string
  /**
   * Local timestamp after which the name may change again, or 0 when it may
   * change now. The cooldown belongs to the channel, not to a person: once
   * anyone renames it, it is settled for everyone.
   */
  cooldownUntil: number
}

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
  /** Null when connected peer-to-peer without a channel. */
  channel: ChannelMembership | null
  /**
   * Whether our display name grants moderation. A convention among people who
   * already trust each other, not a permission — see `moderation.ts`.
   */
  isAdmin: boolean
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
