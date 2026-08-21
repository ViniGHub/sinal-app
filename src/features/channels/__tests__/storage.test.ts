import { beforeEach, describe, expect, it, vi } from 'vitest'

import { isValidPeerId } from '@/features/session/protocol'

import {
  MAX_CHANNELS,
  generateChannelId,
  isChannelId,
  loadChannels,
  saveChannels,
} from '../storage'
import type { SavedChannel } from '../types'

const KEY = 'sinal.channels'

/** Minimal in-memory Storage, since these tests run outside a browser. */
function installStorage(): Storage {
  const data = new Map<string, string>()
  const store: Storage = {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, value),
  }
  vi.stubGlobal('window', { localStorage: store })
  return store
}

const channel = (id: string, name = 'Sala', kind: SavedChannel['kind'] = 'channel'): SavedChannel => ({
  id,
  kind,
  name,
  savedAt: 1,
  lastSeenAt: 2,
})

const A = 'sinal-aaaaaaaaaaaa'
const B = 'sinal-bbbbbbbbbbbb'

describe('channel storage', () => {
  let store: Storage

  beforeEach(() => {
    store = installStorage()
  })

  it('round-trips what it saved', () => {
    saveChannels([channel(A), channel(B, 'Outra')])
    expect(loadChannels()).toEqual([channel(A), channel(B, 'Outra')])
  })

  it('returns an empty list when nothing was ever saved', () => {
    expect(loadChannels()).toEqual([])
  })

  it('survives a corrupt blob instead of throwing', () => {
    store.setItem(KEY, '{not json')
    expect(loadChannels()).toEqual([])
    store.setItem(KEY, '"a string"')
    expect(loadChannels()).toEqual([])
  })

  it('drops entries whose id could not be dialled anyway', () => {
    store.setItem(
      KEY,
      JSON.stringify([channel(A), { id: '<script>' }, { name: 'sem id' }, null, 42]),
    )
    expect(loadChannels()).toEqual([channel(A)])
  })

  it('repairs missing timestamps rather than rejecting the entry', () => {
    store.setItem(KEY, JSON.stringify([{ id: A, kind: 'channel', name: 'Sala' }]))
    expect(loadChannels()).toEqual([
      { id: A, kind: 'channel', name: 'Sala', savedAt: 0, lastSeenAt: null },
    ])
  })

  it('migrates bookmarks written before channels existed', () => {
    // The old shape had 'hostId' and always pointed at a person, so migrating
    // it to kind 'peer' keeps it working instead of silently losing it.
    store.setItem(KEY, JSON.stringify([{ hostId: A, name: 'Vini', savedAt: 7, lastSeenAt: 9 }]))
    expect(loadChannels()).toEqual([
      { id: A, kind: 'peer', name: 'Vini', savedAt: 7, lastSeenAt: 9 },
    ])
  })

  it('treats an unrecognised kind as a person rather than a channel', () => {
    // Guessing 'channel' would make us knock on a person's id and hang.
    store.setItem(KEY, JSON.stringify([{ id: A, kind: 'sala', name: 'X' }]))
    expect(loadChannels()[0]?.kind).toBe('peer')
  })

  it('collapses duplicates of the same host', () => {
    store.setItem(KEY, JSON.stringify([channel(A, 'Primeiro'), channel(A, 'Segundo')]))
    expect(loadChannels()).toEqual([channel(A, 'Primeiro')])
  })

  it('tells channel ids apart from personal ids', () => {
    // Load-bearing: entering an empty channel claims its id, and claiming a
    // person's id would collide with their own registration and force their
    // identity to rotate.
    expect(isChannelId('sinal-c-abc23xyz9k')).toBe(true)
    expect(isChannelId('sinal-abc23xyz9k7m')).toBe(false)
    expect(isChannelId('qualquer-coisa')).toBe(false)
  })

  it('mints ids that its own check recognises as channels', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(7) })
    expect(isChannelId(generateChannelId())).toBe(true)
  })

  it('mints channel ids the broker will accept', () => {
    vi.stubGlobal('crypto', { getRandomValues: (a: Uint8Array) => a.fill(7) })
    const id = generateChannelId()
    // Must satisfy the same rule as any peer id — a channel *is* a peer id
    // that someone inside the channel is holding.
    expect(isValidPeerId(id)).toBe(true)
    expect(id.startsWith('sinal-c-')).toBe(true)
  })

  it('caps how much a hand-edited blob can load', () => {
    const many = Array.from({ length: MAX_CHANNELS + 10 }, (_, i) =>
      channel(`sinal-${String(i).padStart(12, '0')}`),
    )
    store.setItem(KEY, JSON.stringify(many))
    expect(loadChannels()).toHaveLength(MAX_CHANNELS)
  })
})
