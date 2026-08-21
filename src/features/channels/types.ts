/** A host someone bookmarked so they can come back to it later. */
export interface SavedChannel {
  /** Peer id of the host. This is what gets dialled to rejoin. */
  hostId: string
  /** User-editable label, defaulting to the host's display name. */
  name: string
  savedAt: number
  /** Last time we confirmed the host was reachable, for stale detection. */
  lastSeenAt: number | null
}

/**
 * Whether a saved host is reachable right now.
 *
 * 'unknown' is the honest starting state: we have not asked yet, and showing
 * "offline" before checking would be a lie the user acts on.
 */
export type ChannelPresence = 'unknown' | 'checking' | 'online' | 'offline'
