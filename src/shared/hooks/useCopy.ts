import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Copies text and reports success for a moment so the button can confirm it.
 *
 * `navigator.clipboard` is unavailable over plain HTTP, which is exactly how
 * this app gets served on a LAN during testing, so there is a fallback path.
 */
export function useCopy(resetAfterMs = 1400): [boolean, (text: string) => void] {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current)
  }, [])

  const copy = useCallback(
    (text: string) => {
      const done = () => {
        setCopied(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), resetAfterMs)
      }

      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done))
      } else {
        fallbackCopy(text, done)
      }
    },
    [resetAfterMs],
  )

  return [copied, copy]
}

function fallbackCopy(text: string, done: () => void): void {
  const field = document.createElement('textarea')
  field.value = text
  field.setAttribute('readonly', '')
  field.style.position = 'fixed'
  field.style.opacity = '0'
  document.body.appendChild(field)
  field.select()
  try {
    document.execCommand('copy')
    done()
  } catch {
    // Nothing else to try; the id stays visible on screen for manual copying.
  } finally {
    field.remove()
  }
}
