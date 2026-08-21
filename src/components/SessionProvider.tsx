import { useEffect, useState, type ReactNode } from 'react'

import { SessionContext } from '../hooks/sessionContext'
import { MeshSession } from '../lib/mesh'

interface SessionProviderProps {
  children: ReactNode
  /** Rendered while the microphone prompt and broker handshake are pending. */
  fallback: ReactNode
}

/**
 * Owns the single `MeshSession` for the app.
 *
 * The session is created inside the effect rather than during render so that
 * React's development-mode double mount tears the first instance down and
 * builds a fresh one, instead of leaving a permanently destroyed session.
 */
export function SessionProvider({ children, fallback }: SessionProviderProps) {
  const [session, setSession] = useState<MeshSession | null>(null)

  useEffect(() => {
    const instance = new MeshSession()
    setSession(instance)
    void instance.start()
    return () => {
      instance.destroy()
      setSession(null)
    }
  }, [])

  if (!session) return <>{fallback}</>
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>
}
