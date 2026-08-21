import { createContext } from 'react'

import type { MeshSession } from './MeshSession'

/**
 * Lives in its own module so the provider component and the hooks that read it
 * can each stay in a file that exports only one kind of thing — which is what
 * keeps React Fast Refresh working during development.
 */
export const SessionContext = createContext<MeshSession | null>(null)
