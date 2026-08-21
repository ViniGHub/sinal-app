import { useRef } from 'react'

import { useChannels } from '@/features/channels/useChannels'
import { useMediaStream } from '@/features/media/useMediaStream'
import { shortId } from '@/features/session/protocol'
import { useSession } from '@/features/session/useMesh'
import type { RemotePeer } from './types'
import styles from './PeerTile.module.css'

const STATUS_LABEL: Record<RemotePeer['status'], string> = {
  connecting: 'conectando',
  connected: 'conectado',
  closed: 'desconectado',
}

export function PeerTile({ peer }: { peer: RemotePeer }) {
  const session = useSession()
  const { isSaved, save } = useChannels()
  const videoRef = useMediaStream<HTMLVideoElement>(peer.screenStream)
  const audioRef = useMediaStream<HTMLAudioElement>(peer.audioStream)
  const frameRef = useRef<HTMLDivElement>(null)

  const saved = isSaved(peer.id)

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

      <div className={styles.rowActions}>
        <button
          type="button"
          className={styles.disconnect}
          onClick={() => session.disconnect(peer.id)}
        >
          desconectar
        </button>

        {/* Saving is only offered from a live connection: a bookmark you never
            reached is a bookmark that will not work. */}
        <button
          type="button"
          className={`${styles.save} ${saved ? styles.saved : ''}`}
          disabled={saved}
          onClick={() => save(peer.id, peer.name, 'peer')}
          title={saved ? 'já está nos seus canais' : 'salvar nos seus canais'}
        >
          {saved ? '★ salvo' : '☆ salvar'}
        </button>
      </div>
    </article>
  )
}
