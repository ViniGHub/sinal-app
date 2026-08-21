import { useContext } from 'react'

import { ChannelsContext, type ChannelsStore } from './channelsContext'

export function useChannels(): ChannelsStore {
  const store = useContext(ChannelsContext)
  if (!store) throw new Error('useChannels precisa estar dentro de <ChannelsProvider>')
  return store
}
