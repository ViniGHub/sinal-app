/**
 * A ring buffer of what the connection layer did.
 *
 * In a peer-to-peer app the failure is usually on someone else's machine, in a
 * browser you cannot open. Without a record of the handshake there is nothing
 * to reason from but guesses — diagnosing "nobody appears" meant reading the
 * PeerJS source to find out that dialling a vacant id reports nothing at all
 * until the server expires the message, seconds later. This exists so that
 * question is answerable from the page itself.
 *
 * A module-level singleton on purpose: every layer writes to it, and threading
 * a logger through each constructor would cost more than it explains. It also
 * survives the session being torn down and rebuilt, which is exactly when the
 * interesting entries are written.
 */

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogEntry {
  id: number
  /** Milliseconds since the page loaded — sequences read better than clocks. */
  at: number
  level: LogLevel
  /** Which part of the system spoke: 'peer', 'channel', 'media', 'probe'… */
  area: string
  message: string
}

/** Enough to cover a session's handshakes without growing without bound. */
export const MAX_ENTRIES = 400

const ORIGIN = Date.now()

class DiagnosticsLog {
  #entries: readonly LogEntry[] = []
  #listeners = new Set<() => void>()
  #seq = 0

  record(level: LogLevel, area: string, message: string): void {
    this.#seq += 1
    const entry: LogEntry = {
      id: this.#seq,
      at: Date.now() - ORIGIN,
      level,
      area,
      message,
    }
    // Replaced rather than mutated, so `useSyncExternalStore` sees a new
    // reference only when something was actually recorded.
    this.#entries = [...this.#entries, entry].slice(-MAX_ENTRIES)
    for (const listener of this.#listeners) listener()
  }

  info(area: string, message: string): void {
    this.record('info', area, message)
  }

  warn(area: string, message: string): void {
    this.record('warn', area, message)
  }

  error(area: string, message: string): void {
    this.record('error', area, message)
  }

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  getSnapshot = (): readonly LogEntry[] => this.#entries

  clear(): void {
    this.#entries = []
    for (const listener of this.#listeners) listener()
  }

  /** A plain-text dump, for pasting somewhere that can help. */
  toText(): string {
    return this.#entries
      .map((entry) => `${formatAt(entry.at)} ${entry.level.padEnd(5)} ${entry.area}: ${entry.message}`)
      .join('\n')
  }
}

/** "+12.4s" — relative time makes a sequence of events readable at a glance. */
export function formatAt(at: number): string {
  return `+${(at / 1000).toFixed(1)}s`
}

export const diagnostics = new DiagnosticsLog()
