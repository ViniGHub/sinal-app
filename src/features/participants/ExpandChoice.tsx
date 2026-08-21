import type { SpotlightTarget } from './types'
import styles from './PeerTile.module.css'

interface ExpandChoiceProps {
  /** Peer id, or 'self' for our own capture. */
  id: string
  hasScreen: boolean
  hasCamera: boolean
  onExpand: (target: SpotlightTarget) => void
}

/**
 * The expand control on a tile.
 *
 * With one video there is nothing to choose, so it stays a single button. With
 * both, the choice is offered up front rather than expanding one and making
 * the viewer hunt for a way to switch.
 */
export function ExpandChoice({ id, hasScreen, hasCamera, onExpand }: ExpandChoiceProps) {
  if (!hasScreen && !hasCamera) return null

  if (hasScreen !== hasCamera) {
    return (
      <div className={styles.expandRow}>
        <button
          type="button"
          className={styles.expand}
          onClick={() => onExpand({ id, source: hasScreen ? 'screen' : 'camera' })}
        >
          expandir
        </button>
      </div>
    )
  }

  return (
    <div className={styles.expandRow}>
      <button
        type="button"
        className={styles.expand}
        onClick={() => onExpand({ id, source: 'both' })}
        title="tela com a câmera por cima"
      >
        ambos
      </button>
      <button
        type="button"
        className={styles.expand}
        onClick={() => onExpand({ id, source: 'screen' })}
      >
        tela
      </button>
      <button
        type="button"
        className={styles.expand}
        onClick={() => onExpand({ id, source: 'camera' })}
      >
        câmera
      </button>
    </div>
  )
}
