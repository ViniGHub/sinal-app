import { beforeEach, describe, expect, it, vi } from 'vitest'

import { MAX_CHANNELS, loadChannels, saveChannels } from '../storage'
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

const channel = (hostId: string, name = 'Sala'): SavedChannel => ({
  hostId,
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

  it('drops entries whose host id could not be dialled anyway', () => {
    store.setItem(
      KEY,
      JSON.stringify([channel(A), { hostId: '<script>' }, { name: 'sem id' }, null, 42]),
    )
    expect(loadChannels()).toEqual([channel(A)])
  })

  it('repairs missing timestamps rather than rejecting the entry', () => {
    store.setItem(KEY, JSON.stringify([{ hostId: A, name: 'Sala' }]))
    expect(loadChannels()).toEqual([{ hostId: A, name: 'Sala', savedAt: 0, lastSeenAt: null }])
  })

  it('collapses duplicates of the same host', () => {
    store.setItem(KEY, JSON.stringify([channel(A, 'Primeiro'), channel(A, 'Segundo')]))
    expect(loadChannels()).toEqual([channel(A, 'Primeiro')])
  })

  it('caps how much a hand-edited blob can load', () => {
    const many = Array.from({ length: MAX_CHANNELS + 10 }, (_, i) =>
      channel(`sinal-${String(i).padStart(12, '0')}`),
    )
    store.setItem(KEY, JSON.stringify(many))
    expect(loadChannels()).toHaveLength(MAX_CHANNELS)
  })
})
