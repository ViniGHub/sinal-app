/**
 * Wire protocol for the peer-to-peer data channel.
 *
 * Everything arriving here was authored by a remote browser we do not control,
 * so nothing is trusted: `parseWireMessage` validates shape and clamps sizes
 * before the message reaches application code.
 */

import type { AttentionState, Occupant } from '@/features/participants/types'

export const MAX_NAME_LENGTH = 24
export const MAX_CHANNEL_NAME_LENGTH = 32
export const MAX_CHAT_LENGTH = 800
/** Guards against a peer flooding us with a huge roster. */
export const MAX_ROSTER_SIZE = 64

interface Presence {
  name: string
  micMuted: boolean
  sharing: boolean
  attention: AttentionState
}

export type WireMessage =
  /** First message on a fresh connection: who I am and who I already know. */
  | ({ t: 'hello'; peers: string[] } & Presence)
  /** Reply to `hello`, plus any later roster change. */
  | ({ t: 'roster'; peers: string[] } & Presence)
  | { t: 'name'; name: string }
  | { t: 'mic'; micMuted: boolean }
  | { t: 'screen'; sharing: boolean }
  | { t: 'attention'; attention: AttentionState }
  | { t: 'chat'; text: string; at: number }
  /**
   * Answer to a personal invite: the channel to meet in. The person being
   * invited never learns a peer id from this — only where to go.
   */
  | { t: 'channel'; id: string }
  /**
   * Asks the recipient to leave the channel. Honoured only from an admin.
   *
   * `by` carries the sender's claimed name because a removal can arrive over a
   * one-shot connection from someone who is not in the channel at all, so
   * there is no established peer to read a name from.
   */
  | { t: 'kick'; by: string }
  /**
   * The channel's shared name. Carries who set it and when, so every node can
   * settle disagreements the same way without needing message ordering.
   */
  | { t: 'channel-name'; name: string; at: number; from: string }
  /** Sent by a channel anchor to whoever just knocked: who is inside. */
  | { t: 'members'; occupants: Occupant[] }

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

/**
 * Accepts both the current shape (objects with a name) and the bare id list an
 * older build sends, so a peer that has not reloaded yet still gets dialled —
 * it just shows up without a name until it introduces itself.
 */
function cleanOccupants(value: unknown): Occupant[] {
  if (!Array.isArray(value)) return []

  const occupants: Occupant[] = []
  for (const entry of value.slice(0, MAX_ROSTER_SIZE)) {
    if (isValidPeerId(entry)) {
      occupants.push({ id: entry, name: '' })
      continue
    }
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (!isValidPeerId(record['id'])) continue
    occupants.push({ id: record['id'], name: sanitizeName(record['name']) })
  }
  return occupants
}

export function sanitizeName(value: unknown): string {
  return cleanText(value, MAX_NAME_LENGTH)
}

export function sanitizeChannelName(value: unknown): string {
  return cleanText(value, MAX_CHANNEL_NAME_LENGTH)
}

/**
 * Whether one channel-name claim supersedes another.
 *
 * Last-write-wins on the author's clock, with their peer id breaking ties. The
 * tiebreak is what makes it safe: two people renaming in the same instant would
 * otherwise leave each node holding whichever message happened to arrive last,
 * and the room would disagree with itself forever. Comparing ids gives every
 * node the same answer regardless of arrival order.
 */
export function supersedesChannelName(
  incoming: { at: number; from: string },
  current: { at: number; from: string },
): boolean {
  if (incoming.at !== current.at) return incoming.at > current.at
  return incoming.from > current.from
}

const ATTENTION_STATES: readonly AttentionState[] = ['unknown', 'focused', 'visible', 'hidden']

/**
 * Anything we do not recognise becomes 'unknown' rather than a guess. A peer
 * running a newer build might report a state this version has never heard of,
 * and inventing "focused" would tell the user someone is watching when we have
 * no idea.
 */
function cleanAttention(value: unknown): AttentionState {
  return ATTENTION_STATES.includes(value as AttentionState) ? (value as AttentionState) : 'unknown'
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
        attention: cleanAttention(msg['attention']),
        peers: cleanRoster(msg['peers']),
      }
    case 'members':
      return { t: 'members', occupants: cleanOccupants(msg['occupants'] ?? msg['peers']) }
    case 'channel': {
      const id = msg['id']
      return isValidPeerId(id) ? { t: 'channel', id } : null
    }
    case 'name':
      return { t: 'name', name: sanitizeName(msg['name']) }
    case 'mic':
      return { t: 'mic', micMuted: msg['micMuted'] === true }
    case 'screen':
      return { t: 'screen', sharing: msg['sharing'] === true }
    case 'attention':
      return { t: 'attention', attention: cleanAttention(msg['attention']) }
    case 'kick':
      // Empty when it came from a build that predates the field; the receiver
      // falls back to the name it already holds for that peer.
      return { t: 'kick', by: sanitizeName(msg['by']) }
    case 'channel-name': {
      const name = sanitizeChannelName(msg['name'])
      const from = msg['from']
      // Both fields drive conflict resolution, so a claim missing either one
      // cannot be ordered against the others and is dropped rather than guessed.
      if (!name || !isValidPeerId(from)) return null
      const at = typeof msg['at'] === 'number' && Number.isFinite(msg['at']) ? msg['at'] : 0
      return { t: 'channel-name', name, at, from }
    }
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
