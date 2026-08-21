import { useMediaStream } from '../hooks/useMediaStream'
import styles from './PeerTile.module.css'

/**
 * Your own screen, so you can tell what the others are actually seeing.
 * Muted on purpose: playing back shared tab audio locally would echo.
 */
export function LocalPreview({ stream }: { stream: MediaStream }) {
  const videoRef = useMediaStream<HTMLVideoElement>(stream)

  return (
    <article className={styles.tile}>
      <div className={styles.screen}>
        <video ref={videoRef} autoPlay playsInline muted className={styles.video} />
      </div>
      <div className={styles.meta}>
        <div className={styles.who}>
          <span className={styles.name}>você</span>
          <span className={styles.id}>compartilhando</span>
        </div>
        <div className={styles.state}>
          <span className={`${styles.dot} ${styles.dotLive}`} aria-hidden="true" />
          <span>ao vivo</span>
        </div>
      </div>
    </article>
  )
}
