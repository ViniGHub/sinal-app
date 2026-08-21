import type { AttentionState } from '@/features/participants/types'

/**
 * What the browser can tell us about whether the user is at this tab.
 *
 * Two independent signals, because they answer different questions:
 *
 * - `visibilityState` says whether the tab is being rendered at all. Hidden is
 *   conclusive: a backgrounded or minimised tab is definitely not being seen.
 * - `hasFocus` says whether this window has keyboard focus. A visible but
 *   unfocused tab is genuinely ambiguous — it may be sitting on a second
 *   monitor in plain view, or buried behind another window.
 *
 * They are reported separately rather than collapsed into a boolean, so the UI
 * can be honest about that ambiguity instead of inventing a verdict.
 */
export function readAttention(): Exclude<AttentionState, 'unknown'> {
  if (typeof document === 'undefined') return 'focused'
  if (document.visibilityState === 'hidden') return 'hidden'
  return document.hasFocus() ? 'focused' : 'visible'
}

/**
 * Calls back whenever the state changes, and returns an unsubscribe function.
 * Repeat values are swallowed: switching between two other apps fires blur
 * repeatedly, and each one would otherwise become a broadcast to every peer.
 */
export function watchAttention(onChange: (state: AttentionState) => void): () => void {
  let last = readAttention()

  const check = () => {
    const next = readAttention()
    if (next === last) return
    last = next
    onChange(next)
  }

  document.addEventListener('visibilitychange', check)
  window.addEventListener('focus', check)
  window.addEventListener('blur', check)
  // Restoring from the back/forward cache does not fire the others.
  window.addEventListener('pageshow', check)

  return () => {
    document.removeEventListener('visibilitychange', check)
    window.removeEventListener('focus', check)
    window.removeEventListener('blur', check)
    window.removeEventListener('pageshow', check)
  }
}
