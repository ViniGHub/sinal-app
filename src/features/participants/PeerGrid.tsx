import { LocalPreview } from './LocalPreview'
import { PeerTile } from './PeerTile'
import type { RemotePeer } from './types'
import styles from './PeerGrid.module.css'

interface PeerGridProps {
  peers: RemotePeer[]
  localScreen: MediaStream | null
}

export function PeerGrid({ peers, localScreen }: PeerGridProps) {
  if (peers.length === 0 && !localScreen) {
    return (
      <p className={styles.empty}>
        ninguém conectado ainda — mande seu link de convite para um amigo, ou cole o ID dele acima.
      </p>
    )
  }

  return (
    <div className={styles.grid}>
      {localScreen && <LocalPreview stream={localScreen} />}
      {peers.map((peer) => (
        <PeerTile key={peer.id} peer={peer} />
      ))}
    </div>
  )
}
