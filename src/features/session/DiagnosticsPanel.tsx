import { useEffect, useRef, useSyncExternalStore } from 'react'

import { useCopy } from '@/shared/hooks/useCopy'
import { diagnostics, formatAt } from '@/shared/diagnostics'
import styles from './DiagnosticsPanel.module.css'

interface DiagnosticsPanelProps {
  open: boolean
  onClose: () => void
}

/**
 * What the connection layer has been doing, in order.
 *
 * The copy button is the point of the whole panel: it turns "não aparece
 * ninguém" into a transcript someone can read, without needing the failing
 * browser in front of them.
 */
export function DiagnosticsPanel({ open, onClose }: DiagnosticsPanelProps) {
  const entries = useSyncExternalStore(
    diagnostics.subscribe,
    diagnostics.getSnapshot,
    diagnostics.getSnapshot,
  )
  const [copied, copy] = useCopy()
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' })
  }, [entries, open])

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <aside className={styles.panel} aria-label="Diagnóstico">
      <header className={styles.head}>
        <span>diagnóstico</span>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => copy(diagnostics.toText())}
            disabled={entries.length === 0}
          >
            {copied ? 'copiado' : 'copiar'}
          </button>
          <button
            type="button"
            className={styles.ghost}
            onClick={() => diagnostics.clear()}
            disabled={entries.length === 0}
          >
            limpar
          </button>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Fechar">
            ×
          </button>
        </div>
      </header>

      <div className={styles.log}>
        {entries.length === 0 ? (
          <p className={styles.hint}>nada registrado ainda.</p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} className={`${styles.entry} ${styles[entry.level]}`}>
              <span className={styles.at}>{formatAt(entry.at)}</span>
              <span className={styles.area}>{entry.area}</span>
              <span className={styles.message}>{entry.message}</span>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      <p className={styles.note}>
        IDs aparecem abreviados — o log pode ser compartilhado sem entregar o acesso a um canal.
      </p>
    </aside>
  )
}
