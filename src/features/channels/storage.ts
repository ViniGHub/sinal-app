import { isValidPeerId, sanitizeName } from '@/features/session/protocol'
import { readJson, writeJson } from '@/shared/safeStorage'
import type { ChannelKind, SavedChannel } from './types'

const KEY = 'sinal.channels'

/** Enough for any realistic list, and a ceiling on what a corrupt blob can do. */
export const MAX_CHANNELS = 50

/** Unambiguous alphabet: no 0/O or 1/l, so an id can be read out loud. */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'
const CHANNEL_ID_LENGTH = 10

/**
 * Mints a channel id.
 *
 * The 'c-' marker is only a hint for humans reading a link; nothing depends on
 * it, because a channel is defined by someone holding the id, not by its shape.
 */
export function generateChannelId(): string {
  const bytes = new Uint8Array(CHANNEL_ID_LENGTH)
  crypto.getRandomValues(bytes)
  let id = ''
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length]
  return `sinal-c-${id}`
}

function parseChannel(raw: unknown): SavedChannel | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  // 'hostId' is the pre-channels field name. Entries written then always
  // pointed at a person, so they are migrated to that kind rather than dropped.
  const legacyHostId = value['hostId']
  const id = value['id'] ?? legacyHostId
  if (!isValidPeerId(id)) return null

  const kind: ChannelKind =
    value['kind'] === 'channel' ? 'channel' : value['kind'] === 'peer' ? 'peer' : 'peer'

  return {
    id,
    kind,
    name: sanitizeName(value['name']),
    savedAt: typeof value['savedAt'] === 'number' ? value['savedAt'] : 0,
    lastSeenAt: typeof value['lastSeenAt'] === 'number' ? value['lastSeenAt'] : null,
  }
}

/**
 * Reads the list back.
 *
 * Anything in localStorage may have been hand-edited or written by an older
 * version of the app, so entries are validated the same way messages off the
 * wire are, and bad ones are dropped rather than crashing the panel.
 */
export function loadChannels(): SavedChannel[] {
  const raw = readJson(KEY)
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const channels: SavedChannel[] = []

  for (const entry of raw) {
    const channel = parseChannel(entry)
    if (!channel || seen.has(channel.id)) continue
    seen.add(channel.id)
    channels.push(channel)
    if (channels.length >= MAX_CHANNELS) break
  }

  return channels
}

export function saveChannels(channels: SavedChannel[]): void {
  writeJson(KEY, channels.slice(0, MAX_CHANNELS))
}
