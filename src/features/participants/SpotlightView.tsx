import { useEffect } from 'react'

import { useMediaStream } from '@/features/media/useMediaStream'
import styles from './SpotlightView.module.css'

interface SpotlightViewProps {
  stream: MediaStream
  label: string
  /** True for our own capture, which must stay silent to avoid echo. */
  muted: boolean
  /** Whether Escape should close this, or belongs to an open panel instead. */
  escapeCloses: boolean
  onClose: () => void
  onToggleFullscreen: () => void
  isFullscreen: boolean
}

/**
 * Fills the page with one stream.
 *
 * Deliberately an in-page overlay rather than `requestFullscreen` on the video:
 * a fullscreen element hides everything outside it, which is what previously
 * made the chat unreachable while a screen was expanded. Here the control bar
 * and side panels simply layer on top.
 */
export function SpotlightView({
  stream,
  label,
  muted,
  escapeCloses,
  onClose,
  onToggleFullscreen,
  isFullscreen,
}: SpotlightViewProps) {
  const videoRef = useMediaStream<HTMLVideoElement>(stream)

  useEffect(() => {
    if (!escapeCloses) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [escapeCloses, onClose])

  return (
    <div className={styles.spotlight}>
      <video ref={videoRef} autoPlay playsInline muted={muted} className={styles.video} />

      <div className={styles.bar}>
        <span className={styles.label}>{label}</span>
        <div className={styles.actions}>
          <button type="button" className={styles.action} onClick={onToggleFullscreen}>
            {isFullscreen ? 'sair da tela cheia' : 'tela cheia'}
          </button>
          <button type="button" className={styles.action} onClick={onClose}>
            reduzir
          </button>
        </div>
      </div>
    </div>
  )
}
