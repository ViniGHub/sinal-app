import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { useMediaStream } from '@/features/media/useMediaStream'
import type { CameraCorner } from './types'
import { nearestCorner, useCameraCorner } from './useCameraCorner'
import styles from './SpotlightView.module.css'

interface SpotlightViewProps {
  /** Fills the page. Null when only a camera is being shown. */
  screen: MediaStream | null
  /** Floats over the screen, or fills the page when there is no screen. */
  camera: MediaStream | null
  label: string
  /** True for our own capture, which must stay silent to avoid echo. */
  muted: boolean
  /** Our own camera is mirrored, as in every video app. */
  mirrored: boolean
  /** Whether Escape should close this, or belongs to an open panel instead. */
  escapeCloses: boolean
  onClose: () => void
  onToggleFullscreen: () => void
  isFullscreen: boolean
}

/** Arrow keys nudge the inset to the neighbouring corner. */
const ARROW_MOVES: Record<string, Partial<Record<CameraCorner, CameraCorner>>> = {
  ArrowLeft: { topRight: 'topLeft', bottomRight: 'bottomLeft' },
  ArrowRight: { topLeft: 'topRight', bottomLeft: 'bottomRight' },
  ArrowUp: { bottomLeft: 'topLeft', bottomRight: 'topRight' },
  ArrowDown: { topLeft: 'bottomLeft', topRight: 'bottomRight' },
}

/**
 * Fills the page with one participant's video.
 *
 * Deliberately an in-page overlay rather than `requestFullscreen` on the video:
 * a fullscreen element hides everything outside it, which is what would make
 * the chat unreachable while a screen is expanded. Here the control bar and
 * side panels simply layer on top.
 */
export function SpotlightView({
  screen,
  camera,
  label,
  muted,
  mirrored,
  escapeCloses,
  onClose,
  onToggleFullscreen,
  isFullscreen,
}: SpotlightViewProps) {
  const screenRef = useMediaStream<HTMLVideoElement>(screen)
  const cameraRef = useMediaStream<HTMLVideoElement>(camera)
  const stageRef = useRef<HTMLDivElement>(null)

  const [corner, setCorner] = useCameraCorner()
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null)
  const grab = useRef<{ dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (!escapeCloses) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [escapeCloses, onClose])

  // The camera only floats when there is a screen underneath it; on its own it
  // takes the stage.
  const floating = screen !== null && camera !== null

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    grab.current = { dx: event.clientX - rect.left, dy: event.clientY - rect.top }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDrag({ x: 0, y: 0 })
  }

  const onDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!grab.current) return
    setDrag((current) =>
      current ? { x: event.movementX + current.x, y: event.movementY + current.y } : current,
    )
  }

  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!grab.current) return
    grab.current = null

    const stage = stageRef.current
    const rect = event.currentTarget.getBoundingClientRect()
    if (stage) {
      const bounds = stage.getBoundingClientRect()
      // Snap by where the inset's centre landed, so a short nudge in the right
      // direction is enough and the inset always ends up fully on screen.
      const centreX = (rect.left + rect.width / 2 - bounds.left) / bounds.width
      const centreY = (rect.top + rect.height / 2 - bounds.top) / bounds.height
      setCorner(nearestCorner(centreX, centreY))
    }
    setDrag(null)
  }

  const onInsetKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const next = ARROW_MOVES[event.key]?.[corner]
    if (!next) return
    event.preventDefault()
    setCorner(next)
  }

  return (
    <div className={styles.spotlight}>
      <div className={styles.stage} ref={stageRef}>
        {screen && (
          <video ref={screenRef} autoPlay playsInline muted={muted} className={styles.video} />
        )}

        {camera && (
          <div
            className={[
              floating ? styles.inset : styles.fill,
              floating ? styles[corner] : '',
              drag ? styles.dragging : '',
            ]
              .filter(Boolean)
              .join(' ')}
            style={drag ? { transform: `translate(${drag.x}px, ${drag.y}px)` } : undefined}
            onPointerDown={floating ? startDrag : undefined}
            onPointerMove={floating ? onDrag : undefined}
            onPointerUp={floating ? endDrag : undefined}
            onPointerCancel={floating ? endDrag : undefined}
            onKeyDown={floating ? onInsetKeyDown : undefined}
            role={floating ? 'button' : undefined}
            tabIndex={floating ? 0 : undefined}
            aria-label={floating ? 'Câmera — arraste ou use as setas para mover' : undefined}
          >
            <video
              ref={cameraRef}
              autoPlay
              playsInline
              muted
              className={`${styles.video} ${mirrored ? styles.mirrored : ''}`}
            />
          </div>
        )}
      </div>

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
