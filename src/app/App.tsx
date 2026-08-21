import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ChannelsPanel } from '@/features/channels/ChannelsPanel'
import { ChatPanel } from '@/features/chat/ChatPanel'
import { IdentityCard } from '@/features/identity/IdentityCard'
import { clearInvite, readInvite } from '@/features/identity/invite'
import { ControlBar } from '@/features/media/ControlBar'
import { PeerGrid } from '@/features/participants/PeerGrid'
import { SpotlightView } from '@/features/participants/SpotlightView'
import { useFullscreen } from '@/shared/hooks/useFullscreen'
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
  // Peer id of the expanded stream, or 'self' for our own capture.
  const [spotlight, setSpotlight] = useState<string | null>(null)
  const invited = useRef(false)
  const chatOpen = panel === 'chat'

  // Fullscreen targets the whole interface, never the video: the browser hides
  // everything outside the fullscreen element, which is what used to make the
  // chat unreachable while a screen was expanded.
  const pageRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, toggleFullscreen] = useFullscreen(pageRef)

  // An invite link carries a channel or a person in the fragment. Act on it
  // once, as soon as the broker has given us an id of our own to dial from.
  useEffect(() => {
    if (invited.current || !mesh.selfId) return
    const invite = readInvite()
    if (!invite) return
    invited.current = true
    clearInvite()
    if (invite.id === mesh.selfId) return
    // Both link kinds go through the same door; `enter` works out whether the
    // id names a channel to join or a person to ask for one.
    session.enter(invite.id)
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
  const closeSpotlight = useCallback(() => setSpotlight(null), [])

  const spotlighted = useMemo(() => {
    if (!spotlight) return null
    if (spotlight === 'self') {
      return mesh.localScreen ? { stream: mesh.localScreen, label: 'sua tela', muted: true } : null
    }
    const peer = mesh.peers.find((candidate) => candidate.id === spotlight)
    return peer?.screenStream
      ? { stream: peer.screenStream, label: `tela de ${peer.name}`, muted: false }
      : null
  }, [spotlight, mesh.localScreen, mesh.peers])

  // The stream can vanish under us — they stop sharing, or leave entirely.
  // Drop back to the grid rather than holding an empty black overlay.
  useEffect(() => {
    if (spotlight && !spotlighted) setSpotlight(null)
  }, [spotlight, spotlighted])

  const unread = Math.max(0, mesh.messages.length - readCount)
  const connected = mesh.peers.filter((peer) => peer.status === 'connected').length

  return (
    <div className={styles.page} ref={pageRef}>
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
        <PeerGrid
          peers={mesh.peers}
          localScreen={mesh.localScreen}
          onExpand={setSpotlight}
          isAdmin={mesh.isAdmin}
        />

        <footer className={styles.note}>
          a conexão é ponto a ponto (WebRTC); só o endereço inicial passa por um servidor público
          de sinalização.
        </footer>
      </div>

      {spotlighted && (
        <SpotlightView
          stream={spotlighted.stream}
          label={spotlighted.label}
          muted={spotlighted.muted}
          // Escape belongs to whichever panel is open; only when none is does
          // it fall through to closing the spotlight.
          escapeCloses={panel === null}
          onClose={closeSpotlight}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
        />
      )}

      <ChatPanel messages={mesh.messages} open={chatOpen} onClose={closePanel} />
      <ChannelsPanel open={panel === 'channels'} onClose={closePanel} />

      <ControlBar
        micStream={mesh.localMic}
        micMuted={mesh.micMuted}
        sharing={mesh.sharing}
        chatOpen={chatOpen}
        channelsOpen={panel === 'channels'}
        unreadCount={unread}
        inChannel={mesh.channel !== null}
        onToggleChat={toggleChat}
        onToggleChannels={toggleChannels}
      />
    </div>
  )
}
