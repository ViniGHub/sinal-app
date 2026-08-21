import { useMicLevel } from '../hooks/useMicLevel'
import { useSession } from '../hooks/useMesh'
import styles from './ControlBar.module.css'
import { MicMeter } from './MicMeter'

interface ControlBarProps {
  micStream: MediaStream | null
  micMuted: boolean
  sharing: boolean
  chatOpen: boolean
  unreadCount: number
  onToggleChat: () => void
}

export function ControlBar({
  micStream,
  micMuted,
  sharing,
  chatOpen,
  unreadCount,
  onToggleChat,
}: ControlBarProps) {
  const session = useSession()
  const level = useMicLevel(micStream, micMuted)
  const hasMic = micStream !== null

  return (
    <div className={styles.bar}>
      <button
        type="button"
        className={`${styles.button} ${micMuted ? styles.muted : styles.live}`}
        onClick={() => session.setMicMuted(!micMuted)}
        disabled={!hasMic}
        aria-pressed={micMuted}
        title={hasMic ? undefined : 'nenhum microfone disponível'}
      >
        <span>{hasMic ? (micMuted ? 'Mic mudo' : 'Mic ativo') : 'Sem microfone'}</span>
        <MicMeter level={level} muted={micMuted} />
      </button>

      <button
        type="button"
        className={`${styles.button} ${sharing ? styles.sharing : ''}`}
        onClick={() => session.toggleSharing()}
        aria-pressed={sharing}
      >
        {sharing ? 'Parar compartilhamento' : 'Compartilhar tela'}
      </button>

      <button
        type="button"
        className={styles.button}
        onClick={onToggleChat}
        aria-pressed={chatOpen}
        aria-label={`Mensagens${unreadCount ? `, ${unreadCount} não lidas` : ''}`}
      >
        <span>Mensagens</span>
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount}</span>}
      </button>
    </div>
  )
}
