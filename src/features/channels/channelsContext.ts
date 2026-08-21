import { createContext } from 'react'

import type { SavedChannel } from './types'

export interface ChannelsStore {
  channels: SavedChannel[]
  /** True when this host is already bookmarked. */
  isSaved: (hostId: string) => boolean
  save: (hostId: string, name: string) => void
  remove: (hostId: string) => void
  rename: (hostId: string, name: string) => void
  /** Records that a host answered just now, for the "visto por último" line. */
  markSeen: (hostId: string) => void
}

/**
 * Split from the provider so the component file exports only a component,
 * which is what keeps Fast Refresh working.
 */
export const ChannelsContext = createContext<ChannelsStore | null>(null)
