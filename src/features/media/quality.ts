import { safeStorage } from '@/shared/safeStorage'

/**
 * Screen sharing trades two things against each other, and which one matters
 * depends entirely on what is on the screen.
 *
 * Reading code needs sharp, stable pixels and almost no frame rate — text does
 * not move. Watching a video needs the opposite, and would rather lose detail
 * than stutter. One setting cannot serve both, which is why these are presets
 * describing intent rather than a pile of numbers.
 */
export type ScreenQualityId = 'economica' | 'nitida' | 'equilibrada' | 'fluida'

export interface ScreenQuality {
  id: ScreenQualityId
  label: string
  /** What the encoder should protect when it cannot have everything. */
  contentHint: 'text' | 'detail' | 'motion'
  frameRate: number
  /** Ceiling in bits per second, applied to the sender. */
  maxBitrate: number
  /** Divides the transmitted resolution. 1 keeps native, 2 halves each side. */
  scaleDownBy: number
}

export const SCREEN_QUALITIES: readonly ScreenQuality[] = [
  {
    id: 'economica',
    label: 'Econômica — conexão fraca',
    contentHint: 'text',
    frameRate: 8,
    maxBitrate: 600_000,
    // Half resolution is the single biggest saving available, and on a relayed
    // call every byte is billed bandwidth.
    scaleDownBy: 2,
  },
  {
    id: 'nitida',
    label: 'Nítida — texto e código',
    contentHint: 'text',
    frameRate: 8,
    maxBitrate: 1_500_000,
    scaleDownBy: 1,
  },
  {
    id: 'equilibrada',
    label: 'Equilibrada — padrão',
    contentHint: 'detail',
    frameRate: 15,
    maxBitrate: 2_500_000,
    scaleDownBy: 1,
  },
  {
    id: 'fluida',
    label: 'Fluida — vídeo e movimento',
    contentHint: 'motion',
    frameRate: 30,
    maxBitrate: 4_000_000,
    scaleDownBy: 1,
  },
]

export const DEFAULT_SCREEN_QUALITY: ScreenQualityId = 'equilibrada'

export function findScreenQuality(id: string | null | undefined): ScreenQuality {
  return (
    SCREEN_QUALITIES.find((quality) => quality.id === id) ??
    SCREEN_QUALITIES.find((quality) => quality.id === DEFAULT_SCREEN_QUALITY) ??
    // Unreachable while the list above is non-empty; keeps the type honest.
    SCREEN_QUALITIES[0]!
  )
}

const KEY = 'sinal.screenQuality'

export function loadScreenQuality(): ScreenQualityId {
  return findScreenQuality(safeStorage()?.getItem(KEY)).id
}

export function saveScreenQuality(id: ScreenQualityId): void {
  safeStorage()?.setItem(KEY, id)
}
