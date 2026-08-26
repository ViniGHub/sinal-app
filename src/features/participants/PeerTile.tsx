import { useMediaStream } from '@/features/media/useMediaStream'
import { shortId } from '@/features/session/protocol'
import { useSession } from '@/features/session/useMesh'
import { ExpandChoice } from './ExpandChoice'
import type { AttentionState, RemotePeer, SpotlightTarget } from './types'
import { usePictureInPicture } from './usePictureInPicture'
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
  onExpand: (target: SpotlightTarget) => void
  /** Whether the local user may remove people from the channel. */
  isAdmin: boolean
}

export function PeerTile({ peer, onExpand, isAdmin }: PeerTileProps) {
  const session = useSession()
  // The screen takes the tile when present and the camera becomes an inset;
  // with only a camera, it takes the tile itself.
  const screenRef = useMediaStream<HTMLVideoElement>(peer.screenStream)
  const cameraRef = useMediaStream<HTMLVideoElement>(peer.cameraStream)
  const audioRef = useMediaStream<HTMLAudioElement>(peer.audioStream)
  const pip = usePictureInPicture(cameraRef)

  const hasVideo = peer.screenStream !== null || peer.cameraStream !== null

  return (
    <article className={styles.tile}>
      <div className={styles.screen}>
        {peer.screenStream && (
          /* Not muted: on Chromium the shared tab's audio rides along. */
          <video ref={screenRef} autoPlay playsInline className={styles.video} />
        )}

        {peer.cameraStream && (
          <video
            ref={cameraRef}
            autoPlay
            playsInline
            muted
            className={peer.screenStream ? styles.cameraInset : styles.video}
          />
        )}

        {!hasVideo && <p className={styles.placeholder}>sem vídeo</p>}

        {/* Only for the camera: a floating window is for keeping a face in
            sight while working elsewhere, which is not what a shared screen
            is for — and it is the camera element the API is attached to. */}
        {peer.cameraStream && pip.supported && (
          <button
            type="button"
            className={`${styles.pip} ${pip.active ? styles.pipOn : ''}`}
            onClick={pip.toggle}
            aria-pressed={pip.active}
            title={
              pip.active
                ? 'fechar a janela flutuante'
                : 'ver esta câmera numa janela que fica por cima de outras abas'
            }
          >
            {pip.active ? '⧉ flutuando' : '⧉ destacar'}
          </button>
        )}

        <ExpandChoice
          id={peer.id}
          hasScreen={peer.screenStream !== null}
          hasCamera={peer.cameraStream !== null}
          onExpand={onExpand}
        />
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

      {/* Removing someone is an admin action; everyone else leaves via the
          control bar. No "save" here either: bookmarks point at channels now,
          so saving lives with the channel in the side panel. */}
      {isAdmin && (
        <div className={styles.rowActions}>
          <button
            type="button"
            className={styles.disconnect}
            onClick={() => session.kick(peer.id)}
          >
            remover do canal
          </button>
        </div>
      )}
    </article>
  )
}
