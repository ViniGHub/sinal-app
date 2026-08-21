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
