import { useCallback, useEffect, useRef, useState } from 'react'

import { ChannelsPanel } from '@/features/channels/ChannelsPanel'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { IdentityCard } from '@/features/identity/IdentityCard'
import { clearInvite, readInvite } from '@/features/identity/invite'
import { ControlBar } from '@/features/media/ControlBar'
import { PeerGrid } from '@/features/participants/PeerGrid'
import { ConnectForm } from '@/features/session/ConnectForm'
import { StatusLine } from '@/features/session/StatusLine'
import { useMesh, useSession } from '@/features/session/useMesh'
import styles from './App.module.css'

export function App() {
  const session = useSession()
  const mesh = useMesh()

  // One slot rather than a boolean per panel: they occupy the same edge of the
  // screen, so opening one has to close the other.
  const [panel, setPanel] = useState<'chat' | 'channels' | null>(null)
  const [readCount, setReadCount] = useState(0)
  const invited = useRef(false)
  const chatOpen = panel === 'chat'

  // An invite link carries the host's id in the fragment. Dial it once, as
  // soon as the broker has given us an id of our own to dial from.
  useEffect(() => {
    if (invited.current || !mesh.selfId) return
    const target = readInvite()
    if (!target) return
    invited.current = true
    clearInvite()
    if (target !== mesh.selfId) session.connectTo(target)
  }, [mesh.selfId, session])

  useEffect(() => {
    if (chatOpen) setReadCount(mesh.messages.length)
  }, [chatOpen, mesh.messages.length])

  const toggleChat = useCallback(
    () => setPanel((current) => (current === 'chat' ? null : 'chat')),
    [],
  )
  const toggleChannels = useCallback(
    () => setPanel((current) => (current === 'channels' ? null : 'channels')),
    [],
  )
  const closePanel = useCallback(() => setPanel(null), [])

  const unread = Math.max(0, mesh.messages.length - readCount)
  const connected = mesh.peers.filter((peer) => peer.status === 'connected').length

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div className={styles.brand}>
            <span className={styles.dot} aria-hidden="true" />
            <div>
              <h1>Sinal</h1>
              <p className={styles.tagline}>voz + tela, direto entre vocês — sem servidor no meio</p>
            </div>
          </div>
          <IdentityCard selfId={mesh.selfId} selfName={mesh.selfName} />
        </header>

        <StatusLine status={mesh.status} />
        <ConnectForm disabled={!mesh.selfId} />

        <h2 className={styles.sectionLabel}>
          participantes {connected > 0 && <span className={styles.count}>{connected}</span>}
        </h2>
        <PeerGrid peers={mesh.peers} localScreen={mesh.localScreen} />

        <footer className={styles.note}>
          a conexão é ponto a ponto (WebRTC); só o endereço inicial passa por um servidor público
          de sinalização.
        </footer>
      </div>

      <ChatPanel messages={mesh.messages} open={chatOpen} onClose={closePanel} />
      <ChannelsPanel open={panel === 'channels'} onClose={closePanel} />

      <ControlBar
        micStream={mesh.localMic}
        micMuted={mesh.micMuted}
        sharing={mesh.sharing}
        chatOpen={chatOpen}
        channelsOpen={panel === 'channels'}
        unreadCount={unread}
        onToggleChat={toggleChat}
        onToggleChannels={toggleChannels}
      />
    </div>
  )
}
