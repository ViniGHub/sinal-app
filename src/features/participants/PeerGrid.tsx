import { useMesh } from '@/features/session/useMesh'
import { PeerTile } from './PeerTile'
import { SelfTile } from './SelfTile'
import styles from './PeerGrid.module.css'

interface PeerGridProps {
  /** Receives a peer id, or 'self' for our own capture. */
  onExpand: (target: string) => void
}

/**
 * Reads the session directly rather than taking six props. Everything it needs
 * is already in the snapshot, and threading it through the page added nothing.
 */
export function PeerGrid({ onExpand }: PeerGridProps) {
  const mesh = useMesh()

  const connected = mesh.peers.filter((peer) => peer.status === 'connected')
  const watching = connected.filter((peer) => peer.attention === 'focused').length

  return (
    <>
      <div className={styles.grid}>
        <SelfTile
          name={mesh.selfName}
          micMuted={mesh.micMuted}
          screen={mesh.localScreen}
          camera={mesh.localCamera}
          onExpand={onExpand}
          watching={watching}
          audience={connected.length}
        />
        {mesh.peers.map((peer) => (
          <PeerTile key={peer.id} peer={peer} onExpand={onExpand} isAdmin={mesh.isAdmin} />
        ))}
      </div>

      {mesh.peers.length === 0 && (
        <p className={styles.empty}>
          você está sozinho aqui — mande seu link para alguém entrar no canal com você.
        </p>
      )}
    </>
  )
}
