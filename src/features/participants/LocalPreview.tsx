import { useMediaStream } from '@/features/media/useMediaStream'
import styles from './PeerTile.module.css'

interface LocalPreviewProps {
  stream: MediaStream
  onExpand: (target: string) => void
  /** Connected peers whose tab is in front of them. */
  watching: number
  /** Connected peers in total. */
  audience: number
}

/**
 * Your own screen, so you can tell what the others are seeing.
 * Muted on purpose: playing back shared tab audio locally would echo.
 */
export function LocalPreview({ stream, onExpand, watching, audience }: LocalPreviewProps) {
  const videoRef = useMediaStream<HTMLVideoElement>(stream)

  // Only ever a count of tabs in front of people — not proof anyone is looking.
  const everyone = audience > 0 && watching === audience

  return (
    <article className={styles.tile}>
      <div className={styles.screen}>
        <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
        <button type="button" className={styles.expand} onClick={() => onExpand('self')}>
          expandir
        </button>
      </div>
      <div className={styles.meta}>
        <div className={styles.who}>
          <span className={styles.name}>você</span>
          <span className={styles.id}>compartilhando</span>
        </div>
        <div className={styles.status}>
          <span className={styles.state}>
            <span className={`${styles.dot} ${styles.dotLive}`} aria-hidden="true" />
            ao vivo
          </span>

          {audience > 0 && (
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
