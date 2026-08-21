import { useChannels } from '@/features/channels/useChannels'
import { useMediaStream } from '@/features/media/useMediaStream'
import { shortId } from '@/features/session/protocol'
import { useSession } from '@/features/session/useMesh'
import type { AttentionState, RemotePeer } from './types'
import styles from './PeerTile.module.css'

const STATUS_LABEL: Record<RemotePeer['status'], string> = {
  connecting: 'conectando',
  connected: 'conectado',
  closed: 'desconectado',
}

/**
 * Wording matters here: the browser can prove someone is *not* looking, never
 * that they are. "na aba" says where the tab is, not where their eyes are.
 */
const ATTENTION_LABEL: Record<AttentionState, string> = {
  unknown: '',
  focused: 'na aba',
  visible: 'sem foco',
  hidden: 'em outra aba',
}

const ATTENTION_TITLE: Record<AttentionState, string> = {
  unknown: '',
  focused: 'a aba do Sinal está visível e em foco',
  visible: 'a aba está visível, mas a pessoa está em outra janela',
  hidden: 'a aba está em segundo plano — não está vendo a tela compartilhada',
}

interface PeerTileProps {
  peer: RemotePeer
  onExpand: (target: string) => void
}

export function PeerTile({ peer, onExpand }: PeerTileProps) {
  const session = useSession()
  const { isSaved, save } = useChannels()
  const videoRef = useMediaStream<HTMLVideoElement>(peer.screenStream)
  const audioRef = useMediaStream<HTMLAudioElement>(peer.audioStream)

  const saved = isSaved(peer.id)

  return (
    <article className={styles.tile}>
      <div className={styles.screen}>
        {peer.screenStream ? (
          <>
            {/* Not muted: on Chromium the shared tab's audio rides along. */}
            <video ref={videoRef} autoPlay playsInline className={styles.video} />
            <button type="button" className={styles.expand} onClick={() => onExpand(peer.id)}>
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

        <div className={styles.status}>
          <span className={styles.state}>
            <span
              className={`${styles.dot} ${peer.status === 'connected' ? styles.dotLive : ''}`}
              aria-hidden="true"
            />
            {peer.micMuted ? 'mudo' : STATUS_LABEL[peer.status]}
          </span>

          {peer.attention !== 'unknown' && (
            <span
              className={`${styles.attention} ${styles[peer.attention]}`}
              title={ATTENTION_TITLE[peer.attention]}
            >
              {ATTENTION_LABEL[peer.attention]}
            </span>
          )}
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
