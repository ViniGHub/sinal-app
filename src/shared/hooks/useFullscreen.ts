import { useCallback, useEffect, useState, type RefObject } from 'react'

/**
 * Drives native fullscreen for an element.
 *
 * Point this at a container that holds the whole interface, never at a single
 * video: the browser renders only the fullscreen element and its descendants,
 * so anything outside it — control bar, side panels — stops being reachable.
 */
export function useFullscreen(ref: RefObject<HTMLElement | null>): [boolean, () => void] {
  const [active, setActive] = useState(false)

  useEffect(() => {
    // The user can leave fullscreen with Escape or F11 without touching our
    // button, so the flag has to follow the document rather than our clicks.
    const sync = () => setActive(document.fullscreenElement !== null)
    document.addEventListener('fullscreenchange', sync)
    sync()
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])

  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {})
      return
    }
    void ref.current?.requestFullscreen?.().catch(() => {})
  }, [ref])

  return [active, toggle]
}
