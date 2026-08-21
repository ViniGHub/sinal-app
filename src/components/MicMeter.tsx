import styles from './MicMeter.module.css'

const BARS = 5

/**
 * The live loudness bars from the original design, driven by a normalised
 * level instead of reading the analyser directly.
 */
export function MicMeter({ level, muted }: { level: number; muted: boolean }) {
  return (
    <span className={`${styles.meter} ${muted ? styles.muted : ''}`} aria-hidden="true">
      {Array.from({ length: BARS }, (_, index) => {
        const threshold = ((index + 1) / BARS) * 0.6
        const height = level >= threshold ? 4 + level * 14 : 3
        return <i key={index} style={{ height: `${height}px` }} />
      })}
    </span>
  )
}
