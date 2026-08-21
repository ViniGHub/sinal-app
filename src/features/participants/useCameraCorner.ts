import { useCallback, useState } from 'react'

import { readJson, writeJson } from '@/shared/safeStorage'
import type { CameraCorner } from './types'

const KEY = 'sinal.cameraCorner'

const CORNERS: readonly CameraCorner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

function isCorner(value: unknown): value is CameraCorner {
  return CORNERS.includes(value as CameraCorner)
}

/**
 * Where the floating camera sits, remembered between sessions.
 *
 * Corners rather than free coordinates: a corner is still valid at any window
 * size, so the inset can never end up half off-screen after a resize, and the
 * stored value can never place it somewhere unreachable.
 */
export function useCameraCorner(): [CameraCorner, (corner: CameraCorner) => void] {
  const [corner, setCorner] = useState<CameraCorner>(() => {
    const saved = readJson(KEY)
    return isCorner(saved) ? saved : 'bottomLeft'
  })

  const move = useCallback((next: CameraCorner) => {
    setCorner(next)
    writeJson(KEY, next)
  }, [])

  return [corner, move]
}

/** The corner nearest a point, given as fractions of the container. */
export function nearestCorner(xFraction: number, yFraction: number): CameraCorner {
  const top = yFraction < 0.5
  const left = xFraction < 0.5
  if (top) return left ? 'topLeft' : 'topRight'
  return left ? 'bottomLeft' : 'bottomRight'
}
