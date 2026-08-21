import { isValidPeerId } from './protocol'

/**
 * Invites travel in the URL fragment rather than the query string: fragments
 * are never sent to the server hosting the page, so the id of a call stays
 * between the people in it.
 */
const PREFIX = '#join='

export function buildInviteUrl(peerId: string, origin = window.location.href): string {
  const base = origin.split('#')[0] ?? origin
  return `${base}${PREFIX}${encodeURIComponent(peerId)}`
}

/** Reads a peer id out of a URL fragment, or null when there is no valid one. */
export function readInvite(hash = window.location.hash): string | null {
  if (!hash.startsWith(PREFIX)) return null
  let value: string
  try {
    value = decodeURIComponent(hash.slice(PREFIX.length))
  } catch {
    return null
  }
  return isValidPeerId(value) ? value : null
}

/**
 * Removes the invite from the address bar once it has been used, so a reload
 * does not redial and the id is not left sitting in the user's history.
 */
export function clearInvite(): void {
  const { pathname, search } = window.location
  window.history.replaceState(null, '', `${pathname}${search}`)
}
