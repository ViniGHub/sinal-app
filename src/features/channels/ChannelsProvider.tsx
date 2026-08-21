import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { sanitizeName } from '@/features/session/protocol'
import { ChannelsContext, type ChannelsStore } from './channelsContext'
import { MAX_CHANNELS, loadChannels, saveChannels } from './storage'
import type { SavedChannel } from './types'

/**
 * Holds the bookmarked hosts and writes every change straight through to
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
    const find = (hostId: string) => channels.some((channel) => channel.hostId === hostId)

    const patch = (hostId: string, changes: Partial<SavedChannel>) =>
      commit(
        channels.map((channel) =>
          channel.hostId === hostId ? { ...channel, ...changes } : channel,
        ),
      )

    return {
      channels,
      isSaved: find,
      save: (hostId, name) => {
        if (find(hostId) || channels.length >= MAX_CHANNELS) return
        const entry: SavedChannel = {
          hostId,
          name: sanitizeName(name),
          savedAt: Date.now(),
          // Saving only ever happens from a live connection, so we know the
          // host was reachable at this exact moment.
          lastSeenAt: Date.now(),
        }
        commit([...channels, entry])
      },
      remove: (hostId) => commit(channels.filter((channel) => channel.hostId !== hostId)),
      rename: (hostId, name) => patch(hostId, { name: sanitizeName(name) }),
      markSeen: (hostId) => patch(hostId, { lastSeenAt: Date.now() }),
    }
  }, [channels, commit])

  return <ChannelsContext.Provider value={store}>{children}</ChannelsContext.Provider>
}
