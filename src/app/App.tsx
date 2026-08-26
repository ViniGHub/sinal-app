import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { ChannelsPanel } from '@/features/channels/ChannelsPanel'
import { ChatPanel } from '@/features/chat/ChatPanel'
import {
  loadNotificationsEnabled,
  notificationState,
  requestNotifications,
  saveNotificationsEnabled,
} from '@/features/chat/notifications'
import { useChatNotifications } from '@/features/chat/useChatNotifications'
import { IdentityCard } from '@/features/identity/IdentityCard'
import { clearInvite, readInvite } from '@/features/identity/invite'
import { ControlBar } from '@/features/media/ControlBar'
import { PeerGrid } from '@/features/participants/PeerGrid'
import { SpotlightView } from '@/features/participants/SpotlightView'
import type { SpotlightTarget } from '@/features/participants/types'
import { useFullscreen } from '@/shared/hooks/useFullscreen'
import { ConnectForm } from '@/features/session/ConnectForm'
import { DiagnosticsPanel } from '@/features/session/DiagnosticsPanel'
import { StatusLine } from '@/features/session/StatusLine'
import { useMesh, useSession } from '@/features/session/useMesh'
import styles from './App.module.css'

export function App() {
  const session = useSession()
  const mesh = useMesh()

  // One slot rather than a boolean per panel: they occupy the same edge of the
  // screen, so opening one has to close the other.
  const [panel, setPanel] = useState<'chat' | 'channels' | 'diagnostics' | null>(null)
  const [readCount, setReadCount] = useState(0)
  const [notificationsEnabled, setNotificationsEnabled] = useState(loadNotificationsEnabled)
  // Kept in state, not read at render: granting happens asynchronously, and a
  // label still reading "bloqueadas" after the person just allowed it would
  // look like the button did nothing.
  const [notificationPermission, setNotificationPermission] = useState(notificationState)

  // Lives here rather than in the chat panel: the point is to reach someone
  // who is not looking, and the panel is usually closed when that is true.
  useChatNotifications(mesh.messages, notificationsEnabled)

  const toggleNotifications = useCallback(() => {
    const next = !notificationsEnabled
    setNotificationsEnabled(next)
    saveNotificationsEnabled(next)

    // Permission is requested here because this click is the user gesture the
    // browser requires; asking on load is denied by default.
    if (next && notificationPermission === 'default') {
      void requestNotifications().then(setNotificationPermission)
    }
  }, [notificationsEnabled, notificationPermission])
  // Which participant's video fills the page, and which of their sources.
  const [spotlight, setSpotlight] = useState<SpotlightTarget | null>(null)
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

  /**
   * Resolves the chosen target into the streams to show.
   *
   * A source can disappear while it is expanded — they stop sharing, or turn
   * the camera off. Rather than closing outright, it falls back to whatever is
   * still live, and only closes when nothing is.
   */
  const spotlighted = useMemo(() => {
    if (!spotlight) return null

    const own = spotlight.id === 'self'
    const peer = own ? null : mesh.peers.find((candidate) => candidate.id === spotlight.id)
    // They left the room while we were watching them.
    if (!own && !peer) return null

    const screen = peer ? peer.screenStream : mesh.localScreen
    const camera = peer ? peer.cameraStream : mesh.localCamera
    if (!screen && !camera) return null

    const who = peer ? peer.name : 'você'
    const wantsScreen = spotlight.source !== 'camera'
    const wantsCamera = spotlight.source !== 'screen'

    const showScreen = wantsScreen ? screen : null
    const showCamera = wantsCamera ? camera : null
    if (!showScreen && !showCamera) {
      // The requested source went away but the other one is live; show that
      // instead of dropping the viewer back to the grid.
      return {
        screen,
        camera,
        label: `${screen ? 'tela' : 'câmera'} de ${who}`,
        muted: own,
        mirrored: own,
      }
    }

    const label = showScreen && showCamera ? `${who}` : showScreen ? `tela de ${who}` : `câmera de ${who}`
    return { screen: showScreen, camera: showCamera, label, muted: own, mirrored: own }
  }, [spotlight, mesh.localScreen, mesh.localCamera, mesh.peers])

  // The stream can vanish under us — they stop sharing, or leave entirely.
  // Drop back to the grid rather than holding an empty black overlay.
  useEffect(() => {
    if (spotlight && !spotlighted) setSpotlight(null)
  }, [spotlight, spotlighted])

  const unread = Math.max(0, mesh.messages.length - readCount)
  // You are one of the participants, so the headcount includes you. Otherwise
  // a room of three reads as "2" to everyone standing in it.
  const headcount = mesh.peers.filter((peer) => peer.status === 'connected').length + 1

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
          <IdentityCard
            selfName={mesh.selfName}
            channel={mesh.channel}
            ready={mesh.selfId !== null}
          />
        </header>

        <StatusLine status={mesh.status} />
        <ConnectForm disabled={!mesh.selfId} />

        <h2 className={styles.sectionLabel}>
          participantes{' '}
          <span className={styles.count} data-testid="headcount">
            {headcount}
          </span>
        </h2>
        <PeerGrid onExpand={setSpotlight} />

        <footer className={styles.note}>
          a conexão é ponto a ponto (WebRTC); só o endereço inicial passa por um servidor público
          de sinalização.
          {' · '}
          <button
            type="button"
            className={styles.link}
            onClick={() => setPanel((current) => (current === 'diagnostics' ? null : 'diagnostics'))}
          >
            diagnóstico
          </button>
        </footer>
      </div>

      {spotlighted && (
        <SpotlightView
          screen={spotlighted.screen}
          camera={spotlighted.camera}
          label={spotlighted.label}
          muted={spotlighted.muted}
          mirrored={spotlighted.mirrored}
          // Escape belongs to whichever panel is open; only when none is does
          // it fall through to closing the spotlight.
          escapeCloses={panel === null}
          onClose={closeSpotlight}
          onToggleFullscreen={toggleFullscreen}
          isFullscreen={isFullscreen}
        />
      )}

      <ChatPanel
        messages={mesh.messages}
        open={chatOpen}
        onClose={closePanel}
        notificationsEnabled={notificationsEnabled}
        notificationPermission={notificationPermission}
        onToggleNotifications={toggleNotifications}
      />
      <ChannelsPanel open={panel === 'channels'} onClose={closePanel} />
      <DiagnosticsPanel open={panel === 'diagnostics'} onClose={closePanel} />

      <ControlBar
        micStream={mesh.localMic}
        micMuted={mesh.micMuted}
        sharing={mesh.sharing}
        cameraOn={mesh.localCamera !== null}
        micDeviceId={mesh.micDeviceId}
        cameraDeviceId={mesh.cameraDeviceId}
        screenQuality={mesh.screenQuality}
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
