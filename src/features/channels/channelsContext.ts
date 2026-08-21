import { createContext } from 'react'

import type { ChannelKind, SavedChannel } from './types'

export interface ChannelsStore {
  channels: SavedChannel[]
  /** True when this id is already bookmarked. */
  isSaved: (id: string) => boolean
  save: (id: string, name: string, kind: ChannelKind) => void
  remove: (id: string) => void
  rename: (id: string, name: string) => void
  /** Records that an id answered just now, for the "visto por último" line. */
  markSeen: (id: string) => void
}

/**
 * Split from the provider so the component file exports only a component,
 * which is what keeps Fast Refresh working.
 */
export const ChannelsContext = createContext<ChannelsStore | null>(null)
