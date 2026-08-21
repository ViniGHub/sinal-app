/**
 * What a bookmark points at.
 *
 * 'channel' is an id with its own identity, held by whoever is inside it — it
 * outlives the person who created it. 'peer' is a specific person's id, which
 * dies when their browser gives it up; bookmarks saved before channels existed
 * are of this kind.
 */
export type ChannelKind = 'channel' | 'peer'

export interface SavedChannel {
  /** Channel id, or a person's peer id when `kind` is 'peer'. */
  id: string
  kind: ChannelKind
  /** User-editable label. */
  name: string
  savedAt: number
  /** Last time we confirmed it was reachable, for stale detection. */
  lastSeenAt: number | null
}

/**
 * Whether a saved entry is reachable right now.
 *
 * 'unknown' is the honest starting state: we have not asked yet, and showing
 * "offline" before checking would be a lie the user acts on.
 */
export type ChannelPresence = 'unknown' | 'checking' | 'online' | 'offline'
