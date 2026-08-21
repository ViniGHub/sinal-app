import { useEffect, useRef, type RefObject } from 'react'

/**
 * Binds a `MediaStream` to an <audio>/<video> element.
 *
 * `srcObject` cannot be expressed as a JSX prop, so it has to be assigned
 * imperatively. Doing it here also guarantees the element is detached from the
 * stream on unmount, which is what the previous version leaked.
 */
export function useMediaStream<T extends HTMLMediaElement>(
  stream: MediaStream | null,
): RefObject<T | null> {
  const ref = useRef<T>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    element.srcObject = stream
    if (stream) {
      // Autoplay can still be refused before the first interaction; the user
      // clicking anything later triggers a re-attach through this same effect.
      void element.play().catch(() => {})
    }

    return () => {
      element.srcObject = null
    }
  }, [stream])

  return ref
}
