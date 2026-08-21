/**
 * `localStorage` throws in private-browsing modes and inside sandboxed frames.
 * Everything this app persists is a convenience, never a requirement, so every
 * access degrades to in-memory behaviour instead of breaking the page.
 */
export function safeStorage(): Storage | null {
  try {
    const probe = '__sinal__'
    window.localStorage.setItem(probe, probe)
    window.localStorage.removeItem(probe)
    return window.localStorage
  } catch {
    return null
  }
}

/** Reads and parses a JSON key, returning null on absent or corrupt data. */
export function readJson(key: string): unknown {
  const raw = safeStorage()?.getItem(key)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    safeStorage()?.setItem(key, JSON.stringify(value))
  } catch {
    // Quota exceeded, most likely. Losing the write is acceptable here.
  }
}
