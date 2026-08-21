import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useMesh, useSession } from '@/features/session/useMesh'
import type { ChannelPresence } from './types'

/** How often the panel re-checks while it is open. */
const REFRESH_MS = 30_000

interface PresenceResult {
  presence: Record<string, ChannelPresence>
  refresh: () => void
}

/**
 * Tracks whether each saved host is reachable, but only while `active`.
 *
 * Probing costs a signalling round trip per host, so nothing runs with the
 * panel closed — a bookmark list should not generate background traffic.
 *
 * @param hostIds hosts to watch
 * @param active whether the panel is open
 * @param onSeen called when a host answers, to stamp "last seen"
 */
export function usePresence(
  hostIds: string[],
  active: boolean,
  onSeen: (hostId: string) => void,
): PresenceResult {
  const session = useSession()
  const mesh = useMesh()
  const [presence, setPresence] = useState<Record<string, ChannelPresence>>({})
  const [nonce, setNonce] = useState(0)

  // Held in a ref because the callback is rebuilt on every channels change;
  // depending on it directly would restart the probes it just triggered.
  const onSeenRef = useRef(onSeen)
  useEffect(() => {
    onSeenRef.current = onSeen
  }, [onSeen])

  // A primitive key, so stamping "last seen" (which replaces the channel
  // objects) does not look like a new list and re-probe everything.
  const key = hostIds.join(',')

  useEffect(() => {
    if (!active) return
    const ids = key ? key.split(',') : []
    if (ids.length === 0) return

    let cancelled = false

    setPresence((prev) => {
      const next = { ...prev }
      for (const id of ids) if (next[id] !== 'online') next[id] = 'checking'
      return next
    })

    void Promise.all(
      ids.map(async (id) => {
        const online = await session.probePeer(id)
        if (cancelled) return
        setPresence((prev) => ({ ...prev, [id]: online ? 'online' : 'offline' }))
        if (online) onSeenRef.current(id)
      }),
    )

    return () => {
      cancelled = true
    }
  }, [active, key, nonce, session])

  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNonce((value) => value + 1), REFRESH_MS)
    return () => clearInterval(timer)
  }, [active])

  const connected = useMemo(
    () =>
      new Set(mesh.peers.filter((peer) => peer.status === 'connected').map((peer) => peer.id)),
    [mesh.peers],
  )

  // A live connection is better evidence than any probe, and it updates the
  // moment someone joins rather than waiting for the next sweep.
  const merged = useMemo(() => {
    const result: Record<string, ChannelPresence> = { ...presence }
    for (const id of connected) result[id] = 'online'
    return result
  }, [presence, connected])

  const refresh = useCallback(() => setNonce((value) => value + 1), [])

  return { presence: merged, refresh }
}
