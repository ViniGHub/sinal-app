import { useMediaStream } from '@/features/media/useMediaStream'
import styles from './PeerTile.module.css'

interface SelfTileProps {
  name: string
  micMuted: boolean
  /** Our screen capture, or null when we are not sharing. */
  screen: MediaStream | null
  onExpand: (target: string) => void
  /** Connected peers whose tab is in front of them. */
  watching: number
  /** Connected peers in total. */
  audience: number
}

/**
 * Your own place in the room.
 *
 * Always rendered, sharing or not: you are a participant like anyone else, and
 * the headcount only reads correctly when the person reading it is in it.
 */
export function SelfTile({ name, micMuted, screen, onExpand, watching, audience }: SelfTileProps) {
  // Muted on purpose: playing our own captured tab audio back would echo.
  const videoRef = useMediaStream<HTMLVideoElement>(screen)
  const everyone = audience > 0 && watching === audience

  return (
    <article className={`${styles.tile} ${styles.selfTile}`}>
      <div className={styles.screen}>
        {screen ? (
          <>
            <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
            <button type="button" className={styles.expand} onClick={() => onExpand('self')}>
              expandir
            </button>
          </>
        ) : (
          <p className={styles.placeholder}>você não está compartilhando</p>
        )}
      </div>

      <div className={styles.meta}>
        <div className={styles.who}>
          <span className={styles.name}>{name || 'você'}</span>
          <span className={styles.id}>você</span>
        </div>

        <div className={styles.status}>
          <span className={styles.state}>
            <span
              className={`${styles.dot} ${micMuted ? '' : styles.dotLive}`}
              aria-hidden="true"
            />
            {micMuted ? 'mudo' : 'ao vivo'}
          </span>

          {screen && audience > 0 && (
            <span
              className={`${styles.attention} ${everyone ? styles.focused : styles.visible}`}
              title="quantos participantes estão com a aba do Sinal à frente"
            >
              {watching}/{audience} na aba
            </span>
          )}
        </div>
      </div>
    </article>
  )
}
