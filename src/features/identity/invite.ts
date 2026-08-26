import { isValidPeerId } from '@/features/session/protocol'

/**
 * Invites travel in the URL fragment rather than the query string: fragments
 * are never sent to the server hosting the page, so the id of a call stays
 * between the people in it.
 */
/**
 * The app only ever hands out channel links. `#join=` is still read, because
 * links shared before that decision still exist and still point at a person —
 * `MeshSession.enter` resolves those by asking them which channel they are in.
 * Nothing writes one any more.
 */
const PEER_PREFIX = '#join='
const CHANNEL_PREFIX = '#channel='

export interface Invite {
  /** 'channel' is what we produce; 'peer' only ever arrives from an old link. */
  kind: 'channel' | 'peer'
  id: string
}

export function buildChannelInviteUrl(channelId: string, origin = window.location.href): string {
  const base = origin.split('#')[0] ?? origin
  return `${base}${CHANNEL_PREFIX}${encodeURIComponent(channelId)}`
}

function decode(value: string): string | null {
  try {
    return decodeURIComponent(value)
  } catch {
    return null
  }
}

/** Reads an invite out of a URL fragment, or null when there is no valid one. */
export function readInvite(hash = window.location.hash): Invite | null {
  const prefix = hash.startsWith(CHANNEL_PREFIX)
    ? CHANNEL_PREFIX
    : hash.startsWith(PEER_PREFIX)
      ? PEER_PREFIX
      : null
  if (!prefix) return null

  const id = decode(hash.slice(prefix.length))
  if (!isValidPeerId(id)) return null

  return { kind: prefix === CHANNEL_PREFIX ? 'channel' : 'peer', id }
}

/**
 * Pulls an id out of whatever the user pasted: a full invite URL of either
 * kind, or a bare id. The kind is not decided here — `MeshSession.enter`
 * derives it from the id itself, so both paths end in a channel regardless.
 */
export function extractInviteId(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const hashAt = trimmed.indexOf('#')
  if (hashAt !== -1) {
    const invite = readInvite(trimmed.slice(hashAt))
    return invite?.id ?? null
  }

  return isValidPeerId(trimmed) ? trimmed : null
}

/**
 * Removes the invite from the address bar once it has been used, so a reload
 * does not redial and the id is not left sitting in the user's history.
 */
export function clearInvite(): void {
  const { pathname, search } = window.location
  window.history.replaceState(null, '', `${pathname}${search}`)
}
