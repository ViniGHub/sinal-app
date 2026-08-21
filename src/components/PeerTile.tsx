import { useRef } from 'react'

import { useMediaStream } from '../hooks/useMediaStream'
import { useSession } from '../hooks/useMesh'
import { shortId } from '../lib/protocol'
import type { RemotePeer } from '../lib/types'
import styles from './PeerTile.module.css'

const STATUS_LABEL: Record<RemotePeer['status'], string> = {
  connecting: 'conectando',
  connected: 'conectado',
  closed: 'desconectado',
}

export function PeerTile({ peer }: { peer: RemotePeer }) {
  const session = useSession()
  const videoRef = useMediaStream<HTMLVideoElement>(peer.screenStream)
  const audioRef = useMediaStream<HTMLAudioElement>(peer.audioStream)
  const frameRef = useRef<HTMLDivElement>(null)

  const expand = () => {
    void frameRef.current?.requestFullscreen?.().catch(() => {})
  }

  return (
    <article className={styles.tile}>
      <div className={styles.screen} ref={frameRef}>
        {peer.screenStream ? (
          <>
            {/* Not muted: on Chromium the shared tab's audio rides along. */}
            <video ref={videoRef} autoPlay playsInline className={styles.video} />
            <button type="button" className={styles.expand} onClick={expand}>
              expandir
            </button>
          </>
        ) : (
          <p className={styles.placeholder}>sem tela compartilhada</p>
        )}
      </div>

      {/* The voice channel. Hidden, but it is what actually makes the call. */}
      <audio ref={audioRef} autoPlay />

      <div className={styles.meta}>
        <div className={styles.who}>
          <span className={styles.name}>{peer.name}</span>
          <span className={styles.id}>{shortId(peer.id)}</span>
        </div>

        <div className={styles.state}>
          <span
            className={`${styles.dot} ${peer.status === 'connected' ? styles.dotLive : ''}`}
            aria-hidden="true"
          />
          <span>{peer.micMuted ? 'mudo' : STATUS_LABEL[peer.status]}</span>
        </div>
      </div>

      <button
        type="button"
        className={styles.disconnect}
        onClick={() => session.disconnect(peer.id)}
      >
        desconectar
      </button>
    </article>
  )
}
