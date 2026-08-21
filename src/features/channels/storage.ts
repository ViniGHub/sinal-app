import { isValidPeerId, sanitizeName } from '@/features/session/protocol'
import { readJson, writeJson } from '@/shared/safeStorage'
import type { SavedChannel } from './types'

const KEY = 'sinal.channels'

/** Enough for any realistic list, and a ceiling on what a corrupt blob can do. */
export const MAX_CHANNELS = 50

function parseChannel(raw: unknown): SavedChannel | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>

  const hostId = value['hostId']
  if (!isValidPeerId(hostId)) return null

  const savedAt = typeof value['savedAt'] === 'number' ? value['savedAt'] : 0
  const lastSeenAt = typeof value['lastSeenAt'] === 'number' ? value['lastSeenAt'] : null

  return {
    hostId,
    name: sanitizeName(value['name']),
    savedAt,
    lastSeenAt,
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
    if (!channel || seen.has(channel.hostId)) continue
    seen.add(channel.hostId)
    channels.push(channel)
    if (channels.length >= MAX_CHANNELS) break
  }

  return channels
}

export function saveChannels(channels: SavedChannel[]): void {
  writeJson(KEY, channels.slice(0, MAX_CHANNELS))
}
