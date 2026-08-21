import type { SessionStatus } from './types'
import styles from './StatusLine.module.css'

/**
 * Announced politely to assistive technology: connection changes matter, but
 * not enough to interrupt whatever the user is doing.
 */
export function StatusLine({ status }: { status: SessionStatus }) {
  return (
    <p className={`${styles.line} ${styles[status.kind]}`} role="status" aria-live="polite">
      {status.message}
    </p>
  )
}
