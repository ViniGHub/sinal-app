import styles from './BootScreen.module.css'

/** Shown while the microphone prompt is open and the session is being built. */
export function BootScreen() {
  return (
    <div className={styles.boot} role="status" aria-live="polite">
      <span className={styles.pulse} aria-hidden="true" />
      <p>preparando sua sessão…</p>
      <small>permita o acesso ao microfone para conversar.</small>
    </div>
  )
}
