import { isValidPeerId } from '@/features/session/protocol'

/**
 * Invites travel in the URL fragment rather than the query string: fragments
 * are never sent to the server hosting the page, so the id of a call stays
 * between the people in it.
 */
const PEER_PREFIX = '#join='
const CHANNEL_PREFIX = '#channel='

export interface Invite {
  /** 'channel' outlives its creator; 'peer' reaches one specific person. */
  kind: 'channel' | 'peer'
  id: string
}

function buildUrl(prefix: string, id: string, origin: string): string {
  const base = origin.split('#')[0] ?? origin
  return `${base}${prefix}${encodeURIComponent(id)}`
}

export function buildInviteUrl(peerId: string, origin = window.location.href): string {
  return buildUrl(PEER_PREFIX, peerId, origin)
}

export function buildChannelInviteUrl(channelId: string, origin = window.location.href): string {
  return buildUrl(CHANNEL_PREFIX, channelId, origin)
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
 * Removes the invite from the address bar once it has been used, so a reload
 * does not redial and the id is not left sitting in the user's history.
 */
export function clearInvite(): void {
  const { pathname, search } = window.location
  window.history.replaceState(null, '', `${pathname}${search}`)
}
