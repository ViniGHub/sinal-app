import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { sanitizeName } from '@/features/session/protocol'
import { ChannelsContext, type ChannelsStore } from './channelsContext'
import { MAX_CHANNELS, loadChannels, saveChannels } from './storage'
import type { SavedChannel } from './types'

/**
 * Holds the bookmarks and writes every change straight through to
 * localStorage. Small and rarely-changing, so plain state is enough here —
 * unlike the session, which needs an external store for concurrent reads.
 */
export function ChannelsProvider({ children }: { children: ReactNode }) {
  const [channels, setChannels] = useState<SavedChannel[]>(loadChannels)

  const commit = useCallback((next: SavedChannel[]) => {
    setChannels(next)
    saveChannels(next)
  }, [])

  const store = useMemo<ChannelsStore>(() => {
    const find = (id: string) => channels.some((channel) => channel.id === id)

    const patch = (id: string, changes: Partial<SavedChannel>) =>
      commit(channels.map((channel) => (channel.id === id ? { ...channel, ...changes } : channel)))

    return {
      channels,
      isSaved: find,
      save: (id, name, kind) => {
        if (find(id) || channels.length >= MAX_CHANNELS) return
        commit([
          ...channels,
          {
            id,
            kind,
            name: sanitizeName(name),
            savedAt: Date.now(),
            // Saving only ever happens from a live connection, so we know it
            // was reachable at this exact moment.
            lastSeenAt: Date.now(),
          },
        ])
      },
      remove: (id) => commit(channels.filter((channel) => channel.id !== id)),
      rename: (id, name) => patch(id, { name: sanitizeName(name) }),
      markSeen: (id) => patch(id, { lastSeenAt: Date.now() }),
    }
  }, [channels, commit])

  return <ChannelsContext.Provider value={store}>{children}</ChannelsContext.Provider>
}
