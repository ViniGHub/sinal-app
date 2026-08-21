import { useMediaStream } from '@/features/media/useMediaStream'
import { ExpandChoice } from './ExpandChoice'
import type { SpotlightTarget } from './types'
import styles from './PeerTile.module.css'

interface SelfTileProps {
  name: string
  micMuted: boolean
  /** Our screen capture, or null when we are not sharing. */
  screen: MediaStream | null
  /** Our camera, or null when it is off. */
  camera: MediaStream | null
  onExpand: (target: SpotlightTarget) => void
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
export function SelfTile({
  name,
  micMuted,
  screen,
  camera,
  onExpand,
  watching,
  audience,
}: SelfTileProps) {
  // Both muted: playing our own capture back would echo, and a self-view has
  // nothing to hear anyway.
  const screenRef = useMediaStream<HTMLVideoElement>(screen)
  const cameraRef = useMediaStream<HTMLVideoElement>(camera)
  const everyone = audience > 0 && watching === audience
  const hasVideo = screen !== null || camera !== null

  return (
    <article className={`${styles.tile} ${styles.selfTile}`}>
      <div className={styles.screen}>
        {screen && <video ref={screenRef} autoPlay playsInline muted className={styles.video} />}

        {camera && (
          <video
            ref={cameraRef}
            autoPlay
            playsInline
            muted
            /* Mirrored, because a self-view that moves the wrong way is
               disorienting — the same convention every video app follows. */
            className={`${screen ? styles.cameraInset : styles.video} ${styles.mirrored}`}
          />
        )}

        {!hasVideo && <p className={styles.placeholder}>câmera e tela desligadas</p>}

        <ExpandChoice
          id="self"
          hasScreen={screen !== null}
          hasCamera={camera !== null}
          onExpand={onExpand}
        />
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
