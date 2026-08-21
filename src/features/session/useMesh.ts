import { useContext, useSyncExternalStore } from 'react'

import type { MeshSession } from './MeshSession'
import { SessionContext } from './sessionContext'
import type { MeshSnapshot } from './types'

/** The session object, for issuing commands (connect, mute, share, chat). */
export function useSession(): MeshSession {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession precisa estar dentro de <SessionProvider>')
  return session
}

/**
 * Subscribes the calling component to the session's immutable snapshot.
 *
 * `useSyncExternalStore` is the right primitive here: the session is the source
 * of truth and lives outside React, and this keeps concurrent renders from
 * reading a half-updated view of it.
 */
export function useMesh(): MeshSnapshot {
  const session = useSession()
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot)
}
