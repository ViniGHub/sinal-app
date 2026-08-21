import { useCallback, useEffect, useRef, useState } from 'react'

import { ChatPanel } from './components/ChatPanel'
import { ConnectForm } from './components/ConnectForm'
import { ControlBar } from './components/ControlBar'
import { IdentityCard } from './components/IdentityCard'
import { PeerGrid } from './components/PeerGrid'
import { StatusLine } from './components/StatusLine'
import { useMesh, useSession } from './hooks/useMesh'
import { clearInvite, readInvite } from './lib/invite'
import styles from './App.module.css'

export function App() {
  const session = useSession()
  const mesh = useMesh()

  const [chatOpen, setChatOpen] = useState(false)
  const [readCount, setReadCount] = useState(0)
  const invited = useRef(false)

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

  const toggleChat = useCallback(() => setChatOpen((open) => !open), [])
  const closeChat = useCallback(() => setChatOpen(false), [])

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

      <ChatPanel messages={mesh.messages} open={chatOpen} onClose={closeChat} />

      <ControlBar
        micStream={mesh.localMic}
        micMuted={mesh.micMuted}
        sharing={mesh.sharing}
        chatOpen={chatOpen}
        unreadCount={unread}
        onToggleChat={toggleChat}
      />
    </div>
  )
}
