import { LocalPreview } from './LocalPreview'
import { PeerTile } from './PeerTile'
import type { RemotePeer } from './types'
import styles from './PeerGrid.module.css'

interface PeerGridProps {
  peers: RemotePeer[]
  localScreen: MediaStream | null
  /** Receives a peer id, or 'self' for our own capture. */
  onExpand: (target: string) => void
}

export function PeerGrid({ peers, localScreen, onExpand }: PeerGridProps) {
  const connected = peers.filter((peer) => peer.status === 'connected')
  const watching = connected.filter((peer) => peer.attention === 'focused').length

  if (peers.length === 0 && !localScreen) {
    return (
      <p className={styles.empty}>
        ninguém conectado ainda — mande seu link de convite para um amigo, ou cole o ID dele acima.
      </p>
    )
  }

  return (
    <div className={styles.grid}>
      {localScreen && (
        <LocalPreview
          stream={localScreen}
          onExpand={onExpand}
          watching={watching}
          audience={connected.length}
        />
      )}
      {peers.map((peer) => (
        <PeerTile key={peer.id} peer={peer} onExpand={onExpand} />
      ))}
    </div>
  )
}
