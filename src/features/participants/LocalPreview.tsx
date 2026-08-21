import { useMediaStream } from '@/features/media/useMediaStream'
import styles from './PeerTile.module.css'

interface LocalPreviewProps {
  stream: MediaStream
  onExpand: (target: string) => void
}

/**
 * Your own screen, so you can tell what the others are seeing.
 * Muted on purpose: playing back shared tab audio locally would echo.
 */
export function LocalPreview({ stream, onExpand }: LocalPreviewProps) {
  const videoRef = useMediaStream<HTMLVideoElement>(stream)

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
        <div className={styles.state}>
          <span className={`${styles.dot} ${styles.dotLive}`} aria-hidden="true" />
          <span>ao vivo</span>
        </div>
      </div>
    </article>
  )
}
