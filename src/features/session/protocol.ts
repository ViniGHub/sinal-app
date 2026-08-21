/**
 * Wire protocol for the peer-to-peer data channel.
 *
 * Everything arriving here was authored by a remote browser we do not control,
 * so nothing is trusted: `parseWireMessage` validates shape and clamps sizes
 * before the message reaches application code.
 */

export const MAX_NAME_LENGTH = 24
export const MAX_CHAT_LENGTH = 800
/** Guards against a peer flooding us with a huge roster. */
export const MAX_ROSTER_SIZE = 64

export type WireMessage =
  /** First message on a fresh connection: who I am and who I already know. */
  | { t: 'hello'; name: string; micMuted: boolean; sharing: boolean; peers: string[] }
  /** Reply to `hello`, plus any later roster change. */
  | { t: 'roster'; name: string; micMuted: boolean; sharing: boolean; peers: string[] }
  | { t: 'name'; name: string }
  | { t: 'mic'; micMuted: boolean }
  | { t: 'screen'; sharing: boolean }
  | { t: 'chat'; text: string; at: number }

/** PeerJS ids are restricted to this alphabet by the public broker. */
const PEER_ID_RE = /^[A-Za-z0-9_-]{4,64}$/

/**
 * Control characters render as garbage and can break layout, so stripping
 * them is exactly what this class is for.
 */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = new RegExp('[\u0000-\u001F\u007F]', 'g')

export function isValidPeerId(value: unknown): value is string {
  return typeof value === 'string' && PEER_ID_RE.test(value)
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(CONTROL_CHARS_RE, ' ').trim().slice(0, max)
}

function cleanRoster(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter(isValidPeerId).slice(0, MAX_ROSTER_SIZE)
}

export function sanitizeName(value: unknown): string {
  return cleanText(value, MAX_NAME_LENGTH)
}

/**
 * Turn an untrusted value from the data channel into a `WireMessage`, or null
 * if it is not one we recognise. Unknown message types are dropped rather than
 * throwing, so a newer peer version cannot crash an older one.
 */
export function parseWireMessage(raw: unknown): WireMessage | null {
  if (typeof raw !== 'object' || raw === null) return null
  const msg = raw as Record<string, unknown>

  switch (msg['t']) {
    case 'hello':
    case 'roster':
      return {
        t: msg['t'],
        name: sanitizeName(msg['name']),
        micMuted: msg['micMuted'] === true,
        sharing: msg['sharing'] === true,
        peers: cleanRoster(msg['peers']),
      }
    case 'name':
      return { t: 'name', name: sanitizeName(msg['name']) }
    case 'mic':
      return { t: 'mic', micMuted: msg['micMuted'] === true }
    case 'screen':
      return { t: 'screen', sharing: msg['sharing'] === true }
    case 'chat': {
      const text = cleanText(msg['text'], MAX_CHAT_LENGTH)
      if (!text) return null
      const at = typeof msg['at'] === 'number' && Number.isFinite(msg['at']) ? msg['at'] : 0
      return { t: 'chat', text, at }
    }
    default:
      return null
  }
}

/**
 * Decides which side of a pair opens the connection.
 *
 * Both peers learn about each other at the same moment through roster gossip.
 * Without a rule they would both dial, producing duplicate calls (WebRTC
 * "glare"). Comparing ids is deterministic and needs no extra round trip.
 */
export function shouldInitiate(selfId: string, otherId: string): boolean {
  return selfId < otherId
}

/** Fallback label for a peer that has not announced a name yet. */
export function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 4)}…${id.slice(-3)}`
}
