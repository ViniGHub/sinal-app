import { useEffect, useRef, type RefObject } from 'react'

/**
 * Publishes the control bar's real height as `--control-bar-height`.
 *
 * Everything that has to stay clear of the bar reads that variable: the page's
 * bottom padding and the side panels' lower edge. It used to be a constant,
 * which held only on a wide screen — on a phone the bar wraps onto three or
 * four rows, and the footer and panels were laid out as if it were one. The
 * diagnostics link ended up underneath it, and the panel covered the very
 * button used to open it.
 *
 * Measured rather than guessed, because the height depends on how the labels
 * wrap, which depends on the font, the language and the viewport.
 */
export function useControlBarHeight(): RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const bar = ref.current
    if (!bar) return

    const apply = () => {
      document.documentElement.style.setProperty(
        '--control-bar-height',
        `${Math.ceil(bar.getBoundingClientRect().height)}px`,
      )
    }

    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(bar)

    return () => {
      observer.disconnect()
      // Back to the stylesheet's value, so nothing stays pinned to a height
      // measured from a bar that no longer exists.
      document.documentElement.style.removeProperty('--control-bar-height')
    }
  }, [])

  return ref
}
